/**
 * AnalysisV21Sections — V2.2 nutzer-/arztfreundliche Darstellung
 *
 * - Datenbasis kompakt (Zeitraum, Schmerz-, Med.-, ME/CFS-Tage).
 * - Wetterabdeckung nur in „Datenqualität", nicht oben.
 * - Technische Kategorien werden in nutzerfreundliche Labels übersetzt
 *   oder ganz weggelassen.
 * - Karten kompakt: Titel + Badge + Kurztext + optional 1 Arztgesprächspunkt;
 *   Reasoning/Limitations/Tracking nur über „Details anzeigen".
 * - Keine red_flag-Karte; statt dessen ein ruhiger Standardtext in
 *   „Grenzen der Analyse".
 */
import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  normalizeAnalysisFindings,
  groupFindingsBySection,
  getEvidenceBadgeVariant,
  SECTION_ORDER,
  SECTION_LABEL,
  type NormalizedAnalysisFinding,
  type AnalysisSectionKey,
} from "@/lib/ai/normalizeAnalysisFindings";
import { curateFindingsV22, applySectionCaps } from "@/lib/ai/curateFindingsV22";
import { buildAnalysisOverviewSummary } from "@/lib/ai/buildAnalysisOverviewSummary";

const MAX_HIGHLIGHTS = 3;

const STABLE_TREND_TITLE_RE =
  /\b(stabil|bleibt\s+(?:ähnlich|hoch|niedrig)|ähnlich|unverändert|seltener\s+dokumentiert)\b/i;

function isStableTrend(f: NormalizedAnalysisFinding): boolean {
  if (
    f.category !== "course_trend" &&
    f.category !== "medication_trend" &&
    f.category !== "mecfs_energy_trend"
  ) {
    return false;
  }
  return STABLE_TREND_TITLE_RE.test(f.title);
}

/**
 * Picks up to 3 highlight findings for the compact initial view. Priority:
 *  1) high burden / chronification
 *  2) relevant medication/triptan change (short-term trend preferred)
 *  3) one further practically relevant signal (ME/CFS, course trend or
 *     mid/high-evidence weather) — stable/unchanged trends and low-evidence
 *     weather without subjective link are excluded.
 */
function pickTopHighlights(findings: NormalizedAnalysisFinding[]): NormalizedAnalysisFinding[] {
  const out: NormalizedAnalysisFinding[] = [];
  const push = (f?: NormalizedAnalysisFinding) => {
    if (f && !out.some((x) => x.id === f.id)) out.push(f);
  };

  // 1) Schmerzlast
  push(findings.find((f) => f.category === "burden" || f.category === "chronification"));

  // 2) Relevante Akutmedikations-/Triptan-Änderung — Kurzfristtrend bevorzugt
  const triptanShort = findings.find(
    (f) => f.id === "medication_trend.acute_use_short_term" && !isStableTrend(f),
  );
  const medChange = findings.find(
    (f) => f.category === "medication_trend" && !isStableTrend(f),
  );
  push(triptanShort ?? medChange);

  // 3) Ein weiterer wirklich relevanter Hinweis
  const courseChange = findings.find(
    (f) => f.category === "course_trend" && !isStableTrend(f),
  );
  const mecfsHigh = findings.find(
    (f) =>
      f.category === "mecfs_energy_pem" &&
      (f.evidenceLevel === "high" || f.evidenceLevel === "moderate"),
  );
  const weatherStrong = findings.find(
    (f) =>
      f.category === "weather" &&
      (f.evidenceLevel === "high" || f.evidenceLevel === "moderate"),
  );
  const friendlyDoc = findings.find(
    (f) => f.category === "data_quality" && f.id === "data_quality.diary_coverage",
  );
  push(courseChange ?? mecfsHigh ?? weatherStrong ?? friendlyDoc);

  return out.filter(Boolean).slice(0, MAX_HIGHLIGHTS);
}

interface Props {
  responseJson: unknown;
  doctorShare?: boolean;
  /** Opt-in: show Voice-event data_quality cards (off by default in V2.2). */
  showVoiceQualityNotes?: boolean;
}

/** Nutzerfreundliche Kategorie-Labels für sichtbare Karten. */
const CATEGORY_USER_LABEL: Record<string, string> = {
  burden: "Krankheitslast",
  chronification: "Krankheitslast",
  medication_use: "Medikamente",
  medication_effect: "Medikamentenwirkung",
  preventive_course: "Medikamente",
  weather: "Wetter & Umwelt",
  mecfs_energy_pem: "ME/CFS & Energie",
  sleep: "Schlaf",
  stress_mood: "Stress",
  lifestyle_triggers: "Alltag",
  symptoms_aura: "Symptome",
  cycle_hormonal: "Zyklus",
  time_pattern: "Zeitmuster",
  interaction: "Interaktionen",
  data_quality: "Dokumentation",
  course_trend: "Verlauf",
  medication_trend: "Medikamenten-Verlauf",
  mecfs_energy_trend: "Energie-Verlauf",
};

/** Sektionen, in denen die Kategorie-Zeile redundant ist und ausgeblendet wird. */
const HIDE_CATEGORY_IN_SECTION = new Set<AnalysisSectionKey>([
  "medication", "weather", "mecfs", "lifestyle", "symptoms", "time",
  "interaction", "data_quality", "course_trend",
]);

const LIMITS_DISCLAIMER =
  "Diese Analyse ersetzt keine ärztliche Beurteilung. Sie zeigt Hinweise aus " +
  "dokumentierten Daten. Bei plötzlich neuartigen, sehr starken oder anhaltenden " +
  "Beschwerden bitte ärztlich abklären lassen.";

export function AnalysisV21Sections({ responseJson, doctorShare = false, showVoiceQualityNotes = false }: Props) {
  const curated = React.useMemo(() => {
    const raw = normalizeAnalysisFindings(responseJson, { doctorShare });
    return curateFindingsV22(raw, responseJson, { showVoiceQualityNotes });
  }, [responseJson, doctorShare, showVoiceQualityNotes]);

  const grouped = React.useMemo(() => groupFindingsBySection(curated.findings), [curated.findings]);
  const openQuestions = curated.openQuestions;

  const v21 = (responseJson as any)?.analysisV21 ?? null;
  const dataBasis = v21?.data_basis as Record<string, unknown> | undefined;
  const period = v21?.period as Record<string, unknown> | undefined;

  const overview = React.useMemo(
    () => buildAnalysisOverviewSummary({ responseJson, findings: curated.findings }),
    [responseJson, curated.findings],
  );

  const highlights = React.useMemo(
    () => pickTopHighlights(curated.findings),
    [curated.findings],
  );

  const [showDetails, setShowDetails] = React.useState(false);

  if (!v21) return null;

  // Weather-coverage card removed by output policy — never inject coverage
  // numbers ("Wetterdaten lagen für X von Y Tagen vor"). Weather is only
  // shown as an inhaltlicher finding, never as a coverage statement.

  return (
    <div className="space-y-7">
      <DataBasisCard dataBasis={dataBasis} period={period} />

      {overview && (
        <Section title="Zusammenfassung">
          <p className="text-[13px] text-foreground/85 leading-[1.75] whitespace-pre-line">
            {overview}
          </p>
        </Section>
      )}

      {highlights.length > 0 && (
        <Section title="Wichtigste Hinweise">
          <div className="space-y-4">
            {highlights.map((f) => (
              <FindingCard key={`hl-${f.id}`} f={f} sectionKey={f.section} />
            ))}
          </div>
        </Section>
      )}

      <div>
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          aria-expanded={showDetails}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-foreground/80 hover:text-foreground transition-colors"
        >
          {showDetails
            ? <><ChevronDown className="h-3.5 w-3.5" />Detaillierte Analyse ausblenden</>
            : <><ChevronRight className="h-3.5 w-3.5" />Detaillierte Analyse anzeigen</>}
        </button>
      </div>

      {showDetails && (
        <div className="space-y-7" data-testid="analysis-details">
          {SECTION_ORDER.map((key) => {
            // "Grenzen der Analyse" → ruhiger Standardtext, keine Karten.
            if (key === "limits") {
              return (
                <Section key={key} title={SECTION_LABEL[key]}>
                  <p className="text-[12px] text-muted-foreground/85 leading-[1.7]">
                    {LIMITS_DISCLAIMER}
                  </p>
                </Section>
              );
            }

            if (key === "open_questions") {
              if (openQuestions.length === 0) return null;
              return (
                <Section key={key} title={SECTION_LABEL[key]}>
                  <ul className="list-disc pl-4 space-y-1 text-[13px] text-foreground/80 leading-[1.7]">
                    {openQuestions.map((q, i) => <li key={i}>{q}</li>)}
                  </ul>
                </Section>
              );
            }

            const highlightIds = new Set(highlights.map((h) => h.id));
            let secItems = dedupSection(grouped[key]);
            if (key === "weaker" || key === "strongest") {
              secItems = secItems.filter((f) => !highlightIds.has(f.id));
            }
            const items = applySectionCaps(key, secItems);
            if (items.length === 0) return null;
            return (
              <Section key={key} title={SECTION_LABEL[key]}>
                <div className="space-y-4">
                  {items.map((f) => <FindingCard key={f.id} f={f} sectionKey={key} />)}
                </div>
              </Section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function dedupSection(items: NormalizedAnalysisFinding[]): NormalizedAnalysisFinding[] {
  const seen = new Set<string>();
  const out: NormalizedAnalysisFinding[] = [];
  for (const f of items) {
    const k = f.category + "::" + f.title.toLowerCase().slice(0, 60);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out;
}

function DataBasisCard({
  dataBasis, period,
}: { dataBasis?: Record<string, unknown>; period?: Record<string, unknown> }) {
  if (!dataBasis && !period) return null;
  const fmt = (d?: unknown) => {
    if (typeof d !== "string") return "—";
    try { return new Date(d).toLocaleDateString("de-DE"); } catch { return d; }
  };
  // Nur nutzerrelevante Felder. Analyseversion, Wettertage, Dokumentierte Tage
  // sind absichtlich hier nicht enthalten.
  const rows: Array<[string, unknown]> = [
    ["Zeitraum", `${fmt(period?.from)} – ${fmt(period?.to)}`],
    ["Schmerztage", dataBasis?.pain_days ?? "—"],
    ["Medikamententage", dataBasis?.medication_intake_days ?? "—"],
    ["ME/CFS- & Energietage", dataBasis?.mecfs_energy_days ?? "—"],
  ];
  return (
    <div className="rounded-lg bg-muted/20 px-4 py-3">
      <h4 className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/80 mb-2">
        Datenbasis
      </h4>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
        {rows.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-foreground/85 text-right tabular-nums">{String(v ?? "—")}</dd>
          </React.Fragment>
        ))}
      </dl>
      <p className="text-[10px] text-muted-foreground/70 mt-2">
        Hinweise aus dokumentierten Daten · keine Diagnose
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/80 mb-3">
        {title}
      </h3>
      {children}
    </section>
  );
}

function truncateToSentences(text: string, maxSentences = 2, maxChars = 240): string {
  if (!text) return "";
  const parts = text.match(/[^.!?]+[.!?]?/g) ?? [text];
  let out = parts.slice(0, maxSentences).join(" ").trim();
  if (out.length > maxChars) out = out.slice(0, maxChars - 1).trimEnd() + "…";
  return out;
}

function FindingCard({ f, sectionKey }: { f: NormalizedAnalysisFinding; sectionKey: AnalysisSectionKey }) {
  const [showDetails, setShowDetails] = React.useState(false);
  const badge = getEvidenceBadgeVariant(f.evidenceLevel);
  const toneClass =
    badge.tone === "strong" ? "bg-primary/10 text-primary"
    : badge.tone === "medium" ? "bg-muted text-foreground/80"
    : badge.tone === "weak" ? "bg-muted/50 text-muted-foreground"
    : "bg-amber-100/60 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200";

  const userCategoryLabel = CATEGORY_USER_LABEL[f.category];
  const showCategory =
    !!userCategoryLabel && !HIDE_CATEGORY_IN_SECTION.has(sectionKey);

  const shortSummary = truncateToSentences(f.summary, 2, 240);
  const primaryDoctorPoint = f.doctorDiscussionPoints[0];
  const additionalDoctorPoints = f.doctorDiscussionPoints.slice(1, 3);

  // 1 reasoning sentence, 1–2 limitations, 1–2 tracking items.
  const reasoningShort = f.reasoning ? truncateToSentences(f.reasoning, 1, 200) : undefined;
  const limitationsShort = f.limitations.slice(0, 2);
  const trackingShort = f.recommendedTrackingNext.slice(0, 2);

  const hasDetails =
    !!reasoningShort
    || limitationsShort.length > 0
    || trackingShort.length > 0
    || additionalDoctorPoints.length > 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-[13px] font-medium text-foreground leading-snug">{f.title}</h4>
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] tracking-wide shrink-0 ${toneClass}`}>
          {badge.label}
        </span>
      </div>
      {showCategory && (
        <p className="text-[12px] text-muted-foreground/70 uppercase tracking-wide">
          {userCategoryLabel}
        </p>
      )}
      <p className="text-[13px] text-foreground/80 leading-[1.7]">{shortSummary}</p>

      {primaryDoctorPoint && (
        <p className="text-[11px] text-muted-foreground/80">
          Für Arztgespräch: {primaryDoctorPoint}
        </p>
      )}

      {hasDetails && (
        <div>
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground/80 transition-colors"
          >
            {showDetails
              ? <><ChevronDown className="h-3 w-3" />Details ausblenden</>
              : <><ChevronRight className="h-3 w-3" />Details anzeigen</>}
          </button>
          {showDetails && (
            <div className="mt-1.5 space-y-1">
              {reasoningShort && (
                <p className="text-[11px] text-muted-foreground/85">
                  Datenbasis: {reasoningShort}
                </p>
              )}
              {limitationsShort.length > 0 && (
                <p className="text-[11px] text-muted-foreground/85">
                  Einschränkung: {limitationsShort.join(" · ")}
                </p>
              )}
              {trackingShort.length > 0 && sectionKey === "data_quality" && (
                <p className="text-[11px] text-muted-foreground/85">
                  Nächste Dokumentation: {trackingShort.join(" · ")}
                </p>
              )}
              {additionalDoctorPoints.length > 0 && (
                <p className="text-[11px] text-muted-foreground/85">
                  Weitere Arztgesprächspunkte: {additionalDoctorPoints.join(" · ")}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
