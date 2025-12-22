-- Add column for date display preference in medication plan export
ALTER TABLE public.user_report_settings
ADD COLUMN IF NOT EXISTS med_plan_include_dates boolean DEFAULT true;