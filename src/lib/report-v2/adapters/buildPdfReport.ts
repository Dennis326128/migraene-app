/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PDF Report Adapter — Maps PDF export data to SSOT computeMiaryReport
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Used by reportData.ts (buildReportData) and DoctorShareScreen.
 * Pure mapping + delegation. No own KPI logic.
 */

import type { ReportEntryInput, ReportRange, MiaryReportV2 } from '../types';
import { computeMiaryReport } from '../aggregate';
import { isPainEntry } from '@/lib/diary/isPainEntry';
import { normalizePainLevel } from '@/lib/utils/pain';
import { isTriptan } from '@/lib/medications/isTriptan';
import { differenceInDays, parseISO } from 'date-fns';

// ─── Input Types (matching PDF export shapes) ────────────────────────────

interface PdfPainEntry {
  id: string | number;
  selected_date?: string | null;
  timestamp_created?: string | null;
  pain_level?: string | number | null;
  entry_kind?: string | null;
  medications?: string[] | null;
  medication_intakes?: Array<{
    medication_name: string;
    medication_id?: string | null;
    dose_quarters: number;
  }> | null;
  me_cfs_severity_score?: number | null;
  me_cfs_severity_level?: string | null;
}

interface PdfMedicationEffect {
  entry_id: number;
  med_name: string;
  effect_rating?: string | null;
  effect_score?: number | null;
}

export interface BuildPdfReportArgs {
  range: {
    startISO: string;
    endISO: string;
    timezone?: string;
    mode?: ReportRange['mode'];
    totalDaysInRange?: number;
  };
  entries: PdfPainEntry[];
  medicationEffects?: PdfMedicationEffect[];
}

export interface PdfReportResult {
  report: MiaryReportV2;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function getEntryDateISO(entry: PdfPainEntry): string {
  if (entry.selected_date) return entry.selected_date;
  if (entry.timestamp_created) return entry.timestamp_created.split('T')[0];
  return '';
}

function mapEffectRatingToScore(rating: string | null | undefined): number | null {
  if (!rating) return null;
  const map: Record<string, number> = {
    'none': 0,
    'poor': 2.5,
    'moderate': 5,
    'good': 7.5,
    'very_good': 10,
  };
  return map[rating] ?? null;
}

type MeCfsSev = 'none' | 'mild' | 'moderate' | 'severe';

function mapMeCfsLevel(entry: PdfPainEntry): Array<MeCfsSev | null> {
  const level = entry.me_cfs_severity_level;
  if (!level) return [];
  const valid: MeCfsSev[] = ['none', 'mild', 'moderate', 'severe'];
  if (valid.includes(level as MeCfsSev)) return [level as MeCfsSev];
  return [];
}

/**
 * Calculates inclusive day count between two ISO date strings.
 */
function inclusiveDayCount(startISO: string, endISO: string): number {
  try {
    return Math.max(1, differenceInDays(parseISO(endISO), parseISO(startISO)) + 1);
  } catch {
    return 1;
  }
}

// ─── Main Adapter ────────────────────────────────────────────────────────

export function buildPdfReport(args: BuildPdfReportArgs): PdfReportResult {
  const { range, entries, medicationEffects = [] } = args;

  const totalDaysInRange = range.totalDaysInRange ?? inclusiveDayCount(range.startISO, range.endISO);

  // Build effect lookup: entry_id -> med_name -> score
  const effectsByEntry = new Map<number, Map<string, number>>();
  for (const eff of medicationEffects) {
    const score = eff.effect_score ?? mapEffectRatingToScore(eff.effect_rating);
    if (score === null) continue;
    let medMap = effectsByEntry.get(eff.entry_id);
    if (!medMap) {
      medMap = new Map();
      effectsByEntry.set(eff.entry_id, medMap);
    }
    medMap.set(eff.med_name, score);
  }

  // Map entries to ReportEntryInput
  const reportEntries: ReportEntryInput[] = [];

  for (const entry of entries) {
    const dateISO = getEntryDateISO(entry);
    if (!dateISO) continue;
    if (dateISO < range.startISO || dateISO > range.endISO) continue;

    const hasPain = isPainEntry(entry);
    const painMax = hasPain
      ? (entry.pain_level != null ? normalizePainLevel(entry.pain_level as string | number) : 0)
      : null;

    const meds = entry.medications || [];
    const acuteMedUsed = meds.length > 0;
    let triptanUsed = false;

    const entryEffects = effectsByEntry.get(Number(entry.id));

    const medications = meds.map(medName => {
      if (isTriptan(medName)) triptanUsed = true;
      const effect = entryEffects?.get(medName) ?? null;
      const intake = entry.medication_intakes?.find(i => i.medication_name === medName);
      return {
        medicationId: intake?.medication_id || medName,
        name: medName,
        effect,
      };
    });

    const meCfsLevels = mapMeCfsLevel(entry);

    reportEntries.push({
      dateISO,
      painMax,
      acuteMedUsed,
      triptanUsed,
      meCfsLevels: meCfsLevels.length > 0 ? meCfsLevels : undefined,
      medications: medications.length > 0 ? medications : undefined,
      documented: true,
    });
  }

  const report = computeMiaryReport({
    range: {
      startISO: range.startISO,
      endISO: range.endISO,
      timezone: range.timezone || 'Europe/Berlin',
      mode: range.mode || 'CUSTOM',
      totalDaysInRange,
    },
    entries: reportEntries,
  });

  return { report };
}
