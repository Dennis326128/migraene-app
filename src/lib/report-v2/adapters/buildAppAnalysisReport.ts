/**
 * ═══════════════════════════════════════════════════════════════════════════
 * App Analysis Adapter — Maps App data structures to SSOT report
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Bridges the gap between existing App data (pain_entries, medication_intakes)
 * and the SSOT computeMiaryReport() function.
 * 
 * NO DB calls. Pure mapping + aggregation delegation.
 */

import type { ComputeReportInput, ReportEntryInput, MiaryReportV2 } from '../types';
import { computeMiaryReport } from '../aggregate';
import { isPainEntry } from '@/lib/diary/isPainEntry';
import { normalizePainLevel } from '@/lib/utils/pain';
import { isTriptan } from '@/lib/medications/isTriptan';
import { enumerateDatesInclusive } from '@/lib/diary/dayBuckets';

// ─── Input Types (loose, matching what AnalysisView already has) ──────────

interface RawPainEntry {
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
  [key: string]: unknown;
}

interface RawMedicationEffect {
  entry_id: number;
  med_name: string;
  effect_rating?: string | null;
  effect_score?: number | null;
}

export interface AppAnalysisReportArgs {
  range: {
    startISO: string;
    endISO: string;
    timezone: string;
    mode: 'LAST_30_DAYS' | 'CUSTOM' | 'CALENDAR_MONTH';
  };
  painEntries: RawPainEntry[];
  medicationEffects?: RawMedicationEffect[];
}

export interface AppAnalysisResult {
  report: MiaryReportV2;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function getEntryDateISO(entry: RawPainEntry): string {
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

function mapMeCfsLevel(entry: RawPainEntry): Array<MeCfsSev | null> {
  const level = entry.me_cfs_severity_level;
  if (!level) return [];
  const valid: MeCfsSev[] = ['none', 'mild', 'moderate', 'severe'];
  if (valid.includes(level as MeCfsSev)) return [level as MeCfsSev];
  return [];
}

// ─── Main Adapter ────────────────────────────────────────────────────────

/**
 * Maps existing App data structures into SSOT ComputeReportInput,
 * calls computeMiaryReport(), and returns the result.
 * 
 * IMPORTANT: "documented" = an entry exists for that day, regardless of pain_level.
 * A day with pain_level=0 or entry_kind='lifestyle' IS documented.
 */
export function buildAppAnalysisReport(args: AppAnalysisReportArgs): AppAnalysisResult {
  const { range, painEntries, medicationEffects = [] } = args;

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
    // Keep last (or could average — but last is simpler and matches existing behavior)
    medMap.set(eff.med_name, score);
  }

  // Group entries by date, build ReportEntryInput per entry
  // We produce one ReportEntryInput per raw entry; aggregate.ts merges by day.
  const documentedDates = new Set<string>();
  const reportEntries: ReportEntryInput[] = [];

  for (const entry of painEntries) {
    const dateISO = getEntryDateISO(entry);
    if (!dateISO) continue;
    if (dateISO < range.startISO || dateISO > range.endISO) continue;

    documentedDates.add(dateISO);

    // Pain: only count if it's actually a pain entry with pain > 0
    const hasPain = isPainEntry(entry);
    const painNumeric = hasPain && entry.pain_level != null
      ? normalizePainLevel(entry.pain_level as string | number)
      : 0;

    // Medications
    const meds = entry.medications || [];
    let acuteMedUsed = meds.length > 0;
    let triptanUsed = false;

    const entryEffects = effectsByEntry.get(Number(entry.id));

    const medications = meds.map(medName => {
      if (isTriptan(medName)) triptanUsed = true;
      const effect = entryEffects?.get(medName) ?? null;
      // Use medication_name as ID if no dedicated medication_id
      const intake = entry.medication_intakes?.find(i => i.medication_name === medName);
      return {
        medicationId: intake?.medication_id || medName,
        name: medName,
        effect,
      };
    });

    // ME/CFS
    const meCfsLevels = mapMeCfsLevel(entry);

    reportEntries.push({
      dateISO,
      painMax: hasPain ? painNumeric : 0,
      acuteMedUsed,
      triptanUsed,
      meCfsLevels: meCfsLevels.length > 0 ? meCfsLevels : undefined,
      medications: medications.length > 0 ? medications : undefined,
      documented: true, // Every entry = documented
    });
  }

  // Add undocumented days (days in range with no entries)
  const allDatesInRange = enumerateDatesInclusive(range.startISO, range.endISO);
  for (const dateISO of allDatesInRange) {
    if (!documentedDates.has(dateISO)) {
      reportEntries.push({
        dateISO,
        painMax: null,
        acuteMedUsed: false,
        triptanUsed: false,
        documented: false,
      });
    }
  }

  const report = computeMiaryReport({
    range,
    entries: reportEntries,
  });

  return { report };
}
