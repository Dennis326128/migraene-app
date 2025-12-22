-- Add medication_id FK to reminders table for intelligent linking
ALTER TABLE public.reminders 
ADD COLUMN IF NOT EXISTS medication_id uuid REFERENCES public.user_medications(id) ON DELETE SET NULL;

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_reminders_medication_id ON public.reminders(medication_id) WHERE medication_id IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN public.reminders.medication_id IS 'Optional FK to user_medications for direct medication-reminder linking';