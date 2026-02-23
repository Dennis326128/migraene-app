/**
 * ═══════════════════════════════════════════════════════════════════════════
 * App Analysis Adapter — Maps App data structures to SSOT report
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * NO DB calls. NO Date-Math. Pure mapping + aggregation delegation.
 * totalDaysInRange must be provided by the caller (from dayBuckets or UI).
 */

import type { ReportEntryInput, MiaryReportV2 } from '../types';
import { computeMiaryReport } from '../aggregate';
import { isPainEntry } from '@/lib/diary/isPainEntry';
import { normalizePainLevel } from '@/lib/utils/pain';
import { isTriptan } from '@/lib/medications/isTriptan';

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
    /** Total calendar days in range (from dayBuckets or upstream) */
    totalDaysInRange?: number;
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
 * IMPORTANT:
 * - "documented" = an entry exists for that day, regardless of pain_level.
 * - NO Date-Math here. Caller provides totalDaysInRange.
 * - Does NOT generate undocumented day entries; aggregate handles the gap
 *   via totalDaysInRange - documentedDays.
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
    medMap.set(eff.med_name, score);
  }

  // Build ReportEntryInput per raw entry; aggregate.ts merges by day.
  const reportEntries: ReportEntryInput[] = [];

  for (const entry of painEntries) {
    const dateISO = getEntryDateISO(entry);
    if (!dateISO) continue;
    if (dateISO < range.startISO || dateISO > range.endISO) continue;

    // Pain: only if isPainEntry(entry) true
    const hasPain = isPainEntry(entry);
    const painNumeric = hasPain && entry.pain_level != null
      ? normalizePainLevel(entry.pain_level as string | number)
      : null; // null for non-pain entries (lifestyle, trigger, etc.)

    // painMax:
    // - isPainEntry true → normalizePainLevel (can be 0 for "leicht"=0 or explicit 0)
    // - isPainEntry false → null (not a pain documentation)
    const painMax = hasPain ? (painNumeric ?? 0) : null;

    // Medications
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

    // ME/CFS
    const meCfsLevels = mapMeCfsLevel(entry);

    reportEntries.push({
      dateISO,
      painMax,
      acuteMedUsed,
      triptanUsed,
      meCfsLevels: meCfsLevels.length > 0 ? meCfsLevels : undefined,
      medications: medications.length > 0 ? medications : undefined,
      documented: true, // Every entry = documented
    });
  }

  const report = computeMiaryReport({
    range: {
      startISO: range.startISO,
      endISO: range.endISO,
      timezone: range.timezone,
      mode: range.mode,
      totalDaysInRange: range.totalDaysInRange,
    },
    entries: reportEntries,
  });

  return { report };
}
