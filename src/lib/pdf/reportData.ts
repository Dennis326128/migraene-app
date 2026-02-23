/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PDF-REPORT DATEN — Thin Mapper über SSOT computeMiaryReport
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * KPIs und Tageszählungen kommen aus SSOT (report-v2).
 * Nur Akutmedikations-Statistik (dose-based units, last30, avgPerMonth)
 * und Observation-Facts bleiben als Legacy-Berechnung.
 */

import type { PainEntry } from "@/types/painApp";
import { parseISO, startOfDay, endOfDay, isWithinInterval, subDays, differenceInDays } from "date-fns";
import { isTriptan as isTriptanMedication } from "@/lib/medications/isTriptan";
import { MEDICATION_THRESHOLDS } from "./reportStructure";
import { buildPdfReport } from "@/lib/report-v2/adapters/buildPdfReport";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES (stable public API — unchanged)
// ═══════════════════════════════════════════════════════════════════════════

export interface MedicationEffectData {
  entry_id: number;
  med_name: string;
  effect_rating: string;
  effect_score?: number | null;
}

export interface AcuteMedicationStat {
  name: string;
  totalUnitsInRange: number;
  avgPerMonth: number;
  last30Units: number;
  avgEffectiveness: number | null;
  ratedCount: number;
  isTriptan: boolean;
}

export interface CoreMedicalKPIs {
  headacheDaysPerMonth: number;
  triptanIntakesPerMonth: number;
  avgIntensity: number;
  totalAttacks: number;
  daysWithMedication: number;
  totalTriptanIntakes: number;
  documentedDays: number;
}

export interface ReportKPIs {
  totalAttacks: number;
  avgIntensity: number;
  daysWithPain: number;
  daysWithAcuteMedication: number;
  daysInRange: number;
  totalTriptanIntakes: number;
}

export interface ObservationFact {
  type: 'frequency' | 'pattern' | 'timing';
  text: string;
}

export interface ReportData {
  entries: PainEntry[];
  kpis: ReportKPIs;
  coreKPIs: CoreMedicalKPIs;
  acuteMedicationStats: AcuteMedicationStat[];
  observationFacts: ObservationFact[];
  fromDate: string;
  toDate: string;
  generatedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export function getEntryDate(entry: PainEntry): string {
  if (entry.selected_date) {
    return entry.selected_date;
  }
  if (entry.timestamp_created) {
    return entry.timestamp_created.split('T')[0];
  }
  return '';
}

function mapEffectRatingToScore(rating: string): number {
  const map: Record<string, number> = {
    'none': 0,
    'poor': 2.5,
    'moderate': 5,
    'good': 7.5,
    'very_good': 10
  };
  return map[rating] ?? 0;
}

function calculateDaysInRange(from: string, to: string): number {
  try {
    const start = parseISO(from);
    const end = parseISO(to);
    return Math.max(1, differenceInDays(end, start) + 1);
  } catch {
    return 1;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN BUILDER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export interface BuildReportDataParams {
  entries: PainEntry[];
  medicationEffects: MedicationEffectData[];
  fromDate: string;
  toDate: string;
  now?: Date;
}

/**
 * Baut das zentrale ReportData-Objekt für PDF-Generierung.
 * 
 * KPIs und Tageszählungen kommen aus SSOT (computeMiaryReport).
 * Akutmedikations-Statistik (dose-units, last30, avgPerMonth) bleibt legacy,
 * da SSOT diese granulare Dosis-Logik nicht abbildet.
 */
export function buildReportData(params: BuildReportDataParams): ReportData {
  const { entries, medicationEffects, fromDate, toDate, now = new Date() } = params;
  
  const daysInRange = calculateDaysInRange(fromDate, toDate);
  const monthsEquivalent = Math.max(1, daysInRange / 30.4375);

  // ═══════════════════════════════════════════════════════════════════════════
  // SSOT: KPIs via computeMiaryReport
  // ═══════════════════════════════════════════════════════════════════════════

  const { report: ssotReport } = buildPdfReport({
    range: {
      startISO: fromDate,
      endISO: toDate,
      timezone: 'Europe/Berlin',
      mode: 'CUSTOM',
      totalDaysInRange: daysInRange,
    },
    entries: entries as any,
    medicationEffects: medicationEffects.map(e => ({
      entry_id: e.entry_id,
      med_name: e.med_name,
      effect_rating: e.effect_rating,
      effect_score: e.effect_score,
    })),
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Map SSOT KPIs → legacy ReportKPIs / CoreMedicalKPIs
  // ═══════════════════════════════════════════════════════════════════════════

  // Triptan INTAKES (not days) — needed for CoreMedicalKPIs normalization
  // SSOT counts triptanDays (distinct days). For intakes we still count from entries.
  let totalTriptanIntakes = 0;
  entries.forEach(entry => {
    if (entry.medications && entry.medications.length > 0) {
      entry.medications.forEach(med => {
        if (isTriptanMedication(med)) {
          totalTriptanIntakes++;
        }
      });
    }
  });

  const kpis: ReportKPIs = {
    totalAttacks: entries.length,
    avgIntensity: ssotReport.kpis.avgPain ?? 0,
    daysWithPain: ssotReport.kpis.headacheDays,
    daysWithAcuteMedication: ssotReport.kpis.acuteMedDays,
    daysInRange,
    totalTriptanIntakes,
  };

  // Normiert auf 30 Tage
  const headacheDaysPerMonth = Math.round((kpis.daysWithPain / daysInRange) * 30 * 10) / 10;
  const triptanIntakesPerMonth = Math.round((totalTriptanIntakes / daysInRange) * 30 * 10) / 10;

  const coreKPIs: CoreMedicalKPIs = {
    headacheDaysPerMonth,
    triptanIntakesPerMonth,
    avgIntensity: kpis.avgIntensity,
    totalAttacks: kpis.totalAttacks,
    daysWithMedication: kpis.daysWithAcuteMedication,
    totalTriptanIntakes,
    documentedDays: ssotReport.meta.basis.documentedDays,
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // LEGACY: Akutmedikations-Statistik (dose-based units, last30, avgPerMonth)
  // Kept because SSOT doesn't model dose_quarters / unit fractions
  // ═══════════════════════════════════════════════════════════════════════════

  const toDateParsed = parseISO(toDate);
  const windowEnd = now < toDateParsed ? now : toDateParsed;
  const windowStart = subDays(windowEnd, 30);

  const medStats = new Map<string, {
    totalUnits: number;
    last30Units: number;
    effectScores: number[];
  }>();

  const entryIdsInRange = new Set<number>();

  entries.forEach(entry => {
    entryIdsInRange.add(Number(entry.id));
    const entryDateStr = getEntryDate(entry);
    if (!entryDateStr) return;

    let entryDate: Date;
    try {
      entryDate = parseISO(entryDateStr);
    } catch {
      return;
    }

    const isInLast30 = isWithinInterval(entryDate, {
      start: startOfDay(windowStart),
      end: endOfDay(windowEnd)
    });

    const intakeMap = new Map<string, number>(
      (entry.medication_intakes || []).map(i => [i.medication_name, i.dose_quarters])
    );

    entry.medications?.forEach(med => {
      if (!medStats.has(med)) {
        medStats.set(med, { totalUnits: 0, last30Units: 0, effectScores: [] });
      }
      const stat = medStats.get(med)!;
      const quarters = intakeMap.get(med) ?? 4;
      const units = quarters / 4;
      stat.totalUnits += units;
      if (isInLast30) {
        stat.last30Units += units;
      }
    });
  });

  // Effects — only for entries in range
  medicationEffects.forEach(effect => {
    if (!entryIdsInRange.has(effect.entry_id)) return;
    const stat = medStats.get(effect.med_name);
    if (stat) {
      const score = mapEffectRatingToScore(effect.effect_rating);
      stat.effectScores.push(score);
    }
  });

  const acuteMedicationStats: AcuteMedicationStat[] = Array.from(medStats.entries())
    .map(([name, data]) => {
      const avgPerMonth = Math.round((data.totalUnits / monthsEquivalent) * 10) / 10;
      const totalUnitsInRange = Math.round(data.totalUnits * 10) / 10;
      const avgEffectiveness = data.effectScores.length > 0
        ? Math.round((data.effectScores.reduce((a, b) => a + b, 0) / data.effectScores.length) * 10) / 10
        : null;
      const rawRatedCount = data.effectScores.length;
      const ratedCount = Math.min(rawRatedCount, Math.floor(totalUnitsInRange));

      return {
        name,
        totalUnitsInRange,
        avgPerMonth,
        last30Units: Math.round(data.last30Units * 10) / 10,
        avgEffectiveness,
        ratedCount,
        isTriptan: isTriptanMedication(name)
      };
    })
    .sort((a, b) => b.totalUnitsInRange - a.totalUnitsInRange || b.last30Units - a.last30Units || a.name.localeCompare(b.name, 'de'))
    .slice(0, 5);

  // ═══════════════════════════════════════════════════════════════════════════
  // LEGACY: Observation Facts (timing patterns)
  // ═══════════════════════════════════════════════════════════════════════════

  const observationFacts: ObservationFact[] = [];

  if (headacheDaysPerMonth >= 15) {
    observationFacts.push({
      type: 'frequency',
      text: `Hohe Kopfschmerzhäufigkeit: ${headacheDaysPerMonth.toFixed(1)} Tage/Monat`
    });
  }

  if (triptanIntakesPerMonth >= 10) {
    observationFacts.push({
      type: 'frequency',
      text: `Häufige Triptan-Einnahme: Ø ${triptanIntakesPerMonth.toFixed(1)} Einnahmen/Monat`
    });
  }

  const hourCounts = new Array(24).fill(0);
  entries.forEach(entry => {
    if (entry.selected_time) {
      const hour = parseInt(entry.selected_time.split(':')[0], 10);
      if (!isNaN(hour)) hourCounts[hour]++;
    }
  });
  const morningCount = hourCounts.slice(5, 10).reduce((a, b) => a + b, 0);
  const eveningCount = hourCounts.slice(17, 23).reduce((a, b) => a + b, 0);
  const totalWithTime = hourCounts.reduce((a, b) => a + b, 0);

  if (totalWithTime > 5) {
    if (morningCount / totalWithTime > 0.5) {
      observationFacts.push({
        type: 'timing',
        text: `Häufung morgens (5-10 Uhr): ${Math.round(morningCount / totalWithTime * 100)}% der Einträge`
      });
    } else if (eveningCount / totalWithTime > 0.5) {
      observationFacts.push({
        type: 'timing',
        text: `Häufung abends (17-23 Uhr): ${Math.round(eveningCount / totalWithTime * 100)}% der Einträge`
      });
    }
  }

  const limitedFacts = observationFacts.slice(0, 4);

  // ═══════════════════════════════════════════════════════════════════════════
  // SANITY CHECKS (dev-only)
  // ═══════════════════════════════════════════════════════════════════════════

  if (import.meta.env.DEV) {
    if (isNaN(kpis.avgIntensity) || !isFinite(kpis.avgIntensity)) {
      console.warn('[ReportData] Sanity Check Failed: avgIntensity is NaN/Infinity');
    }
    console.log('[ReportData] Built via SSOT:', {
      totalAttacks: kpis.totalAttacks,
      daysInRange: kpis.daysInRange,
      headacheDays: kpis.daysWithPain,
      acuteMedDays: kpis.daysWithAcuteMedication,
      acuteMedsCount: acuteMedicationStats.length,
      coreKPIs,
      observationsCount: limitedFacts.length,
    });
  }

  return {
    entries,
    kpis,
    coreKPIs,
    acuteMedicationStats,
    observationFacts: limitedFacts,
    fromDate,
    toDate,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Formatiert Datum nach deutschem Standard: dd.mm.yyyy
 */
export function formatDateGerman(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return dateStr;
    }
    return date.toLocaleDateString("de-DE", { 
      day: "2-digit", 
      month: "2-digit", 
      year: "numeric" 
    });
  } catch {
    return dateStr;
  }
}

/**
 * Generiert kurze Auffälligkeiten-Sätze für die Medikamenten-Statistik
 */
export function generateMedicationInsights(stats: AcuteMedicationStat[], daysInRange: number): string[] {
  if (stats.length === 0) return [];
  
  const insights: string[] = [];
  const topMed = stats[0];
  
  if (topMed) {
    insights.push(
      `${topMed.name} wurde in den letzten 30 Tagen ${topMed.last30Units}-mal dokumentiert (Ø ${topMed.avgPerMonth}/Monat im Zeitraum).`
    );
  }
  
  const topByTotal = [...stats].sort((a, b) => b.totalUnitsInRange - a.totalUnitsInRange)[0];
  if (topByTotal && topByTotal.name !== topMed.name) {
    insights.push(`Haufigste Akutmedikation im Zeitraum: ${topByTotal.name} (${topByTotal.totalUnitsInRange} Einnahmen).`);
  }
  
  return insights.slice(0, 2);
}
