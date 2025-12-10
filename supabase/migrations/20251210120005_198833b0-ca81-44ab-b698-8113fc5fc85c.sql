-- Add doctor export preferences to user_report_settings
ALTER TABLE public.user_report_settings 
ADD COLUMN IF NOT EXISTS last_doctor_export_ids uuid[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS last_include_doctors_flag boolean DEFAULT false;