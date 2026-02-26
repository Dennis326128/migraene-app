/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Prophylaxis Domain Types — SSOT for CGRP Dose Event Resolution
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pure types. No I/O, no DB, no side effects.
 * Compatible with both browser (React) and Deno (Edge Functions).
 */

// ─── Supported CGRP prophylaxis drugs ────────────────────────────────────

export type ProphylaxisDrug = 'ajovy' | 'emgality' | 'aimovig' | 'vyepti' | 'other';

// ─── Evidence Sources (ordered by reliability) ──────────────────────────

export type EvidenceSource =
  | 'diary_medication_entry'   // P1: explicitly documented as taken in diary
  | 'reminder_completed'       // P2: reminder marked as done
  | 'diary_free_text'          // P3: keyword match in notes/free text
  | 'reminder_scheduled'       // P4: planned reminder (fallback)
  | 'inferred_from_pattern';   // P5: last resort (avoid)

// ─── Confidence levels ──────────────────────────────────────────────────

export type DoseConfidence = 1.0 | 0.9 | 0.8 | 0.6 | 0.5 | 0.4;

// ─── Evidence (individual data point supporting a dose event) ───────────

export interface DoseEvidence {
  source: EvidenceSource;
  rawId?: string;              // ID of diary entry / reminder
  timestampUtc?: string;       // ISO UTC if available
  dateKeyBerlin: string;       // 'YYYY-MM-DD' in Europe/Berlin (SSOT)
  score: number;               // 0..100 internal scoring
  notes?: string;              // debug info, not shown in UI
}

// ─── Dose Event (merged, deduplicated injection event) ──────────────────

export interface DoseEvent {
  drug: ProphylaxisDrug;
  dateKeyBerlin: string;       // injection day as Berlin calendar day (SSOT)
  timeLabelBerlin?: string;    // optional 'HH:mm'
  confidence: DoseConfidence;
  primarySource: EvidenceSource;
  evidences: DoseEvidence[];
}

// ─── Day-level features for pre/post analysis ───────────────────────────

export interface ProphylaxisDayFeature {
  dateKeyBerlin: string;
  documented: boolean;          // at least one diary entry (incl. "no symptoms")
  hadHeadache: boolean;
  painMax: number | null;
  acuteMedTaken: boolean;
  acuteMedCount: number;
}

// ─── Window Stats (pre or post injection) ───────────────────────────────

export interface WindowStats {
  windowDays: number;
  documentedDays: number;
  coverage: number;            // documentedDays / windowDays
  headacheDays: number;
  headacheRate: number;        // headacheDays / documentedDays (NaN-safe → 0)
  intensityMean: number | null;
  intensityMedian: number | null;
  intensityMax: number | null;
  acuteMedDays: number;
  acuteMedRate: number;        // acuteMedDays / documentedDays
  acuteMedCountSum: number;
  severeDays: number;          // painMax >= 7
}

// ─── Per-injection comparison ───────────────────────────────────────────

export interface DoseComparison {
  doseEvent: DoseEvent;
  pre: WindowStats;
  post: WindowStats;
  delta: {
    headacheRate: number;      // post - pre (negative = improvement)
    intensityMean: number | null;
    acuteMedRate: number;
  };
}

// ─── Aggregated prophylaxis analysis ────────────────────────────────────

export interface ProphylaxisAnalysis {
  drug: ProphylaxisDrug;
  doseEvents: DoseEvent[];
  comparisons: DoseComparison[];
  aggregate: {
    avgDeltaHeadacheRate: number | null;
    avgDeltaIntensityMean: number | null;
    avgDeltaAcuteMedRate: number | null;
  } | null;
  evidenceSummary: {
    countDoseEvents: number;
    primarySourcesDistribution: Partial<Record<EvidenceSource, number>>;
    bestConfidence: DoseConfidence | null;
    worstConfidence: DoseConfidence | null;
  };
}

// ─── Resolver Input ─────────────────────────────────────────────────────

export interface DiaryMedicationRecord {
  entryId: string | number;
  dateKeyBerlin: string;
  timestampUtc?: string;
  medicationNames: string[];
  notes?: string;
}

export interface MedicationIntakeRecord {
  id: string;
  medicationName: string;
  dateKeyBerlin: string;
  timestampUtc?: string;
}

export interface ReminderRecord {
  id: string;
  title: string;
  medications: string[];
  scheduledDateKeyBerlin: string;
  scheduledTimestampUtc?: string;
}

export interface ReminderCompletionRecord {
  reminderId: string;
  completedDateKeyBerlin: string;
  completedTimestampUtc?: string;
}

export interface ResolverInput {
  drug: ProphylaxisDrug;
  drugNames: string[];          // all known names/aliases for matching
  diaryEntries: DiaryMedicationRecord[];
  medicationIntakes: MedicationIntakeRecord[];
  reminders: ReminderRecord[];
  reminderCompletions: ReminderCompletionRecord[];
  timeRangeStartBerlin: string; // 'YYYY-MM-DD'
  timeRangeEndBerlin: string;   // 'YYYY-MM-DD'
}
