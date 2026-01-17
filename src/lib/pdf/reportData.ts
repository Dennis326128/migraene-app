/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SINGLE SOURCE OF TRUTH FÜR PDF-REPORT DATEN
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Dieses Modul stellt sicher, dass alle Bereiche des PDF-Reports 
 * (Auswertung, Zusammenfassung, Medikamenten-Statistik) dieselbe 
 * Datengrundlage verwenden.
 * 
 * STRUKTUR gemäß reportStructure.ts:
 * - Ärztliche Kernkennzahlen (normiert auf 30 Tage)
 * - Akutmedikation mit Triptan-Erkennung
 * - Regelbasierte Auffälligkeiten
 */

import type { PainEntry, MedicationIntakeInfo } from "@/types/painApp";
import { parseISO, startOfDay, endOfDay, isWithinInterval, subDays, differenceInDays } from "date-fns";
import { isTriptanMedication, MEDICATION_THRESHOLDS } from "./reportStructure";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface MedicationEffectData {
  entry_id: number;
  med_name: string;
  effect_rating: string;
  effect_score?: number | null;
}

export interface AcuteMedicationStat {
  name: string;
  totalUnitsInRange: number;       // Einnahmen im Zeitraum
  avgPerMonth: number;             // Ø Einnahmen pro Monat
  last30Units: number;             // Einnahmen in letzten 30 Tagen
  avgEffectiveness: number | null; // 0-10 Skala, null wenn keine Bewertungen
  ratedCount: number;              // Anzahl Bewertungen
  isTriptan: boolean;              // Triptan-Erkennung für ärztliche Übersicht
}

/**
 * Ärztliche Kernkennzahlen (normiert auf 30 Tage)
 * Gemäß ZIELSTRUKTUR Abschnitt 2: "Ärztliche Kernübersicht"
 */
export interface CoreMedicalKPIs {
  headacheDaysPerMonth: number;    // Ø Kopfschmerztage pro Monat (normiert)
  triptanDaysPerMonth: number;     // Ø Triptantage pro Monat (normiert)
  avgIntensity: number;            // Ø Schmerzintensität (NRS 0-10)
  totalAttacks: number;            // Gesamtzahl Attacken im Zeitraum
  daysWithMedication: number;      // Tage mit Medikation im Zeitraum
}

export interface ReportKPIs {
  totalAttacks: number;            // Gesamtzahl Attacken im Zeitraum
  avgIntensity: number;            // Ø Schmerzintensität (0-10)
  daysWithPain: number;            // Distinct Tage mit Schmerzen
  daysWithAcuteMedication: number; // Distinct Tage mit Akutmedikation
  daysInRange: number;             // Tage im Zeitraum
}

/**
 * Regelbasierte Auffälligkeit für die statische Auswertung
 */
export interface RuleBasedInsight {
  type: 'warning' | 'info' | 'pattern';
  text: string;
  severity: 'low' | 'medium' | 'high';
}

export interface ReportData {
  entries: PainEntry[];
  kpis: ReportKPIs;
  coreKPIs: CoreMedicalKPIs;       // NEU: Ärztliche Kernkennzahlen
  acuteMedicationStats: AcuteMedicationStat[];
  ruleBasedInsights: RuleBasedInsight[]; // NEU: Statische Auffälligkeiten
  fromDate: string;
  toDate: string;
  generatedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Zentraler Helper: Ermittelt das Datum eines Eintrags
 * Verwendet selected_date wenn vorhanden, sonst timestamp_created
 */
export function getEntryDate(entry: PainEntry): string {
  if (entry.selected_date) {
    return entry.selected_date;
  }
  if (entry.timestamp_created) {
    return entry.timestamp_created.split('T')[0];
  }
  return '';
}

/**
 * Konvertiert effect_rating zu numerischem Wert (0-10)
 */
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

/**
 * Konvertiert Schmerz-Level zu numerischem Wert (0-10)
 */
function painLevelToNumericValue(painLevel: string): number {
  const level = (painLevel || "").toLowerCase().replace(/_/g, " ");
  if (level.includes("sehr") && level.includes("stark")) return 9;
  if (level.includes("stark")) return 7;
  if (level.includes("mittel")) return 5;
  if (level.includes("leicht")) return 2;
  if (level === "keine" || level === "-") return 0;
  const num = parseInt(painLevel);
  return isNaN(num) ? 0 : num;
}

/**
 * Berechnet Tage zwischen zwei Daten (inklusive)
 */
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
 * Baut das zentrale ReportData-Objekt für konsistente PDF-Generierung.
 * ALLE Kennzahlen werden aus diesem Objekt abgeleitet.
 */
export function buildReportData(params: BuildReportDataParams): ReportData {
  const { entries, medicationEffects, fromDate, toDate, now = new Date() } = params;
  
  const daysInRange = calculateDaysInRange(fromDate, toDate);
  const monthsEquivalent = Math.max(1, daysInRange / 30.4375);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // KPIs berechnen
  // ═══════════════════════════════════════════════════════════════════════════
  
  const totalAttacks = entries.length;
  
  // Durchschnittliche Intensität (nur Einträge mit Schmerz > 0)
  const validIntensityEntries = entries.filter(e => {
    const pain = painLevelToNumericValue(e.pain_level);
    return pain > 0;
  });
  const avgIntensity = validIntensityEntries.length > 0
    ? validIntensityEntries.reduce((sum, e) => sum + painLevelToNumericValue(e.pain_level), 0) / validIntensityEntries.length
    : 0;
  
  // Distinct Tage mit Schmerzen
  const daysWithPainSet = new Set(entries.map(e => getEntryDate(e)).filter(Boolean));
  const daysWithPain = daysWithPainSet.size;
  
  // Distinct Tage mit Akutmedikation
  const daysWithAcuteMedSet = new Set<string>();
  // Distinct Tage mit Triptan
  const daysWithTriptanSet = new Set<string>();
  
  entries.forEach(entry => {
    if (entry.medications && entry.medications.length > 0) {
      const date = getEntryDate(entry);
      if (date) {
        daysWithAcuteMedSet.add(date);
        // Prüfe auf Triptan
        if (entry.medications.some(med => isTriptanMedication(med))) {
          daysWithTriptanSet.add(date);
        }
      }
    }
  });
  const daysWithAcuteMedication = daysWithAcuteMedSet.size;
  const daysWithTriptan = daysWithTriptanSet.size;
  
  const kpis: ReportKPIs = {
    totalAttacks,
    avgIntensity: Math.round(avgIntensity * 10) / 10,
    daysWithPain,
    daysWithAcuteMedication,
    daysInRange
  };
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ÄRZTLICHE KERNKENNZAHLEN (normiert auf 30 Tage)
  // ═══════════════════════════════════════════════════════════════════════════
  
  const headacheDaysPerMonth = Math.round((daysWithPain / daysInRange) * 30 * 10) / 10;
  const triptanDaysPerMonth = Math.round((daysWithTriptan / daysInRange) * 30 * 10) / 10;
  
  const coreKPIs: CoreMedicalKPIs = {
    headacheDaysPerMonth,
    triptanDaysPerMonth,
    avgIntensity: kpis.avgIntensity,
    totalAttacks,
    daysWithMedication: daysWithAcuteMedication
  };
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Akutmedikations-Statistik berechnen
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Last 30 days window
  const toDateParsed = parseISO(toDate);
  const windowEnd = now < toDateParsed ? now : toDateParsed;
  const windowStart = subDays(windowEnd, 30);
  
  // Sammle Medikamenten-Daten
  const medStats = new Map<string, {
    totalUnits: number;
    last30Units: number;
    effectScores: number[];
  }>();
  
  entries.forEach(entry => {
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
    
    // Medikamente verarbeiten
    const intakeMap = new Map<string, number>(
      (entry.medication_intakes || []).map(i => [i.medication_name, i.dose_quarters])
    );
    
    entry.medications?.forEach(med => {
      if (!medStats.has(med)) {
        medStats.set(med, { totalUnits: 0, last30Units: 0, effectScores: [] });
      }
      const stat = medStats.get(med)!;
      
      // Units: dose_quarters / 4 oder 1 wenn nicht vorhanden
      const quarters = intakeMap.get(med) ?? 4;
      const units = quarters / 4;
      
      stat.totalUnits += units;
      if (isInLast30) {
        stat.last30Units += units;
      }
    });
  });
  
  // Effekte hinzufügen
  medicationEffects.forEach(effect => {
    const stat = medStats.get(effect.med_name);
    if (stat) {
      const score = mapEffectRatingToScore(effect.effect_rating);
      stat.effectScores.push(score);
    }
  });
  
  // Zu Array konvertieren und sortieren
  const acuteMedicationStats: AcuteMedicationStat[] = Array.from(medStats.entries())
    .map(([name, data]) => {
      const avgPerMonth = Math.round((data.totalUnits / monthsEquivalent) * 10) / 10;
      const avgEffectiveness = data.effectScores.length > 0
        ? Math.round((data.effectScores.reduce((a, b) => a + b, 0) / data.effectScores.length) * 10) / 10
        : null;
      
      return {
        name,
        totalUnitsInRange: Math.round(data.totalUnits * 10) / 10,
        avgPerMonth,
        last30Units: Math.round(data.last30Units * 10) / 10,
        avgEffectiveness,
        ratedCount: data.effectScores.length,
        isTriptan: isTriptanMedication(name)
      };
    })
    .sort((a, b) => b.last30Units - a.last30Units || b.totalUnitsInRange - a.totalUnitsInRange)
    .slice(0, 5); // Top 5
  
  // ═══════════════════════════════════════════════════════════════════════════
  // REGELBASIERTE AUFFÄLLIGKEITEN
  // ═══════════════════════════════════════════════════════════════════════════
  
  const ruleBasedInsights: RuleBasedInsight[] = [];
  
  // Triptan-Übergebrauch prüfen
  if (triptanDaysPerMonth > MEDICATION_THRESHOLDS.triptanDaysPerMonth) {
    ruleBasedInsights.push({
      type: 'warning',
      text: `Triptantage >10/Monat (${triptanDaysPerMonth.toFixed(1)}) - mogliches Ubergebrauchsrisiko`,
      severity: 'high'
    });
  }
  
  // Akutmedikations-Übergebrauch prüfen
  const acuteMedDaysPerMonth = Math.round((daysWithAcuteMedication / daysInRange) * 30 * 10) / 10;
  if (acuteMedDaysPerMonth > MEDICATION_THRESHOLDS.acuteMedDaysPerMonth) {
    ruleBasedInsights.push({
      type: 'warning',
      text: `Akutmedikationstage >15/Monat (${acuteMedDaysPerMonth.toFixed(1)}) - Hinweis auf moglichen Ubergebrauch`,
      severity: 'high'
    });
  }
  
  // Chronische Migräne prüfen
  if (headacheDaysPerMonth >= MEDICATION_THRESHOLDS.chronicMigraineThreshold) {
    ruleBasedInsights.push({
      type: 'info',
      text: `>=${MEDICATION_THRESHOLDS.chronicMigraineThreshold} Kopfschmerztage/Monat - entspricht Kriterien fur chronische Migrane`,
      severity: 'medium'
    });
  }
  
  // Tageszeit-Muster erkennen
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
      ruleBasedInsights.push({
        type: 'pattern',
        text: `Haufung von Attacken morgens zwischen 5-10 Uhr (${Math.round(morningCount / totalWithTime * 100)}%)`,
        severity: 'low'
      });
    } else if (eveningCount / totalWithTime > 0.5) {
      ruleBasedInsights.push({
        type: 'pattern',
        text: `Haufung von Attacken abends zwischen 17-23 Uhr (${Math.round(eveningCount / totalWithTime * 100)}%)`,
        severity: 'low'
      });
    }
  }
  
  // Max 5 Insights
  const limitedInsights = ruleBasedInsights.slice(0, 5);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SANITY CHECKS (dev-only)
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (import.meta.env.DEV) {
    // Check 1: Keine NaN/Infinity
    if (isNaN(kpis.avgIntensity) || !isFinite(kpis.avgIntensity)) {
      console.warn('[ReportData] Sanity Check Failed: avgIntensity is NaN/Infinity');
    }
    
    // Check 2: last30Units <= totalUnitsInRange (wenn windowEnd <= toDate)
    if (windowEnd <= toDateParsed) {
      const totalLast30 = acuteMedicationStats.reduce((sum, s) => sum + s.last30Units, 0);
      const totalRange = acuteMedicationStats.reduce((sum, s) => sum + s.totalUnitsInRange, 0);
      if (totalLast30 > totalRange + 0.1) { // kleine Toleranz für Rundung
        console.warn('[ReportData] Sanity Check Failed: last30Units > totalUnitsInRange', {
          totalLast30,
          totalRange
        });
      }
    }
    
    // Check 3: avgPerMonth sinnvoll
    acuteMedicationStats.forEach(stat => {
      if (isNaN(stat.avgPerMonth) || !isFinite(stat.avgPerMonth)) {
        console.warn(`[ReportData] Sanity Check Failed: avgPerMonth for ${stat.name} is NaN/Infinity`);
      }
    });
    
    console.log('[ReportData] Built successfully:', {
      totalAttacks: kpis.totalAttacks,
      daysInRange: kpis.daysInRange,
      acuteMedsCount: acuteMedicationStats.length,
      coreKPIs,
      insightsCount: limitedInsights.length
    });
  }
  
  return {
    entries,
    kpis,
    coreKPIs,
    acuteMedicationStats,
    ruleBasedInsights: limitedInsights,
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
  
  // Häufigstes Medikament im Zeitraum (falls anders als Top by last30)
  const topByTotal = [...stats].sort((a, b) => b.totalUnitsInRange - a.totalUnitsInRange)[0];
  if (topByTotal && topByTotal.name !== topMed.name) {
    insights.push(`Haufigste Akutmedikation im Zeitraum: ${topByTotal.name} (${topByTotal.totalUnitsInRange} Einnahmen).`);
  }
  
  return insights.slice(0, 2); // Max 2 Sätze
}
