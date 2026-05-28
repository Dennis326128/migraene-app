// Mirror of supabase/functions/_shared/trendAnalysis.ts — keep in sync.
// Both files are pure, no imports. See server file for full documentation.
export {};

export interface TrendDayRecord {
  date: string;
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
}

export const TREND_MIN_DOCUMENTED = 7;
const STABLE_RATE_BAND = 0.10;
const SIGNIFICANT_ABS = 1;

export function selectWindows(days: TrendDayRecord[]): { recent: TrendDayRecord[]; previous: TrendDayRecord[]; recentLabel: string; previousLabel: string } | null {
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

function metric(name: string, recent: number, recentDocumented: number, previous: number, previousDocumented: number): MetricTrend {
  const recentRate = recentDocumented > 0 ? recent / recentDocumented : 0;
  const previousRate = previousDocumented > 0 ? previous / previousDocumented : 0;
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
  const hasEnoughData = recent.documentedDays >= TREND_MIN_DOCUMENTED && previous.documentedDays >= TREND_MIN_DOCUMENTED;
  const metrics = {
    headache: metric("headache_days", recent.headacheDays, recent.documentedDays, previous.headacheDays, previous.documentedDays),
    severe: metric("severe_days", recent.severeDays, recent.documentedDays, previous.severeDays, previous.documentedDays),
    med: metric("med_days", recent.medDays, recent.documentedDays, previous.medDays, previous.documentedDays),
    triptan: metric("triptan_days", recent.triptanDays, recent.documentedDays, previous.triptanDays, previous.documentedDays),
    otherAcute: metric("other_acute_days", recent.otherAcuteDays, recent.documentedDays, previous.otherAcuteDays, previous.documentedDays),
    mecfs: metric("mecfs_days", recent.mecfsDays, recent.documentedDays, previous.mecfsDays, previous.documentedDays),
  };
  const plain: string[] = [];
  if (hasEnoughData) {
    plain.push(painSentence(metrics.headache, metrics.severe, recent, previous));
    plain.push(medSentence(metrics.med, metrics.triptan, recent, previous));
    plain.push(mecfsSentence(metrics.mecfs, recent, previous));
  } else {
    plain.push("Die Vergleichsfenster sind zu klein für eine belastbare Trendaussage. Mit längerer Dokumentation werden Verläufe sichtbar.");
  }
  let triptanStrategyNote: string | null = null;
  if (hasEnoughData && metrics.triptan.label === "decreased" && metrics.severe.label !== "decreased" && metrics.severe.recent >= 1) {
    triptanStrategyNote =
      "Triptan-Tage sind zuletzt seltener, die Schmerzlast bleibt aber ähnlich hoch. " +
      "Die Daten sprechen eher für eine veränderte Akutstrategie als für eine klare Entlastung.";
    plain.push(triptanStrategyNote);
  }
  return { hasEnoughData, recent, previous, metrics, plainLanguage: plain.filter(Boolean), triptanStrategyNote };
}

function painSentence(headache: MetricTrend, severe: MetricTrend, r: WindowStats, p: WindowStats): string {
  if (headache.label === "stable" && severe.label === "stable") {
    return `Die Schmerzlast blieb zuletzt ähnlich (Schmerztage ${r.headacheDays}/${r.documentedDays} vs. zuvor ${p.headacheDays}/${p.documentedDays}).`;
  }
  if (headache.label === "decreased") {
    return `Die Schmerztage gingen zuletzt zurück (${r.headacheDays}/${r.documentedDays} vs. zuvor ${p.headacheDays}/${p.documentedDays}).`;
  }
  if (headache.label === "increased") {
    return `Die Schmerztage nahmen zuletzt zu (${r.headacheDays}/${r.documentedDays} vs. zuvor ${p.headacheDays}/${p.documentedDays}).`;
  }
  return `Die Schmerzlast bleibt insgesamt hoch (Schmerztage ${r.headacheDays}/${r.documentedDays} vs. zuvor ${p.headacheDays}/${p.documentedDays}).`;
}

function medSentence(med: MetricTrend, triptan: MetricTrend, r: WindowStats, p: WindowStats): string {
  const pieces: string[] = [];
  if (triptan.label === "decreased") pieces.push(`Triptan-Einnahmen waren zuletzt seltener (${r.triptanDays} vs. ${p.triptanDays} Tage).`);
  else if (triptan.label === "increased") pieces.push(`Triptan-Einnahmen waren zuletzt häufiger (${r.triptanDays} vs. ${p.triptanDays} Tage).`);
  else if (triptan.recent + triptan.previous > 0) pieces.push(`Triptan-Einnahmen blieben stabil (${r.triptanDays} vs. ${p.triptanDays} Tage).`);
  if (med.label === "decreased") pieces.push(`Akutmedikation insgesamt seltener (${r.medDays} vs. ${p.medDays} Tage).`);
  else if (med.label === "increased") pieces.push(`Akutmedikation insgesamt häufiger (${r.medDays} vs. ${p.medDays} Tage).`);
  if (pieces.length === 0) return `Akutmedikation und Triptane blieben im Vergleich stabil.`;
  return pieces.join(" ");
}

function mecfsSentence(m: MetricTrend, r: WindowStats, p: WindowStats): string {
  if (r.mecfsDays === 0 && p.mecfsDays === 0) return "Keine ME/CFS-/Energie-Signale in beiden Vergleichsfenstern dokumentiert.";
  if (m.label === "decreased") return `ME/CFS-/Energie-Signale wurden zuletzt seltener dokumentiert (${r.mecfsDays} vs. ${p.mecfsDays} Tage).`;
  if (m.label === "increased") return `ME/CFS-/Energie-Signale wurden zuletzt häufiger dokumentiert (${r.mecfsDays} vs. ${p.mecfsDays} Tage).`;
  return `ME/CFS-/Energie-Signale blieben im Vergleich stabil (${r.mecfsDays} vs. ${p.mecfsDays} Tage).`;
}
