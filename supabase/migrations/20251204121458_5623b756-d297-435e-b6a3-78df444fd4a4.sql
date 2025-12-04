-- ═══════════════════════════════════════════════════════════════════════════
-- MEDICATION FORM ENHANCEMENT - Structured fields for German Medication Plan
-- ═══════════════════════════════════════════════════════════════════════════

-- Add intake_type to distinguish between as-needed and regular medications
ALTER TABLE public.user_medications 
ADD COLUMN IF NOT EXISTS intake_type text DEFAULT 'as_needed';

-- Add comment for intake_type
COMMENT ON COLUMN public.user_medications.intake_type IS 'Type of intake: as_needed (Bei Bedarf) or regular (Regelmäßig)';

-- Split strength into value and unit (keep staerke for backwards compatibility)
ALTER TABLE public.user_medications 
ADD COLUMN IF NOT EXISTS strength_value text,
ADD COLUMN IF NOT EXISTS strength_unit text DEFAULT 'mg';

-- Add typical indication dropdown value
ALTER TABLE public.user_medications 
ADD COLUMN IF NOT EXISTS typical_indication text;

-- ═══════════════════════════════════════════════════════════════════════════
-- AS-NEEDED (Bei Bedarf) STRUCTURED FIELDS
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.user_medications 
ADD COLUMN IF NOT EXISTS as_needed_standard_dose text,
ADD COLUMN IF NOT EXISTS as_needed_max_per_24h integer,
ADD COLUMN IF NOT EXISTS as_needed_max_days_per_month integer,
ADD COLUMN IF NOT EXISTS as_needed_min_interval_hours numeric,
ADD COLUMN IF NOT EXISTS as_needed_notes text;

-- Comments
COMMENT ON COLUMN public.user_medications.as_needed_standard_dose IS 'Standard dose per intake, e.g., 1 Tablette';
COMMENT ON COLUMN public.user_medications.as_needed_max_per_24h IS 'Maximum number of intakes per 24 hours';
COMMENT ON COLUMN public.user_medications.as_needed_max_days_per_month IS 'Maximum days per month for this medication';
COMMENT ON COLUMN public.user_medications.as_needed_min_interval_hours IS 'Minimum hours between intakes';
COMMENT ON COLUMN public.user_medications.as_needed_notes IS 'Additional notes for as-needed dosing';

-- ═══════════════════════════════════════════════════════════════════════════
-- REGULAR MEDICATION STRUCTURED FIELDS
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.user_medications 
ADD COLUMN IF NOT EXISTS regular_weekdays text[],
ADD COLUMN IF NOT EXISTS regular_notes text;

COMMENT ON COLUMN public.user_medications.regular_weekdays IS 'Array of weekday abbreviations: Mo, Di, Mi, Do, Fr, Sa, So. Empty = daily';
COMMENT ON COLUMN public.user_medications.regular_notes IS 'Additional notes for regular dosing';

-- ═══════════════════════════════════════════════════════════════════════════
-- INTOLERANCE ENHANCED FIELDS
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.user_medications 
ADD COLUMN IF NOT EXISTS intolerance_reason_type text,
ADD COLUMN IF NOT EXISTS medication_status text DEFAULT 'active';

COMMENT ON COLUMN public.user_medications.intolerance_reason_type IS 'Type: allergie, nebenwirkungen, wirkungslos, sonstiges';
COMMENT ON COLUMN public.user_medications.medication_status IS 'Status: active, stopped, intolerant';

-- ═══════════════════════════════════════════════════════════════════════════
-- DATA MIGRATION: Infer intake_type from existing art field
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE public.user_medications 
SET intake_type = CASE 
  WHEN art IN ('prophylaxe', 'regelmaessig') THEN 'regular'
  ELSE 'as_needed'
END
WHERE intake_type IS NULL OR intake_type = 'as_needed';

-- Infer medication_status from existing fields
UPDATE public.user_medications 
SET medication_status = CASE 
  WHEN intolerance_flag = true THEN 'intolerant'
  WHEN is_active = false OR discontinued_at IS NOT NULL THEN 'stopped'
  ELSE 'active'
END
WHERE medication_status IS NULL OR medication_status = 'active';