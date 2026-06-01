/**
 * curateFindingsV22
 *
 * V2.2 curation pass that runs on top of the normalized V2.1 findings.
 * Pure, deterministic, no I/O.
 *
 * Goals:
 *  - reduce redundancy (chronification > burden, medication_use > triptan
 *    interaction, single-source weather + time pattern),
 *  - hide Voice-event data-quality noise by default,
 *  - rewrite medically unsafe diagnostic phrasing,
 *  - split ME/CFS-"not documented" gap into "PEM details missing" when
 *    ME/CFS scores/levels exist on many days,
 *  - merge & cap data-quality findings,
 *  - cap open questions to the 5 most relevant topics.
 *
 * Bestehende Reports profitieren von der Curation, weil sie nur das
 * Rendering ändert. Eine neue Analyse ist nicht zwingend nötig.
 */
import type { NormalizedAnalysisFinding } from "./normalizeAnalysisFindings";
import { applyOutputPolicy } from "./analysisOutputPolicy";

export interface CurateOptions {
  /** If true, do NOT hide Voice-event data_quality cards. */
  showVoiceQualityNotes?: boolean;
}

export interface CuratedResult {
  findings: NormalizedAnalysisFinding[];
  openQuestions: string[];
  /** Diagnostic: ids of suppressed findings + reason. */
  suppressed: Array<{ id: string; reason: string }>;
}

const MAX_DATA_QUALITY = 3;
const MAX_OPEN_QUESTIONS = 4;
const MAX_STRONGEST = 4;
const MAX_WEAKER = 5;

const SAFETY_REWRITES: Array<[RegExp, string]> = [
  // "erfüllt/erfüllen (die) Kriterien (für|einer|der) chronische(r|n) Migräne"
  [/\berf(?:üllt|üllen)\s+(?:die\s+)?Kriterien(?:\s+(?:für|einer|der))?\s+(?:eine[rn]?\s+)?chronische[rn]?\s+Migräne\b/gi,
    "liegen in einem Bereich, der ärztlich im Hinblick auf eine mögliche chronische Verlaufsform geprüft werden sollte"],
  [/\bKriteri(?:um|en)\s+(?:für\s+)?(?:eine[rn]?\s+)?chronische[rn]?\s+Migräne\b/gi,
    "Hinweis auf eine mögliche chronische Verlaufsform"],
  [/\berf(?:üllt|üllen)\s+(?:die\s+)?Kriterien\b/gi,
    "liegen in einem Bereich, der ärztlich geprüft werden sollte"],
  [/\bbereits\s+bestehende[rn]?\s+chronische[rn]?\s+Migräne\b/gi,
    "ärztlich abklärungsbedürftigen Hinweis auf eine chronische Verlaufsform"],
  [/\b(?:deutet|spricht|hinweis(?:t|en)?)\s+(?:stark\s+)?(?:auf|für)\s+(?:eine[rn]?\s+)?chronische[rn]?\s+Migräne\b/gi,
    "ist ein Hinweis auf eine mögliche chronische Verlaufsform"],
  [/\b(?:ist|sind)\s+chronische\s+Migräne\b/gi,
    "ist vereinbar mit einem Muster, das ärztlich eingeordnet werden sollte"],
  [/\b(?:mögliche\s+)?Diagnose\s+(?:der\s+|einer\s+)?chronische[rn]?\s+Migräne\b/gi,
    "ärztlich abzuklärender Hinweis auf eine mögliche chronische Verlaufsform"],
  [/\bchronische\s+Migräne\s+diagnostiz\w*/gi,
    "ärztlich auf eine mögliche chronische Verlaufsform zu prüfen"],
  // catch any remaining bare "chronische Migräne" — soften to "mögliche chronische Verlaufsform"
  [/\bchronische[rn]?\s+Migräne\b/gi,
    "möglichen chronischen Verlaufsform"],
  // replace bare "Diagnose" (medical-claim wording) with neutral "ärztliche Einordnung"
  [/\b(?:eine\s+)?Diagnose(?:\s+stellen|\s+abklären)?\b/gi,
    "ärztliche Einordnung"],
  // strip misleading "100% Korrelation" wording
  [/\b100\s?%?\s*(?:Korrelation|Übereinstimmung|Trefferquote)\b/gi,
    "auffällige Häufung (Vergleichsbasis schwach)"],
];

function rewriteSafety(text: string | undefined): string | undefined {
  if (!text) return text;
  let out = text;
  for (const [re, repl] of SAFETY_REWRITES) out = out.replace(re, repl);
  return out;
}

function applySafetyRewrites(f: NormalizedAnalysisFinding): NormalizedAnalysisFinding {
  return {
    ...f,
    title: rewriteSafety(f.title) ?? f.title,
    summary: rewriteSafety(f.summary) ?? f.summary,
    reasoning: rewriteSafety(f.reasoning),
    limitations: f.limitations.map((l) => rewriteSafety(l) ?? l),
    recommendedTrackingNext: f.recommendedTrackingNext.map((l) => rewriteSafety(l) ?? l),
    doctorDiscussionPoints: f.doctorDiscussionPoints.map((q) => rewriteSafety(q) ?? q),
  };
}

const isVoiceQualityNoise = (f: NormalizedAnalysisFinding): boolean => {
  if (f.category !== "data_quality") return false;
  const hay = (f.title + " " + f.summary).toLowerCase();
  return /\bvoice[\s-]?event|sprach[\s-]?event|voice[\s-]?eintr/i.test(hay);
};

const isTriptanMention = (f: NormalizedAnalysisFinding): boolean => {
  const hay = (f.title + " " + f.summary + " " + (f.reasoning ?? "")).toLowerCase();
  return /triptan/.test(hay);
};

const isWeatherFinding = (f: NormalizedAnalysisFinding) => f.category === "weather";
const isTimePattern = (f: NormalizedAnalysisFinding) => f.category === "time_pattern";
const isBurden = (f: NormalizedAnalysisFinding) => f.category === "burden";
const isChronification = (f: NormalizedAnalysisFinding) => f.category === "chronification";
const isMedUse = (f: NormalizedAnalysisFinding) => f.category === "medication_use";
const isInteraction = (f: NormalizedAnalysisFinding) => f.category === "interaction";

const evidenceRank: Record<NormalizedAnalysisFinding["evidenceLevel"], number> = {
  high: 3, moderate: 2, low: 1, insufficient: 0,
};

function pickBest<T extends NormalizedAnalysisFinding>(items: T[]): T | null {
  if (items.length === 0) return null;
  return [...items].sort((a, b) => evidenceRank[b.evidenceLevel] - evidenceRank[a.evidenceLevel])[0];
}

/**
 * Returns ME/CFS day count from the V2.1 data_basis if present.
 * Used to decide whether "ME/CFS nicht dokumentiert" should be rewritten
 * to a PEM-details gap.
 */
function getMecfsDays(responseJson: unknown): number {
  if (!responseJson || typeof responseJson !== "object") return 0;
  const v21 = (responseJson as any).analysisV21;
  const d = v21?.data_basis?.mecfs_energy_days;
  return typeof d === "number" && isFinite(d) ? d : 0;
}

function getDocumentedDays(responseJson: unknown): number {
  if (!responseJson || typeof responseJson !== "object") return 0;
  const d = (responseJson as any)?.analysisV21?.data_basis?.documented_days;
  return typeof d === "number" && isFinite(d) ? d : 0;
}

/**
 * Returns the share of pain-days over documented-days from V2.1 data_basis.
 * Used to mark weather findings as insufficient when there are almost no
 * pain-free comparison days.
 */
function getPainRatio(responseJson: unknown): number {
  if (!responseJson || typeof responseJson !== "object") return 0;
  const db = (responseJson as any)?.analysisV21?.data_basis ?? {};
  const pain = Number(db.pain_days);
  const documented = Number(db.documented_days);
  if (!isFinite(pain) || !isFinite(documented) || documented <= 0) return 0;
  return pain / documented;
}

function rewriteMecfsGap(
  f: NormalizedAnalysisFinding,
  mecfsDays: number,
  documentedDays: number,
): NormalizedAnalysisFinding {
  if (f.category !== "mecfs_energy_pem") return f;
  if (f.evidenceLevel !== "insufficient") return f;
  if (mecfsDays < 10) return f;
  const txt = (f.title + " " + f.summary).toLowerCase();
  if (!/nicht\s+(?:ausreichend\s+)?dokumentiert|keine\s+ausreichend|mangelnde/i.test(txt)) return f;
  const ofDays = documentedDays > 0 ? ` von ${documentedDays}` : "";
  return {
    ...f,
    title: "ME/CFS- und Energie-Signale",
    summary:
      `An ${mecfsDays}${ofDays} Tagen wurden ME/CFS- oder Energie-Signale dokumentiert. ` +
      `Das kann für die Gesamtbelastung relevant sein.`,
    reasoning: "Ein klarer PEM-Zusammenhang lässt sich daraus nicht sicher ableiten.",
    evidenceLevel: "moderate",
    pinToTopical: true,
    limitations: [],
    recommendedTrackingNext: [],
  };
}

/** Categories that always belong in their topical section, never strongest/weaker. */
const TOPICAL_ONLY_CATEGORIES = new Set([
  "medication_use",
  "medication_effect",
  "preventive_course",
  "weather",
  "mecfs_energy_pem",
  "sleep",
  "stress_mood",
  "lifestyle_triggers",
  "symptoms_aura",
  "cycle_hormonal",
  "time_pattern",
  "interaction",
  // Phase 1 — trend categories belong into "Verlauf & Veränderung",
  // not into "Auffälligste Hinweise" / "Weitere Zusammenhänge".
  "course_trend",
  "medication_trend",
  "mecfs_energy_trend",
]);

const LOCALIZATION_RE = /\b(stirn|nacken|schl(?:ä|ae)fe|hinterkopf|lokalisation|schmerzort)/i;

function isLocalizationSymptom(f: NormalizedAnalysisFinding): boolean {
  if (f.category !== "symptoms_aura") return false;
  return LOCALIZATION_RE.test(f.title + " " + f.summary);
}

/**
 * Demote weather findings when there are almost no pain-free comparison
 * days (pain_days / documented_days > 0.9). Caveat-phrasing applied,
 * evidence clamped to insufficient.
 */
function adjustWeatherForLowComparisonBase(
  f: NormalizedAnalysisFinding,
  painRatio: number,
): NormalizedAnalysisFinding {
  if (f.category !== "weather") return f;
  if (painRatio <= 0.85) return f;
  return {
    ...f,
    // Use "low" instead of "insufficient" so the badge reads "schwacher Hinweis"
    // rather than the harsh "Daten nicht ausreichend" — data IS there, the
    // comparison base is just thin.
    evidenceLevel: "low",
    summary:
      "Wetter kann in diesem Zeitraum eher als möglicher Verstärkungsfaktor betrachtet werden. " +
      "Ein klarer Auslöser lässt sich daraus nicht ableiten.",
    limitations: [
      "Wetter ist mehrdimensional; einzelne Variablen sind selten alleinige Auslöser.",
    ],
    recommendedTrackingNext: [
      "Subjektive Wetterempfindungen wie Hitze, Gewitter, Druckgefühl oder Wetterwechsel kurz notieren.",
    ],
    // remove doctor-questions so weather is not pushed into open questions
    doctorDiscussionPoints: [],
  };
}

/** Merge burden + chronification into a single strong burden card on very high pain rate. */
const HIGH_PAIN_RATIO = 0.85;

function mergeBurdenWithChronification(
  curated: NormalizedAnalysisFinding[],
  responseJson: unknown,
  painRatio: number,
  suppressed: Array<{ id: string; reason: string }>,
): NormalizedAnalysisFinding[] {
  if (painRatio < HIGH_PAIN_RATIO) return curated;
  const burdens = curated.filter((f) => f.category === "burden");
  const chronif = curated.filter((f) => f.category === "chronification");
  if (burdens.length === 0 && chronif.length === 0) return curated;

  const db = (responseJson as any)?.analysisV21?.data_basis ?? {};
  const painDays = Number(db.pain_days) || 0;
  const docDays = Number(db.documented_days) || 0;
  const dayPart = painDays > 0 && docDays > 0 ? `Im beobachteten Zeitraum traten an ${painDays} von ${docDays} Tagen Schmerzen auf. ` : "";

  const primary = burdens[0] ?? chronif[0];
  const merged: NormalizedAnalysisFinding = {
    id: primary?.id ?? "burden.merged",
    category: "burden",
    section: "strongest",
    title: "Sehr hohe Schmerzlast im gesamten Zeitraum",
    evidenceLevel: "high",
    summary:
      `${dayPart}Das zeigt eine sehr hohe Belastung und sollte ärztlich eingeordnet werden.`.trim(),
    reasoning: primary?.reasoning,
    limitations: [
      "Ohne vollständige Dokumentation kann die tatsächliche Last höher oder niedriger sein.",
    ],
    recommendedTrackingNext: [],
    doctorDiscussionPoints: [
      "Hohe Kopfschmerzfrequenz und mögliche chronische Verlaufsform ärztlich besprechen.",
    ],
    source: primary?.source ?? "deterministic",
    shouldShowInDoctorShare: true,
  };

  for (const f of [...burdens, ...chronif]) {
    if (f.id !== merged.id) suppressed.push({ id: f.id, reason: "burden_chronification_merged" });
  }

  const dropIds = new Set<string>([...burdens.map((f) => f.id), ...chronif.map((f) => f.id)]);
  const out = curated.filter((f) => !dropIds.has(f.id));
  out.push(merged);
  return out;
}

/**
 * When a friendly "Dokumentationsfazit" exists (id=data_quality.diary_coverage,
 * evidence low/moderate = solid/good tone), suppress any other data_quality
 * findings whose content reads like a "Mangel" / "fehlend" / "unzureichend"
 * card. Only the positive summary remains in the section.
 */
const NEGATIVE_DQ_RE =
  /\b(mangel|mangelnde|unzureichend|fehlend(?:e[rsn]?)?|kein(?:e[rsn]?)?\s+ausreichend|zu\s+wenig\s+(?:detail|schmerzfrei|vergleichstage)|datenlage\s+(?:zu|für)\s+\w+\s+macht\s+(?:die\s+)?analyse\s+unmöglich)/i;

function suppressNegativeDataQualityWhenFriendlySummary(
  curated: NormalizedAnalysisFinding[],
  suppressed: Array<{ id: string; reason: string }>,
): NormalizedAnalysisFinding[] {
  const friendly = curated.find(
    (f) =>
      f.category === "data_quality" &&
      (f.id === "data_quality.diary_coverage" || /dokumentationsfazit|dokumentationsgrundlage|gute\s+dokumentation/i.test(f.title)) &&
      (f.evidenceLevel === "moderate" || f.evidenceLevel === "low"),
  );
  if (!friendly) return curated;
  return curated.filter((f) => {
    if (f.category !== "data_quality") return true;
    if (f.id === friendly.id) return true;
    const hay = `${f.title} ${f.summary}`;
    if (NEGATIVE_DQ_RE.test(hay)) {
      suppressed.push({ id: f.id, reason: "documentation_summary_supersedes" });
      return false;
    }
    return true;
  });
}

const OPEN_QUESTION_EXCLUDE_RE =
  /\b(nacken|stirn|schl(?:ä|ae)fe|hinterkopf|lokalisation|schmerzort|patient(?:en|in)?|muss\s+ausgeschlossen|differential[\s-]?diagnos|ausschluss\s+(?:einer|eines)|schmerzlast|chronifizierung)\b/i;

export function curateFindingsV22(
  findings: NormalizedAnalysisFinding[],
  responseJson?: unknown,
  options: CurateOptions = {},
): CuratedResult {
  const suppressed: Array<{ id: string; reason: string }> = [];
  const mecfsDays = getMecfsDays(responseJson);
  const documentedDays = getDocumentedDays(responseJson);
  const painRatio = getPainRatio(responseJson);

  // 0) Drop red_flag findings completely — they should never render as a card.
  let curated = findings.filter((f) => {
    if (f.category === "red_flag") {
      suppressed.push({ id: f.id, reason: "red_flag_hidden" });
      return false;
    }
    return true;
  });

  // 1) Safety rewrite + ME/CFS gap rewrite + weather over-correlation guard
  curated = curated
    .map(applySafetyRewrites)
    .map((f) => rewriteMecfsGap(f, mecfsDays, documentedDays))
    .map((f) => adjustWeatherForLowComparisonBase(f, painRatio));

  // 1b) Pin localization-only symptoms_aura to topical "Symptome & Aura"
  curated = curated.map((f) => {
    if (!isLocalizationSymptom(f)) return f;
    return {
      ...f,
      pinToTopical: true,
      title: "Häufige Schmerzorte",
      summary: "Stirn/Nacken sind häufig dokumentierte Schmerzorte.",
      // Don't push localization into open questions
      doctorDiscussionPoints: [],
    };
  });

  // 1c) Pin all topical-only categories to their topical section so they
  // never appear in "Auffälligste Hinweise" / "Weitere Zusammenhänge".
  // chronification & burden stay routed by evidence level (→ strongest/weaker).
  curated = curated.map((f) => {
    if (f.pinToTopical) return f;
    if (TOPICAL_ONLY_CATEGORIES.has(f.category)) return { ...f, pinToTopical: true };
    return f;
  });

  // 2) Voice noise suppression
  if (!options.showVoiceQualityNotes) {
    curated = curated.filter((f) => {
      if (isVoiceQualityNoise(f)) {
        suppressed.push({ id: f.id, reason: "voice_quality_noise" });
        return false;
      }
      return true;
    });
  }

  // 3) Chronification > Burden — drop low-evidence burden if chronification (high/mod) exists
  const hasStrongChronification = curated.some(
    (f) => isChronification(f) && (f.evidenceLevel === "high" || f.evidenceLevel === "moderate"),
  );
  if (hasStrongChronification) {
    curated = curated.filter((f) => {
      if (isBurden(f) && (f.evidenceLevel === "low" || f.evidenceLevel === "moderate")) {
        suppressed.push({ id: f.id, reason: "burden_dedup_by_chronification" });
        return false;
      }
      return true;
    });
  }

  // 4) Medication use > Triptan interaction
  const hasStrongTriptanMedUse = curated.some(
    (f) => isMedUse(f) && isTriptanMention(f) &&
      (f.evidenceLevel === "high" || f.evidenceLevel === "moderate"),
  );
  if (hasStrongTriptanMedUse) {
    curated = curated.filter((f) => {
      if (isInteraction(f) && isTriptanMention(f)) {
        suppressed.push({ id: f.id, reason: "interaction_dedup_by_medication_use" });
        return false;
      }
      return true;
    });
  }

  // 4b) ME/CFS dedup — keep only the SINGLE most informative mecfs_energy_pem
  // finding (highest evidence, longer summary wins on tie). All others are
  // dropped so the topical "ME/CFS & Energie" block stays compact.
  const mecfsItems = curated.filter((f) => f.category === "mecfs_energy_pem");
  if (mecfsItems.length > 1) {
    const best = [...mecfsItems].sort((a, b) => {
      const e = evidenceRank[b.evidenceLevel] - evidenceRank[a.evidenceLevel];
      if (e !== 0) return e;
      return (b.summary?.length ?? 0) - (a.summary?.length ?? 0);
    })[0];
    curated = curated.filter((f) => {
      if (f.category !== "mecfs_energy_pem") return true;
      if (f.id === best.id) return true;
      suppressed.push({ id: f.id, reason: "mecfs_topic_dedup" });
      return false;
    });
  }

  // 4b-ii) Stable / low-value trends must not surface as highlights.
  // course_trend / medication_trend / mecfs_energy_trend with direction
  // "unchanged" (here: title containing "stabil", "ähnlich", "bleibt …" or
  // mecfs "seltener dokumentiert") are pinned to their topical section only.
  const STABLE_TREND_RE =
    /\b(stabil|bleibt\s+(?:ähnlich|hoch|niedrig)|im\s+verlauf\s+stabil|weitgehend\s+stabil|ähnlich|unverändert|seltener\s+dokumentiert)\b/i;
  curated = curated.map((f) => {
    if (
      (f.category === "course_trend" ||
        f.category === "medication_trend" ||
        f.category === "mecfs_energy_trend") &&
      STABLE_TREND_RE.test(f.title)
    ) {
      return { ...f, pinToTopical: true };
    }
    return f;
  });

  // 4b-iii) Weather low-evidence gating — weather findings at evidence "low"
  // without a subjective marker (Hitze/Gewitter/Druckgefühl/Wetterwechsel)
  // and without a clear correlation phrase are dropped entirely so they
  // never reach Highlights or Details.
  const WEATHER_SUBJECTIVE_RE = /\b(hitze|gewitter|druckgef[üu]hl|wetterwechsel|f[öo]hn|schw[üu]le)\b/i;
  const WEATHER_CLEAR_LINK_RE = /\b(zusammenhang|korreliert|h[äa]ufung|verstärkt|verschlechter|verstärkungsfaktor|fallen\s+mit\s+schmerztagen)\b/i;
  curated = curated.filter((f) => {
    if (f.category !== "weather") return true;
    if (f.evidenceLevel === "high" || f.evidenceLevel === "moderate") return true;
    const hay = `${f.title} ${f.summary}`;
    if (WEATHER_SUBJECTIVE_RE.test(hay) || WEATHER_CLEAR_LINK_RE.test(hay)) return true;
    suppressed.push({ id: f.id, reason: "weather_low_no_practical_link" });
    return false;
  });


  // 4c) High-pain merge — collapse burden + chronification into a single,
  // strong, non-diagnostic "Sehr hohe Schmerzlast" card at painRatio ≥ 0.85.
  curated = mergeBurdenWithChronification(curated, responseJson, painRatio, suppressed);

  // 4d) Documentation summary supersedes negative data_quality cards
  // ("Mangel an …", "fehlende schmerzfreie Vergleichstage", "unzureichend …").
  curated = suppressNegativeDataQualityWhenFriendlySummary(curated, suppressed);

  // 5) Weather single-source — keep best, drop rest
  const weatherItems = curated.filter(isWeatherFinding);
  if (weatherItems.length > 1) {
    const best = pickBest(weatherItems);
    curated = curated.filter((f) => {
      if (!isWeatherFinding(f) || f.id === best?.id) return true;
      suppressed.push({ id: f.id, reason: "weather_single_source" });
      return false;
    });
  }

  // 6) Time pattern single-source
  const timeItems = curated.filter(isTimePattern);
  if (timeItems.length > 1) {
    const best = pickBest(timeItems);
    curated = curated.filter((f) => {
      if (!isTimePattern(f) || f.id === best?.id) return true;
      suppressed.push({ id: f.id, reason: "time_pattern_single_source" });
      return false;
    });
  }

  // 7) Data-quality merge & cap (3): rank by evidence, keep top 3, drop the rest
  const dqAll = curated.filter((f) => f.category === "data_quality");
  if (dqAll.length > MAX_DATA_QUALITY) {
    const keep = new Set(
      [...dqAll]
        .sort((a, b) => evidenceRank[b.evidenceLevel] - evidenceRank[a.evidenceLevel])
        .slice(0, MAX_DATA_QUALITY)
        .map((f) => f.id),
    );
    curated = curated.filter((f) => {
      if (f.category !== "data_quality") return true;
      if (keep.has(f.id)) return true;
      suppressed.push({ id: f.id, reason: "data_quality_cap" });
      return false;
    });
  }

  // 8) Open questions: deduplicated + cap to 5, no data_quality items,
  // and excluding low-priority topics (localization, weather when demoted).
  const seen = new Set<string>();
  const openQuestions: string[] = [];
  const prioritized = [...curated].sort(
    (a, b) => evidenceRank[b.evidenceLevel] - evidenceRank[a.evidenceLevel],
  );
  for (const f of prioritized) {
    if (f.category === "data_quality") continue;
    // Skip questions for findings that were demoted to insufficient on
    // weather (we already cleared their doctorDiscussionPoints, but be safe).
    if (f.category === "weather" && f.evidenceLevel === "insufficient") continue;
    for (const q of f.doctorDiscussionPoints) {
      const k = q.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80);
      if (!k || seen.has(k)) continue;
      if (OPEN_QUESTION_EXCLUDE_RE.test(k)) continue;
      seen.add(k);
      openQuestions.push(q);
      if (openQuestions.length >= MAX_OPEN_QUESTIONS) break;
    }
    if (openQuestions.length >= MAX_OPEN_QUESTIONS) break;
  }

  // 9) Inject friendly "Gute Dokumentationsgrundlage" data_quality card
  // when documentation coverage is good (≥ 80% of the analysed period
  // AND ≥ 14 documented days). Skip if a friendly card already exists.
  curated = injectFriendlyDocSummaryIfNeeded(curated, responseJson, suppressed);

  // 9b) When friendly summary is present: collapse the documentation
  // section to a single card (drop all other data_quality findings) and
  // scrub noisy "Nächste Dokumentation"-items everywhere — the product
  // goal is "easy to document", not a homework list.
  const friendlyId = "data_quality.diary_coverage";
  const friendlyPresent = curated.some(
    (f) => f.category === "data_quality" && f.id === friendlyId,
  );
  if (friendlyPresent) {
    curated = curated.filter((f) => {
      if (f.category !== "data_quality") return true;
      if (f.id === friendlyId) return true;
      suppressed.push({ id: f.id, reason: "documentation_summary_supersedes_all_dq" });
      return false;
    });
    curated = curated.map((f) =>
      f.id === friendlyId ? f : stripAllTrackingItems(f),
    );
  }

  // 10) FINAL POLICY GUARD — single source of truth for banned content.
  // Runs after all curation so no LLM/stored/legacy finding can leak
  // forbidden wording (weather coverage counts, voice events,
  // "schmerzfreie Vergleichstage", diagnose wording, …) into UI or report.
  const hasFriendlyDocSummary = friendlyPresent;
  const policy = applyOutputPolicy(curated, openQuestions, { hasFriendlyDocSummary });
  for (const r of policy.removed) suppressed.push(r);

  return { findings: policy.findings, openQuestions: policy.openQuestions, suppressed };
}

/**
 * Patterns for "Nächste Dokumentation" items that we suppress when the
 * user already has a good documentation routine. Keeps the analysis from
 * reading like a homework list.
 */
const NOISY_TRACKING_RE =
  /\b(einnahmezeitpunkt|zeitpunkt\s+der\s+(?:medikamenten?einnahme|einnahme)|schmerzbeginn|innerhalb\s+der\s+ersten\s+stunde|wirkung\s+nach\s+\d|schmerzreduktion\s+in\s*%|prozent\s+schmerzreduktion|t[aä]gliche[rsn]?\s+(?:schlafqualit[aä]t|stresslevel|energielevel)|detaillierte[rn]?\s+pem|sprach(?:notiz|ereignis)|wetterdaten|schmerzfreie[rn]?\s+tage|wirksamkeit\s+der\s+medikamente)/i;

function scrubNoisyTrackingItems(
  f: NormalizedAnalysisFinding,
): NormalizedAnalysisFinding {
  const cleaned = f.recommendedTrackingNext.filter((t) => !NOISY_TRACKING_RE.test(t));
  if (cleaned.length === f.recommendedTrackingNext.length) return f;
  return { ...f, recommendedTrackingNext: cleaned };
}

/**
 * When the user has a good documentation routine, drop ALL
 * "Nächste Dokumentation"-items from non-data_quality findings.
 * The product goal is "App informiert, nicht Aufgaben verteilen" —
 * only the Dokumentationsfazit keeps a single "Routine beibehalten"-Hinweis.
 */
function stripAllTrackingItems(
  f: NormalizedAnalysisFinding,
): NormalizedAnalysisFinding {
  if (f.recommendedTrackingNext.length === 0) return f;
  return { ...f, recommendedTrackingNext: [] };
}

function getPeriodLengthDays(responseJson: unknown): number {
  const period = (responseJson as any)?.analysisV21?.period;
  const from = period?.from;
  const to = period?.to;
  if (typeof from !== "string" || typeof to !== "string") return 0;
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (!isFinite(a) || !isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

function injectFriendlyDocSummaryIfNeeded(
  curated: NormalizedAnalysisFinding[],
  responseJson: unknown,
  _suppressed: Array<{ id: string; reason: string }>,
): NormalizedAnalysisFinding[] {
  const docDays = getDocumentedDays(responseJson);
  const periodLen = getPeriodLengthDays(responseJson);
  if (docDays < 14 || periodLen <= 0) return curated;
  const coverage = docDays / periodLen;
  // Schwelle bewusst auf ≥ 80 % gesenkt — siehe Produktziel "Einfach dokumentieren".
  if (coverage < 0.8) return curated;
  const existingIdx = curated.findIndex(
    (f) => f.category === "data_quality" && f.id === "data_quality.diary_coverage",
  );
  if (existingIdx >= 0) {
    // Normalize the existing card title so it never reads as a duplicate
    // of the section header "Dokumentationsfazit".
    const ex = curated[existingIdx];
    if (/^dokumentationsfazit$/i.test(ex.title.trim())) {
      const next = [...curated];
      next[existingIdx] = { ...ex, title: "Gute Dokumentationsgrundlage" };
      return next;
    }
    return curated;
  }
  const friendly: NormalizedAnalysisFinding = {
    id: "data_quality.diary_coverage",
    category: "data_quality",
    section: "data_quality",
    title: "Gute Dokumentationsgrundlage",
    evidenceLevel: "moderate",
    summary:
      `Du hast an ${docDays} von ${periodLen} Tagen Einträge dokumentiert. ` +
      `Die Grundlage für Verlauf und Belastung ist dadurch gut.`,
    reasoning:
      "Optionale Zusatzangaben können einzelne Zusammenhänge genauer machen, sind aber keine Voraussetzung für eine hilfreiche Analyse.",
    limitations: [],
    recommendedTrackingNext: [
      "Aktuelle Dokumentationsroutine beibehalten.",
    ],
    doctorDiscussionPoints: [],
    source: "deterministic",
    shouldShowInDoctorShare: true,
  };
  return [...curated, friendly];
}

/**
 * Apply per-section display caps (strongest 4 / weaker 5) on top of the
 * already-grouped sections. Other sections stay uncapped — they are the
 * "Geprüfte Bereiche" cards and are expected to be compact already.
 */
export function applySectionCaps<T extends { evidenceLevel: NormalizedAnalysisFinding["evidenceLevel"] }>(
  section: "strongest" | "weaker" | "data_quality" | string,
  items: T[],
): T[] {
  const cap =
    section === "strongest" ? MAX_STRONGEST
    : section === "weaker" ? MAX_WEAKER
    : section === "data_quality" ? MAX_DATA_QUALITY
    : null;
  if (cap == null || items.length <= cap) return items;
  return [...items]
    .sort((a, b) => evidenceRank[b.evidenceLevel] - evidenceRank[a.evidenceLevel])
    .slice(0, cap);
}

export const __V22_INTERNALS = {
  MAX_DATA_QUALITY, MAX_OPEN_QUESTIONS, MAX_STRONGEST, MAX_WEAKER,
};
