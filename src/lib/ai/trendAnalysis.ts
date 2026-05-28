/**
 * trendAnalysis.ts — deterministic "Verlauf & Veränderung"
 *
 * Pure, no I/O. Mirrored 1:1 in src/lib/ai/trendAnalysis.ts.
 */

export interface TrendDayRecord {
  date: string;             // YYYY-MM-DD
  documented: boolean;
  painMax: number | null;
  acuteMedTaken: boolean;
  triptanTaken: boolean;
  otherAcuteTaken: boolean;
  mecfsSignal: boolean;
  mecfsSevere: boolean;
}

export interface WindowStats {
  label: string;
  fromDate: string;
  toDate: string;
  windowDays: number;
  documentedDays: number;
  headacheDays: number;
  severeDays: number;
  medDays: number;
  triptanDays: number;
  otherAcuteDays: number;
  comboDays: number;
  severeWithoutAcute: number;
  mecfsDays: number;
  severeMecfsDays: number;
}

export type TrendLabel = "increased" | "decreased" | "stable" | "unclear";

export interface MetricTrend {
  metric: string;
  recent: number;
  recentRate: number;
  previous: number;
  previousRate: number;
  absDiff: number;
  rateDiff: number;
  label: TrendLabel;
}

export interface TrendResult {
  hasEnoughData: boolean;
  recent: WindowStats;
  previous: WindowStats;
  metrics: {
    headache: MetricTrend;
    severe: MetricTrend;
    med: MetricTrend;
    triptan: MetricTrend;
    otherAcute: MetricTrend;
    mecfs: MetricTrend;
  };
  plainLanguage: string[];
  triptanStrategyNote: string | null;
  /** Did the data include any triptan signal across both windows? */
  triptanSignalPresent: boolean;
  /**
   * Optional short-term (10 vs 10 days) comparison computed when enough
   * documented days exist. Used to surface recent triptan/medication
   * changes that the longer 15-vs-15 or 30-vs-30 window can hide.
   */
  shortTerm?: {
    recent: WindowStats;
    previous: WindowStats;
    metrics: {
      headache: MetricTrend;
      triptan: MetricTrend;
      med: MetricTrend;
    };
    note: string | null;
  };
}

export const TREND_MIN_DOCUMENTED = 7;
const STABLE_RATE_BAND = 0.10;
const SIGNIFICANT_ABS = 1;

const TRIPTAN_PATTERN = /(triptan|sumatriptan|zolmitriptan|rizatriptan|naratriptan|almotriptan|eletriptan|frovatriptan|imigran|ascotop|maxalt|relpax|allegro|naramig)/i;

export function isTriptanName(name: string | null | undefined): boolean {
  if (!name) return false;
  return TRIPTAN_PATTERN.test(String(name));
}

// ─────────────────────────────────────────────────────────────────────────
// Day-record builder (shared shape for App + Server)
// ─────────────────────────────────────────────────────────────────────────

export interface PainEntryLike {
  selected_date?: string | null;
  pain_level?: string | null;
  medications?: string[] | null;
  me_cfs_severity_score?: number | null;
  me_cfs_severity_level?: string | null;
}
export interface MedIntakeLike {
  taken_date?: string | null;
  taken_at?: string | null;
  medication_name?: string | null;
}

const PAIN_LEVEL_NUM: Record<string, number> = {
  "-": 0, leicht: 2, mittel: 5, stark: 7, sehr_stark: 9,
};
function painNum(level: string | null | undefined): number | null {
  if (!level) return null;
  if (/^\d+$/.test(level)) return parseInt(level, 10);
  if (level in PAIN_LEVEL_NUM) return PAIN_LEVEL_NUM[level];
  return null;
}
function mecfsSeverityToNum(level: string | null | undefined): number {
  if (!level) return 0;
  const l = level.toLowerCase();
  if (l.includes("severe") || l.includes("schwer") || l.includes("crash")) return 4;
  if (l.includes("moderate") || l.includes("mittel")) return 3;
  if (l.includes("mild") || l.includes("leicht")) return 2;
  if (l.includes("trace") || l.includes("gering")) return 1;
  return 0;
}
function dayKey(s: string | null | undefined): string | null {
  if (!s) return null;
  return String(s).slice(0, 10);
}

export interface BuildTrendDaysInput {
  fromDate: string;   // YYYY-MM-DD inclusive
  toDate: string;     // YYYY-MM-DD inclusive
  painEntries: PainEntryLike[];
  medIntakes: MedIntakeLike[];
}

export function buildTrendDaysFromEntries(input: BuildTrendDaysInput): TrendDayRecord[] {
  const { fromDate, toDate, painEntries, medIntakes } = input;
  const days = new Map<string, TrendDayRecord>();

  // Pre-fill every calendar day in range so windows are stable.
  const start = new Date(`${fromDate}T00:00:00Z`).getTime();
  const end = new Date(`${toDate}T00:00:00Z`).getTime();
  for (let t = start; t <= end; t += 86_400_000) {
    const d = new Date(t).toISOString().slice(0, 10);
    days.set(d, {
      date: d,
      documented: false,
      painMax: null,
      acuteMedTaken: false,
      triptanTaken: false,
      otherAcuteTaken: false,
      mecfsSignal: false,
      mecfsSevere: false,
    });
  }

  for (const p of painEntries) {
    const k = dayKey(p.selected_date);
    if (!k || !days.has(k)) continue;
    const rec = days.get(k)!;
    rec.documented = true;
    const pm = painNum(p.pain_level);
    if (pm !== null) {
      rec.painMax = rec.painMax === null ? pm : Math.max(rec.painMax, pm);
    }
    // Per-entry medications array (legacy)
    if (Array.isArray(p.medications)) {
      for (const m of p.medications) {
        if (typeof m !== "string" || !m.trim()) continue;
        rec.acuteMedTaken = true;
        if (isTriptanName(m)) rec.triptanTaken = true;
        else rec.otherAcuteTaken = true;
      }
    }
    const mecfsScore = typeof p.me_cfs_severity_score === "number"
      ? p.me_cfs_severity_score
      : mecfsSeverityToNum(p.me_cfs_severity_level);
    if (mecfsScore > 0) {
      rec.mecfsSignal = true;
      if (mecfsScore >= 3) rec.mecfsSevere = true;
    }
  }

  for (const m of medIntakes) {
    const k = dayKey(m.taken_date ?? m.taken_at);
    if (!k || !days.has(k)) continue;
    const rec = days.get(k)!;
    rec.documented = true;
    rec.acuteMedTaken = true;
    if (isTriptanName(m.medication_name)) rec.triptanTaken = true;
    else rec.otherAcuteTaken = true;
  }

  return Array.from(days.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// ─────────────────────────────────────────────────────────────────────────
// Window selection
// ─────────────────────────────────────────────────────────────────────────

export function selectWindows(days: TrendDayRecord[]): {
  recent: TrendDayRecord[]; previous: TrendDayRecord[];
  recentLabel: string; previousLabel: string;
} | null {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const n = sorted.length;
  if (n < 14) return null;
  if (n <= 35) {
    const halfLen = Math.floor(n / 2);
    return {
      previous: sorted.slice(0, halfLen),
      recent: sorted.slice(n - halfLen),
      previousLabel: "erste Hälfte des Zeitraums",
      recentLabel: "zweite Hälfte des Zeitraums",
    };
  }
  if (n <= 120) {
    return {
      previous: sorted.slice(-60, -30),
      recent: sorted.slice(-30),
      previousLabel: "vorige 30 Tage",
      recentLabel: "letzte 30 Tage",
    };
  }
  return {
    previous: sorted.slice(-60, -30),
    recent: sorted.slice(-30),
    previousLabel: "vorheriger Monat",
    recentLabel: "letzter Monat",
  };
}

export function computeWindowStats(days: TrendDayRecord[], label: string): WindowStats {
  const windowDays = days.length;
  const fromDate = days[0]?.date ?? "";
  const toDate = days[windowDays - 1]?.date ?? "";
  let documentedDays = 0, headacheDays = 0, severeDays = 0, medDays = 0;
  let triptanDays = 0, otherAcuteDays = 0, comboDays = 0, severeWithoutAcute = 0;
  let mecfsDays = 0, severeMecfsDays = 0;
  for (const d of days) {
    if (!d.documented) continue;
    documentedDays++;
    const pm = d.painMax ?? 0;
    if (pm >= 3) headacheDays++;
    if (pm >= 7) severeDays++;
    if (d.acuteMedTaken) medDays++;
    if (d.triptanTaken) triptanDays++;
    if (d.otherAcuteTaken) otherAcuteDays++;
    if (d.triptanTaken && d.otherAcuteTaken) comboDays++;
    if (pm >= 7 && !d.acuteMedTaken) severeWithoutAcute++;
    if (d.mecfsSignal) mecfsDays++;
    if (d.mecfsSevere) severeMecfsDays++;
  }
  return { label, fromDate, toDate, windowDays, documentedDays, headacheDays, severeDays, medDays, triptanDays, otherAcuteDays, comboDays, severeWithoutAcute, mecfsDays, severeMecfsDays };
}

function metric(name: string, recent: number, recentDoc: number, previous: number, previousDoc: number): MetricTrend {
  const recentRate = recentDoc > 0 ? recent / recentDoc : 0;
  const previousRate = previousDoc > 0 ? previous / previousDoc : 0;
  const rateDiff = recentRate - previousRate;
  const absDiff = recent - previous;
  let label: TrendLabel;
  if (Math.abs(rateDiff) < STABLE_RATE_BAND) label = "stable";
  else if (rateDiff <= -STABLE_RATE_BAND && Math.abs(absDiff) >= SIGNIFICANT_ABS) label = "decreased";
  else if (rateDiff >= STABLE_RATE_BAND && Math.abs(absDiff) >= SIGNIFICANT_ABS) label = "increased";
  else label = "unclear";
  return {
    metric: name, recent,
    recentRate: Math.round(recentRate * 1000) / 1000,
    previous,
    previousRate: Math.round(previousRate * 1000) / 1000,
    absDiff, rateDiff: Math.round(rateDiff * 1000) / 1000, label,
  };
}

export function computeTrendAnalysis(days: TrendDayRecord[]): TrendResult | null {
  const sel = selectWindows(days);
  if (!sel) return null;
  const recent = computeWindowStats(sel.recent, sel.recentLabel);
  const previous = computeWindowStats(sel.previous, sel.previousLabel);
  const hasEnoughData =
    recent.documentedDays >= TREND_MIN_DOCUMENTED &&
    previous.documentedDays >= TREND_MIN_DOCUMENTED;
  const metrics = {
    headache: metric("headache_days", recent.headacheDays, recent.documentedDays, previous.headacheDays, previous.documentedDays),
    severe: metric("severe_days", recent.severeDays, recent.documentedDays, previous.severeDays, previous.documentedDays),
    med: metric("med_days", recent.medDays, recent.documentedDays, previous.medDays, previous.documentedDays),
    triptan: metric("triptan_days", recent.triptanDays, recent.documentedDays, previous.triptanDays, previous.documentedDays),
    otherAcute: metric("other_acute_days", recent.otherAcuteDays, recent.documentedDays, previous.otherAcuteDays, previous.documentedDays),
    mecfs: metric("mecfs_days", recent.mecfsDays, recent.documentedDays, previous.mecfsDays, previous.documentedDays),
  };
  const triptanSignalPresent = recent.triptanDays + previous.triptanDays > 0;
  const plain: string[] = [];
  if (hasEnoughData) {
    plain.push(painSentence(metrics.headache, recent, previous));
    plain.push(medSentence(metrics.med, metrics.triptan, triptanSignalPresent, recent, previous));
    plain.push(mecfsSentence(metrics.mecfs, recent, previous));
  } else {
    plain.push("Für eine belastbare Trendbewertung ist der Zeitraum zu kurz. Mit längerer Dokumentation werden Verläufe sichtbar.");
  }
  let triptanStrategyNote: string | null = null;
  if (
    hasEnoughData &&
    triptanSignalPresent &&
    metrics.triptan.label === "decreased" &&
    metrics.severe.label !== "decreased" &&
    metrics.severe.recent >= 1
  ) {
    triptanStrategyNote =
      "Die Triptan-Einnahmen waren zuletzt niedriger, während die Schmerzlast hoch blieb. " +
      "Das spricht eher für eine veränderte Akutstrategie als für eine klare Entlastung.";
    plain.push(triptanStrategyNote);
  }
  return {
    hasEnoughData, recent, previous, metrics,
    plainLanguage: plain.filter(Boolean),
    triptanStrategyNote, triptanSignalPresent,
  };
}

function painSentence(headache: MetricTrend, r: WindowStats, p: WindowStats): string {
  if (headache.label === "stable") return `Die Schmerzlast blieb zuletzt ähnlich (Schmerztage ${r.headacheDays}/${r.documentedDays} vs. zuvor ${p.headacheDays}/${p.documentedDays}).`;
  if (headache.label === "decreased") return `Die Schmerztage gingen zuletzt zurück (${r.headacheDays}/${r.documentedDays} vs. zuvor ${p.headacheDays}/${p.documentedDays}).`;
  if (headache.label === "increased") return `Die Schmerztage nahmen zuletzt zu (${r.headacheDays}/${r.documentedDays} vs. zuvor ${p.headacheDays}/${p.documentedDays}).`;
  return `Die Schmerzlast bleibt insgesamt hoch (Schmerztage ${r.headacheDays}/${r.documentedDays} vs. zuvor ${p.headacheDays}/${p.documentedDays}).`;
}

function medSentence(med: MetricTrend, triptan: MetricTrend, triptanPresent: boolean, r: WindowStats, p: WindowStats): string {
  const pieces: string[] = [];
  if (triptanPresent) {
    if (triptan.label === "decreased") pieces.push(`Triptan-Einnahmen waren zuletzt seltener (${r.triptanDays} vs. ${p.triptanDays} Tage).`);
    else if (triptan.label === "increased") pieces.push(`Triptan-Einnahmen waren zuletzt häufiger (${r.triptanDays} vs. ${p.triptanDays} Tage).`);
    else pieces.push(`Triptan-Einnahmen blieben stabil (${r.triptanDays} vs. ${p.triptanDays} Tage).`);
  }
  if (med.label === "decreased") pieces.push(`Akutmedikation insgesamt seltener (${r.medDays} vs. ${p.medDays} Tage).`);
  else if (med.label === "increased") pieces.push(`Akutmedikation insgesamt häufiger (${r.medDays} vs. ${p.medDays} Tage).`);
  else if (!triptanPresent) pieces.push(`Akutmedikation insgesamt stabil (${r.medDays} vs. ${p.medDays} Tage).`);
  if (pieces.length === 0) return `Akutmedikation und Triptane blieben im Vergleich stabil.`;
  return pieces.join(" ");
}

function mecfsSentence(m: MetricTrend, r: WindowStats, p: WindowStats): string {
  if (r.mecfsDays === 0 && p.mecfsDays === 0) return "Keine ME/CFS-/Energie-Signale in beiden Vergleichsfenstern dokumentiert.";
  if (m.label === "decreased") return `ME/CFS-/Energie-Signale wurden zuletzt seltener dokumentiert (${r.mecfsDays} vs. ${p.mecfsDays} Tage).`;
  if (m.label === "increased") return `ME/CFS-/Energie-Signale wurden zuletzt häufiger dokumentiert (${r.mecfsDays} vs. ${p.mecfsDays} Tage).`;
  return `ME/CFS-/Energie-Signale blieben im Vergleich stabil (${r.mecfsDays} vs. ${p.mecfsDays} Tage).`;
}
