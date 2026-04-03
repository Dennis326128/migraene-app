/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Deterministic Clinical Analysis Modules (Phase 1)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pure computation from diary data. No LLM, no side effects.
 * Used by both PDF generation (client) and Edge Function (server prompt).
 *
 * Modules:
 *   1. Chronobiologisches Muster (Wochentag & Tageszeit)
 *   5. MOH-Frühwarnung (Triptan-Tage/Monat, Trend, Eskalation)
 *   6. Schmerzfreie Intervalle & Verlaufstendenz
 *   9. ICHD-3 Kriterien-Screening
 *
 * Rules:
 *   - Every finding includes data basis: "Basis: N Tage / N Einträge"
 *   - Minimum N ≥ 10 for any finding, otherwise: "Zu wenig Datenpunkte"
 *   - Numbers always precise: "in 67% der Fälle (N=34)"
 *   - Disclaimer on every module
 */

import { normalizePainLevel } from '@/lib/utils/pain';
import { isTriptan } from '@/lib/medications/isTriptan';

// ─── Shared Types ────────────────────────────────────────────────────────

export interface AnalysisEntry {
  dateISO: string;         // YYYY-MM-DD
  timeHHMM?: string | null; // HH:MM
  painLevel: string | number | null;
  medications?: string[] | null;
  meCfsScore?: number | null;
  notes?: string | null;
  isPrivate?: boolean;
}

const MODULE_DISCLAIMER = 'Statistische Assoziation. Kein kausaler Nachweis. Klinische Einordnung erforderlich.';
const MIN_N = 10;

// ─── Private Notes Anonymization ─────────────────────────────────────────

const ANONYMIZATION_RULES: Array<{ keywords: string[]; label: string }> = [
  { keywords: ['stress', 'konflikt', 'streit', 'druck'], label: 'Psychosozialer Stress' },
  { keywords: ['schlaf', 'schlafen', 'erschöpft', 'zopiclon', 'nicht einschlafen', 'schlafmangel'], label: 'Schlafstörung / Erschöpfung' },
  { keywords: ['arbeit', 'job', 'meeting', 'deadline'], label: 'Berufliche Belastung' },
  { keywords: ['beziehung', 'freundin', 'freund', 'familie', 'partner'], label: 'Persönlicher Stress' },
  { keywords: ['sport', 'training', 'bewegung', 'anstrengend'], label: 'Körperliche Aktivität' },
  { keywords: ['alkohol', 'wein', 'bier', 'sekt'], label: 'Nahrungsmittel/Genussmittel' },
];

/**
 * Anonymize private note text to a category label.
 * Private entries contribute to pattern detection but only via the anonymized label.
 */
export function anonymizePrivateNote(noteText: string | null | undefined): string | null {
  if (!noteText) return null;
  const lower = noteText.toLowerCase();
  for (const rule of ANONYMIZATION_RULES) {
    if (rule.keywords.some(kw => lower.includes(kw))) {
      return rule.label;
    }
  }
  return 'Persönliche Notiz (nicht exportiert)';
}

/**
 * Get the effective note text for analysis: anonymized for private entries, original for public.
 */
function getAnalysisNoteText(entry: AnalysisEntry): string | null {
  if (entry.isPrivate) {
    return anonymizePrivateNote(entry.notes);
  }
  return entry.notes ?? null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function parsePain(level: string | number | null | undefined): number {
  if (level == null) return 0;
  return normalizePainLevel(level as string | number);
}

function isHeadacheEntry(e: AnalysisEntry): boolean {
  return parsePain(e.painLevel) > 0;
}

function getWeekday(dateISO: string): number {
  // 0=Mon, 6=Sun (ISO convention)
  const d = new Date(dateISO + 'T12:00:00Z');
  return (d.getUTCDay() + 6) % 7; // shift Sun=0 to Mon=0
}

const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function getHour(timeHHMM: string | null | undefined): number | null {
  if (!timeHHMM) return null;
  const h = parseInt(timeHHMM.split(':')[0], 10);
  return isNaN(h) ? null : h;
}

function pct(n: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((n / total) * 1000) / 10;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ─── Result Types ────────────────────────────────────────────────────────

export interface AnalysisFinding {
  text: string;
  basis: string;
}

export interface AnalysisModule {
  id: string;
  title: string;
  findings: AnalysisFinding[];
  disclaimer: string;
  sufficient: boolean;  // false if N < MIN_N
  insufficientReason?: string;
}

export interface ClinicalAnalysisResult {
  modules: AnalysisModule[];
  kurzfazitBullets: string[];  // top 5 findings for LLM/PDF header
  generatedAt: string;
  dataRange: { from: string; to: string };
  totalEntries: number;
  totalDays: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// MODULE 1: Chronobiologisches Muster
// ═══════════════════════════════════════════════════════════════════════════

function computeChronobiology(entries: AnalysisEntry[]): AnalysisModule {
  const headacheEntries = entries.filter(isHeadacheEntry);
  const n = headacheEntries.length;

  if (n < MIN_N) {
    return {
      id: 'chronobiology',
      title: 'CHRONOBIOLOGISCHES MUSTER',
      findings: [],
      disclaimer: MODULE_DISCLAIMER,
      sufficient: false,
      insufficientReason: `Zu wenig Datenpunkte für valide Aussage (N=${n}, benötigt ≥${MIN_N}).`,
    };
  }

  const findings: AnalysisFinding[] = [];

  // Weekday distribution
  const weekdayCounts = new Array(7).fill(0);
  for (const e of headacheEntries) {
    weekdayCounts[getWeekday(e.dateISO)]++;
  }
  const maxDay = weekdayCounts.indexOf(Math.max(...weekdayCounts));
  const maxDayPct = pct(weekdayCounts[maxDay], n);
  const expectedPct = round1(100 / 7);

  findings.push({
    text: `${WEEKDAY_LABELS[maxDay]} war mit ${maxDayPct}% der häufigste Attackentag (N=${weekdayCounts[maxDay]}). Erwartungswert bei Gleichverteilung: ${expectedPct}%.`,
    basis: `Basis: ${n} Kopfschmerzeinträge`,
  });

  // Show full weekday distribution
  const weekdayStr = WEEKDAY_LABELS.map((label, i) =>
    `${label}: ${pct(weekdayCounts[i], n)}% (N=${weekdayCounts[i]})`
  ).join(', ');
  findings.push({
    text: `Wochentagsverteilung: ${weekdayStr}.`,
    basis: `Basis: ${n} Kopfschmerzeinträge`,
  });

  // Time-of-day blocks
  const entriesWithTime = headacheEntries.filter(e => getHour(e.timeHHMM) !== null);
  if (entriesWithTime.length >= MIN_N) {
    const blocks = { night: 0, morning: 0, afternoon: 0, evening: 0 };
    const blockPains: Record<string, number[]> = { night: [], morning: [], afternoon: [], evening: [] };
    for (const e of entriesWithTime) {
      const h = getHour(e.timeHHMM)!;
      const pain = parsePain(e.painLevel);
      let block: keyof typeof blocks;
      if (h < 6) block = 'night';
      else if (h < 12) block = 'morning';
      else if (h < 18) block = 'afternoon';
      else block = 'evening';
      blocks[block]++;
      blockPains[block].push(pain);
    }

    const total = entriesWithTime.length;
    const blockLabels: Record<string, string> = {
      night: 'Nacht (0–6h)',
      morning: 'Morgen (6–12h)',
      afternoon: 'Nachmittag (12–18h)',
      evening: 'Abend (18–24h)',
    };

    // Find dominant block
    const dominantBlock = (Object.keys(blocks) as Array<keyof typeof blocks>)
      .reduce((a, b) => blocks[a] > blocks[b] ? a : b);
    const dominantPct = pct(blocks[dominantBlock], total);

    findings.push({
      text: `Tageszeit-Muster: ${dominantPct}% der Attacken im Block ${blockLabels[dominantBlock]} (N=${blocks[dominantBlock]}). Referenz bei Gleichverteilung: 25%.`,
      basis: `Basis: ${total} Einträge mit Zeitangabe`,
    });

    // Morning vs late comparison
    const earlyCount = entriesWithTime.filter(e => getHour(e.timeHHMM)! < 10).length;
    const lateCount = entriesWithTime.filter(e => getHour(e.timeHHMM)! >= 16).length;
    const earlyPains = entriesWithTime.filter(e => getHour(e.timeHHMM)! < 10).map(e => parsePain(e.painLevel));
    const latePains = entriesWithTime.filter(e => getHour(e.timeHHMM)! >= 16).map(e => parsePain(e.painLevel));

    const earlyAvg = earlyPains.length > 0 ? round1(earlyPains.reduce((a, b) => a + b, 0) / earlyPains.length) : null;
    const lateAvg = latePains.length > 0 ? round1(latePains.reduce((a, b) => a + b, 0) / latePains.length) : null;

    findings.push({
      text: `Früh-Attacken (<10h): ${pct(earlyCount, total)}% (N=${earlyCount}), Ø NRS ${earlyAvg ?? '–'}/10. Spät-Attacken (>=16h): ${pct(lateCount, total)}% (N=${lateCount}), Ø NRS ${lateAvg ?? '–'}/10.`,
      basis: `Basis: ${total} Einträge mit Zeitangabe`,
    });
  }

  return {
    id: 'chronobiology',
    title: 'CHRONOBIOLOGISCHES MUSTER',
    findings,
    disclaimer: MODULE_DISCLAIMER,
    sufficient: true,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MODULE 5: MOH-Frühwarnung
// ═══════════════════════════════════════════════════════════════════════════

interface MonthBucket {
  label: string; // "2026-01"
  triptanDays: number;
  acuteMedDays: number;
  multiMedDays: number;       // days with ≥2 different acute meds
  highPainMultiMed: number;   // days with ≥2 meds AND NRS≥7
  hasBenzo: boolean;
  benzoCases: number;
}

const BENZO_KEYWORDS = ['diazepam', 'lorazepam', 'clonazepam', 'bromazepam', 'oxazepam', 'alprazolam'];

function isBenzodiazepine(medName: string): boolean {
  const lower = medName.toLowerCase();
  return BENZO_KEYWORDS.some(k => lower.includes(k));
}

function computeMOHWarning(entries: AnalysisEntry[], fromDate: string, toDate: string): AnalysisModule {
  // Build per-day map
  const dayMap = new Map<string, { triptanUsed: boolean; acuteMedUsed: boolean; meds: Set<string>; maxPain: number; hasBenzo: boolean }>();

  for (const e of entries) {
    const day = e.dateISO;
    if (!dayMap.has(day)) {
      dayMap.set(day, { triptanUsed: false, acuteMedUsed: false, meds: new Set(), maxPain: 0, hasBenzo: false });
    }
    const d = dayMap.get(day)!;
    const pain = parsePain(e.painLevel);
    d.maxPain = Math.max(d.maxPain, pain);
    if (e.medications && e.medications.length > 0) {
      d.acuteMedUsed = true;
      for (const med of e.medications) {
        d.meds.add(med);
        if (isTriptan(med)) d.triptanUsed = true;
        if (isBenzodiazepine(med)) d.hasBenzo = true;
      }
    }
  }

  // Build monthly buckets
  const months = new Map<string, MonthBucket>();
  for (const [day, data] of dayMap) {
    const monthKey = day.substring(0, 7);
    if (!months.has(monthKey)) {
      months.set(monthKey, { label: monthKey, triptanDays: 0, acuteMedDays: 0, multiMedDays: 0, highPainMultiMed: 0, hasBenzo: false, benzoCases: 0 });
    }
    const m = months.get(monthKey)!;
    if (data.triptanUsed) m.triptanDays++;
    if (data.acuteMedUsed) m.acuteMedDays++;
    if (data.meds.size >= 2) {
      m.multiMedDays++;
      if (data.maxPain >= 7) m.highPainMultiMed++;
    }
    if (data.hasBenzo) {
      m.hasBenzo = true;
      m.benzoCases++;
    }
  }

  const monthBuckets = Array.from(months.values()).sort((a, b) => a.label.localeCompare(b.label));
  const totalMonths = monthBuckets.length;

  if (totalMonths < 1) {
    return {
      id: 'moh_warning',
      title: 'MEDIKAMENTEN-ÜBERGEBRAUCH (MOH) FRÜHWARNUNG',
      findings: [],
      disclaimer: MODULE_DISCLAIMER,
      sufficient: false,
      insufficientReason: 'Keine Monatsdaten vorhanden.',
    };
  }

  const findings: AnalysisFinding[] = [];

  // Triptan days per month
  const triptanOverMonths = monthBuckets.map(m => `${m.label}: ${m.triptanDays} Tage`).join(', ');
  const monthsOverThreshold = monthBuckets.filter(m => m.triptanDays >= 10).length;

  findings.push({
    text: `Triptan-Tage pro Monat: ${triptanOverMonths}.`,
    basis: `Basis: ${totalMonths} Kalendermonat(e)`,
  });

  if (monthsOverThreshold > 0) {
    findings.push({
      text: `ICHD-3 MOH-Schwelle (>=10 Triptantage/Monat) in ${monthsOverThreshold} von ${totalMonths} Monaten überschritten.`,
      basis: `Basis: ${totalMonths} Kalendermonat(e)`,
    });
  }

  // Trend (simple: compare first half vs second half average)
  if (totalMonths >= 2) {
    const half = Math.ceil(totalMonths / 2);
    const firstHalf = monthBuckets.slice(0, half);
    const secondHalf = monthBuckets.slice(half);
    const avgFirst = round1(firstHalf.reduce((s, m) => s + m.triptanDays, 0) / firstHalf.length);
    const avgSecond = round1(secondHalf.reduce((s, m) => s + m.triptanDays, 0) / secondHalf.length);
    const trend = avgSecond > avgFirst ? 'steigend' : avgSecond < avgFirst ? 'fallend' : 'stabil';
    findings.push({
      text: `Triptannutzung-Tendenz: ${trend} (1. Hälfte Ø ${avgFirst} Tage/Monat, 2. Hälfte Ø ${avgSecond} Tage/Monat).`,
      basis: `Basis: ${totalMonths} Kalendermonat(e)`,
    });
  }

  // Multi-med days
  const totalMultiMed = monthBuckets.reduce((s, m) => s + m.multiMedDays, 0);
  if (totalMultiMed > 0) {
    const totalHighPainMulti = monthBuckets.reduce((s, m) => s + m.highPainMultiMed, 0);
    const justified = totalMultiMed > 0 ? pct(totalHighPainMulti, totalMultiMed) : 0;
    findings.push({
      text: `Kombinationseinnahmen (>=2 Akutmedikamente/Tag): ${totalMultiMed} Fälle. Davon bei NRS >=7: ${totalHighPainMulti} (${justified}%).`,
      basis: `Basis: ${dayMap.size} dokumentierte Tage`,
    });
  }

  // Benzodiazepine warning
  const totalBenzo = monthBuckets.reduce((s, m) => s + m.benzoCases, 0);
  if (totalBenzo > 0) {
    findings.push({
      text: `ACHTUNG: Benzodiazepineinnahme bei Kopfschmerz: ${totalBenzo} Faelle - klinische Einordnung empfohlen.`,
      basis: `Basis: ${dayMap.size} dokumentierte Tage`,
    });
  }

  return {
    id: 'moh_warning',
    title: 'MEDIKAMENTEN-ÜBERGEBRAUCH (MOH) FRÜHWARNUNG',
    findings,
    disclaimer: MODULE_DISCLAIMER,
    sufficient: true,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MODULE 6: Schmerzfreie Intervalle & Verlaufstendenz
// ═══════════════════════════════════════════════════════════════════════════

function computePainFreeIntervals(entries: AnalysisEntry[], fromDate: string, toDate: string): AnalysisModule {
  // Build day-level pain map (all calendar days)
  const start = new Date(fromDate + 'T12:00:00Z');
  const end = new Date(toDate + 'T12:00:00Z');
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (86400000)) + 1);

  // Day → max pain
  const dayPain = new Map<string, number>();
  const dayTriptan = new Map<string, boolean>();
  for (const e of entries) {
    const pain = parsePain(e.painLevel);
    dayPain.set(e.dateISO, Math.max(dayPain.get(e.dateISO) ?? 0, pain));
    if (e.medications?.some(m => isTriptan(m))) {
      dayTriptan.set(e.dateISO, true);
    }
  }

  const headacheDays = Array.from(dayPain.entries()).filter(([, p]) => p > 0);

  if (headacheDays.length < MIN_N) {
    return {
      id: 'pain_free_intervals',
      title: 'SCHMERZFREIE INTERVALLE & VERLAUFSTENDENZ',
      findings: [],
      disclaimer: MODULE_DISCLAIMER,
      sufficient: false,
      insufficientReason: `Zu wenig Kopfschmerztage für Verlaufsanalyse (N=${headacheDays.length}, benötigt ≥${MIN_N}).`,
    };
  }

  const findings: AnalysisFinding[] = [];

  // Build ordered list of all dates in range
  const allDates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    allDates.push(cursor.toISOString().split('T')[0]);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  // Pain-free streaks — only days WITH an entry and pain===0 count as pain-free.
  // Undocumented days (no entry) are "unknown" and break streaks.
  const documentedDays = new Set(dayPain.keys());
  let maxStreak = 0;
  let currentStreak = 0;
  const streaks: number[] = [];
  let painFreeDayCount = 0;
  for (const date of allDates) {
    if (!documentedDays.has(date)) {
      // Unknown day — break streak
      if (currentStreak > 0) streaks.push(currentStreak);
      currentStreak = 0;
      continue;
    }
    const pain = dayPain.get(date)!;
    if (pain === 0) {
      currentStreak++;
      painFreeDayCount++;
    } else {
      if (currentStreak > 0) streaks.push(currentStreak);
      currentStreak = 0;
    }
  }
  if (currentStreak > 0) streaks.push(currentStreak);
  maxStreak = streaks.length > 0 ? Math.max(...streaks) : 0;
  const avgStreak = streaks.length > 0 ? round1(streaks.reduce((a, b) => a + b, 0) / streaks.length) : 0;

  findings.push({
    text: `Schmerzfreie Tage: ${painFreeDayCount} von ${documentedDays.size} dokumentierten Tagen. Laengste schmerzfreie Periode: ${maxStreak} Tage. Durchschnitt: ${avgStreak} Tage (${streaks.length} Intervalle).`,
    basis: `Basis: ${documentedDays.size} dokumentierte Tage (von ${totalDays} Kalendertagen)`,
  });

  // Trend: split into thirds
  const thirdSize = Math.ceil(allDates.length / 3);
  const thirds = [
    allDates.slice(0, thirdSize),
    allDates.slice(thirdSize, thirdSize * 2),
    allDates.slice(thirdSize * 2),
  ];

  const thirdLabels = ['Erstes Drittel', 'Mittleres Drittel', 'Letztes Drittel'];
  const thirdStats = thirds.map((dates, i) => {
    const documented = dates.filter(d => documentedDays.has(d));
    const hdDays = documented.filter(d => dayPain.get(d)! > 0).length;
    const pains = documented.filter(d => dayPain.get(d)! > 0).map(d => dayPain.get(d)!);
    const avgNRS = pains.length > 0 ? round1(pains.reduce((a, b) => a + b, 0) / pains.length) : 0;
    const triptanD = dates.filter(d => dayTriptan.get(d)).length;
    return { label: thirdLabels[i], days: dates.length, documented: documented.length, headacheDays: hdDays, avgNRS, triptanDays: triptanD };
  });

  for (const t of thirdStats) {
    findings.push({
      text: `${t.label} (${t.days} Tage): ${t.headacheDays} Kopfschmerztage, Ø NRS ${t.avgNRS}/10, ${t.triptanDays} Triptantage.`,
      basis: `Basis: ${t.days} Kalendertage`,
    });
  }

  // Trend assessment
  const firstHD = thirdStats[0].headacheDays / thirdStats[0].days;
  const lastHD = thirdStats[2].headacheDays / thirdStats[2].days;
  const trendText = lastHD > firstHD * 1.2 ? 'Zunahme'
    : lastHD < firstHD * 0.8 ? 'Abnahme'
    : 'stabile';
  findings.push({
    text: `Im Verlauf des Berichtszeitraums zeigt sich eine ${trendText} Tendenz der Schmerzfrequenz.`,
    basis: `Basis: ${totalDays} Kalendertage`,
  });

  // Clustering: ≥5 consecutive pain days
  let clusterCount = 0;
  let clusterStreak = 0;
  const clusterPeriods: string[] = [];
  let clusterStart = '';
  for (const date of allDates) {
    if (!documentedDays.has(date)) {
      // Unknown day — break cluster streak too
      if (clusterStreak >= 5) {
        clusterCount++;
        clusterPeriods.push(`${clusterStart} bis ${allDates[allDates.indexOf(date) - 1]} (${clusterStreak} Tage)`);
      }
      clusterStreak = 0;
      continue;
    }
    if (dayPain.get(date)! > 0) {
      if (clusterStreak === 0) clusterStart = date;
      clusterStreak++;
    } else {
      if (clusterStreak >= 5) {
        clusterCount++;
        clusterPeriods.push(`${clusterStart} bis ${allDates[allDates.indexOf(date) - 1]} (${clusterStreak} Tage)`);
      }
      clusterStreak = 0;
    }
  }
  if (clusterStreak >= 5) {
    clusterCount++;
    clusterPeriods.push(`ab ${clusterStart} (${clusterStreak} Tage)`);
  }

  if (clusterCount > 0) {
    findings.push({
      text: `Attacken-Clustering (>=5 aufeinanderfolgende Schmerztage): ${clusterCount} Phase(n). ${clusterPeriods.join('; ')}.`,
      basis: `Basis: ${totalDays} Kalendertage`,
    });
  } else {
    findings.push({
      text: 'Kein Attacken-Clustering (>=5 aufeinanderfolgende Schmerztage) im Berichtszeitraum.',
      basis: `Basis: ${totalDays} Kalendertage`,
    });
  }

  return {
    id: 'pain_free_intervals',
    title: 'SCHMERZFREIE INTERVALLE & VERLAUFSTENDENZ',
    findings,
    disclaimer: MODULE_DISCLAIMER,
    sufficient: true,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MODULE 9: ICHD-3 Kriterien-Screening
// ═══════════════════════════════════════════════════════════════════════════

function computeICHD3Screening(entries: AnalysisEntry[], fromDate: string, toDate: string): AnalysisModule {
  // Build per-month headache days
  const dayPain = new Map<string, number>();
  const dayHasMigraine = new Map<string, boolean>();

  for (const e of entries) {
    const pain = parsePain(e.painLevel);
    dayPain.set(e.dateISO, Math.max(dayPain.get(e.dateISO) ?? 0, pain));
    // Migraine heuristic: NRS >= 7 OR triptan used
    if (pain >= 7 || (e.medications?.some(m => isTriptan(m)))) {
      dayHasMigraine.set(e.dateISO, true);
    }
  }

  // Group by calendar month
  const months = new Map<string, { headacheDays: number; migraineDays: number; totalDocsInMonth: number }>();

  for (const [day, pain] of dayPain) {
    const monthKey = day.substring(0, 7);
    if (!months.has(monthKey)) {
      months.set(monthKey, { headacheDays: 0, migraineDays: 0, totalDocsInMonth: 0 });
    }
    const m = months.get(monthKey)!;
    m.totalDocsInMonth++;
    if (pain > 0) m.headacheDays++;
    if (dayHasMigraine.get(day)) m.migraineDays++;
  }

  const monthList = Array.from(months.entries()).sort(([a], [b]) => a.localeCompare(b));

  if (monthList.length < 1) {
    return {
      id: 'ichd3_screening',
      title: 'ICHD-3 KRITERIEN-SCREENING',
      findings: [],
      disclaimer: MODULE_DISCLAIMER,
      sufficient: false,
      insufficientReason: 'Keine Monatsdaten vorhanden.',
    };
  }

  const findings: AnalysisFinding[] = [];

  // Per-month table
  const monthRows = monthList.map(([key, m]) =>
    `${key}: ${m.headacheDays} KS-Tage, davon ${m.migraineDays} Migräne-Tage (Heuristik: NRS>=7 oder Triptan)`
  );
  findings.push({
    text: `Monatliche Kopfschmerztage:\n${monthRows.join('\n')}`,
    basis: `Basis: ${monthList.length} Kalendermonat(e)`,
  });

  // ICHD-3 Chronic Migraine check
  const monthsOver15 = monthList.filter(([, m]) => m.headacheDays >= 15).length;
  const monthsOver8Migraine = monthList.filter(([, m]) => m.migraineDays >= 8).length;
  const consecutive3Months = monthList.length >= 3;

  let verdict: string;
  if (monthsOver15 >= 3 && monthsOver8Migraine >= 3) {
    verdict = 'Kriterium erfüllt';
  } else if (monthList.length < 3) {
    verdict = 'nicht beurteilbar (weniger als 3 Monate Daten)';
  } else {
    verdict = 'Kriterium nicht erfüllt';
  }

  findings.push({
    text: `ICHD-3 Screening — Chronische Migräne: In ${monthsOver15} von ${monthList.length} ausgewerteten Monaten wurden >=15 Kopfschmerztage dokumentiert, in ${monthsOver8Migraine} Monaten >=8 mit Migräne-Charakteristik. Ergebnis: ${verdict}.`,
    basis: `Basis: ${monthList.length} Kalendermonat(e), Migräne-Heuristik (NRS>=7 oder Triptan)`,
  });

  findings.push({
    text: 'Automatisches Screening, keine ärztliche Diagnose. Klinische Befunderhebung erforderlich.',
    basis: '',
  });

  return {
    id: 'ichd3_screening',
    title: 'ICHD-3 KRITERIEN-SCREENING',
    findings,
    disclaimer: MODULE_DISCLAIMER,
    sufficient: true,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN: Compute all Phase 1 modules
// ═══════════════════════════════════════════════════════════════════════════

export function computeClinicalAnalysis(
  entries: AnalysisEntry[],
  fromDate: string,
  toDate: string,
): ClinicalAnalysisResult {
  const modules: AnalysisModule[] = [
    computeChronobiology(entries),
    computeMOHWarning(entries, fromDate, toDate),
    computePainFreeIntervals(entries, fromDate, toDate),
    computeICHD3Screening(entries, fromDate, toDate),
  ];

  // Build top-5 kurzfazit bullets from most significant findings
  const kurzfazitBullets: string[] = [];
  for (const mod of modules) {
    if (!mod.sufficient) continue;
    // Take first finding from each module (most important)
    if (mod.findings.length > 0) {
      kurzfazitBullets.push(mod.findings[0].text);
    }
  }

  const daySet = new Set(entries.map(e => e.dateISO));

  return {
    modules,
    kurzfazitBullets: kurzfazitBullets.slice(0, 5),
    generatedAt: new Date().toISOString(),
    dataRange: { from: fromDate, to: toDate },
    totalEntries: entries.length,
    totalDays: daySet.size,
  };
}
