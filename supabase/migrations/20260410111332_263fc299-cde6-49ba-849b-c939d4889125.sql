-- Add updated_at column to pain_entries
ALTER TABLE public.pain_entries
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();

-- Backfill: set updated_at = timestamp_created for all existing rows
UPDATE public.pain_entries SET updated_at = COALESCE(timestamp_created, now()) WHERE updated_at = now();

-- Create trigger to auto-update updated_at on row changes
CREATE OR REPLACE TRIGGER update_pain_entries_updated_at
BEFORE UPDATE ON public.pain_entries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();