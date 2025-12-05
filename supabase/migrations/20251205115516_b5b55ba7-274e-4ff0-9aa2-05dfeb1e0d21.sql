-- Add context_type and metadata columns to voice_notes for structured context entries
ALTER TABLE public.voice_notes 
ADD COLUMN IF NOT EXISTS context_type text DEFAULT 'notiz',
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.voice_notes.context_type IS 'Type of context note: tageszustand (from Alltag & Auslöser form), notiz (plain text note)';
COMMENT ON COLUMN public.voice_notes.metadata IS 'Structured data for tageszustand entries: { mood, stress, sleep, energy, triggers, notes }';