-- Add columns for entry notes and context notes persistence
ALTER TABLE public.user_report_settings 
ADD COLUMN IF NOT EXISTS include_entry_notes boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS include_context_notes boolean DEFAULT false;