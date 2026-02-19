
-- Add privacy flag for notes
ALTER TABLE public.pain_entries 
ADD COLUMN IF NOT EXISTS entry_note_is_private boolean NOT NULL DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN public.pain_entries.entry_note_is_private IS 'If true, notes are private and excluded from PDF/Code-Share by default';
