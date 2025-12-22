-- Add medication plan export settings to user_report_settings
ALTER TABLE public.user_report_settings 
ADD COLUMN IF NOT EXISTS med_plan_include_inactive boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS med_plan_include_stop_reasons boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS med_plan_include_intolerances boolean DEFAULT true;