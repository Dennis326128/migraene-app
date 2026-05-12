ALTER TABLE public.voice_notes
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

UPDATE public.voice_notes
  SET updated_at = COALESCE(captured_at, occurred_at, now())
  WHERE updated_at IS NULL OR updated_at = '1970-01-01'::timestamptz;

DROP TRIGGER IF EXISTS update_voice_notes_updated_at ON public.voice_notes;
CREATE TRIGGER update_voice_notes_updated_at
  BEFORE UPDATE ON public.voice_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_voice_notes_user_updated
  ON public.voice_notes(user_id, updated_at DESC)
  WHERE deleted_at IS NULL;