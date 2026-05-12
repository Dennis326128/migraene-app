/**
 * AnalysisReportV21 — Schema V2.1
 *
 * Central type contract for the new KI-Analyse, shared by App and
 * Doctor-Share Website. Stored verbatim in `ai_reports.response_json`
 * alongside legacy fields (kept for back-compat).
 */

export type EvidenceLevel = "high" | "moderate" | "low" | "insufficient";

export type FindingCategory =
  | "burden"
  | "chronification"
  | "medication_use"
  | "medication_effect"
  | "preventive_course"
  | "symptoms_aura"
  | "weather"
  | "mecfs_energy_pem"
  | "sleep"
  | "stress_mood"
  | "lifestyle_triggers"
  | "time_pattern"
  | "cycle_hormonal"
  | "interaction"
  | "data_quality"
  | "red_flag";

export type FindingDirection =
  | "increased"
  | "decreased"
  | "mixed"
  | "unclear"
  | "not_applicable";

export type FindingTimeWindow =
  | "same_day"
  | "previous_day"
  | "previous_2_3_days"
  | "next_day"
  | "next_2_3_days"
  | "rolling_month"
  | "course_phase"
  | "not_applicable";

export interface AnalysisFinding {
  id: string;
  category: FindingCategory;
  title: string;
  evidence_level: EvidenceLevel;
  doctor_relevance: "high" | "medium" | "low";
  patient_relevance: "high" | "medium" | "low";
  direction: FindingDirection;
  time_window: FindingTimeWindow;
  plain_language_summary: string;
  deterministic_basis: {
    metric_names: string[];
    numerator?: number;
    denominator?: number;
    comparison_numerator?: number;
    comparison_denominator?: number;
    effect_label?: "strong" | "moderate" | "weak" | "none" | "not_calculated";
    coverage_rate?: number;
    sample_size_label: "adequate" | "limited" | "very_limited" | "none";
  };
  limitations: string[];
  recommended_tracking_next: string[];
  doctor_discussion_points: string[];
  should_show_in_doctor_share: boolean;
  privacy_notes?: string[];
}

export interface AnalysisReportV21 {
  schema_version: "2.1";
  analysis_version: string;
  period: {
    from: string;
    to: string;
    timezone: string;
    days_total: number;
  };
  data_basis: {
    documented_days: number;
    pain_days: number | null;
    migraine_like_days: number | null;
    medication_intake_days: number | null;
    weather_days: number | null;
    lifestyle_factor_days: number | null;
    mecfs_energy_days: number | null;
    effect_rating_count: number | null;
    private_notes_excluded: boolean;
  };
  clinical_caution: {
    no_diagnosis: true;
    emergency_disclaimer: string;
    uncertainty_policy: string;
  };
  findings: AnalysisFinding[];
  section_map: {
    summary: string[];
    strongest_findings: string[];
    weaker_findings: string[];
    burden_course: string[];
    medication: string[];
    weather_environment: string[];
    mecfs_energy: string[];
    symptoms_aura: string[];
    lifestyle_time_patterns: string[];
    data_quality: string[];
    open_questions: string[];
    red_flags: string[];
  };
  _preAnalysis?: unknown;
  _legacy?: unknown;
}

export const ANALYSIS_V21_VERSION = "2.1.0";
export const ANALYSIS_V21_SCHEMA: "2.1" = "2.1";
