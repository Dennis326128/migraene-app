
-- Voice Events: Vollständige Erfassung aller Spracheingaben
CREATE TABLE public.voice_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Rohkontext (IMMER befüllt)
  raw_transcript text NOT NULL,
  cleaned_transcript text,
  
  -- Zeitbezug
  event_timestamp timestamptz NOT NULL DEFAULT now(),
  tz text NOT NULL DEFAULT 'Europe/Berlin',
  
  -- Klassifikation (multi-label, kann leer sein)
  event_types text[] NOT NULL DEFAULT '{}',
  event_subtypes text[] NOT NULL DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  
  -- Confidence
  confidence numeric(4,3) DEFAULT NULL,
  stt_confidence numeric(4,3) DEFAULT NULL,
  
  -- Review & Status
  review_state text NOT NULL DEFAULT 'auto_saved',
  medical_relevance text NOT NULL DEFAULT 'unknown',
  analysis_ready boolean NOT NULL DEFAULT true,
  parsing_status text NOT NULL DEFAULT 'pending',
  
  -- Verknüpfungen
  related_entry_id bigint REFERENCES public.pain_entries(id) ON DELETE SET NULL,
  voice_note_id uuid REFERENCES public.voice_notes(id) ON DELETE SET NULL,
  session_id uuid DEFAULT NULL,
  
  -- Strukturierte Extraktion (optional, ergänzend)
  structured_data jsonb DEFAULT NULL,
  segments jsonb DEFAULT NULL,
  
  -- Quelle
  source text NOT NULL DEFAULT 'voice'
);

-- Indizes
CREATE INDEX idx_voice_events_user_id ON public.voice_events(user_id);
CREATE INDEX idx_voice_events_user_created ON public.voice_events(user_id, created_at DESC);
CREATE INDEX idx_voice_events_event_types ON public.voice_events USING GIN(event_types);
CREATE INDEX idx_voice_events_tags ON public.voice_events USING GIN(tags);
CREATE INDEX idx_voice_events_event_timestamp ON public.voice_events(user_id, event_timestamp DESC);
CREATE INDEX idx_voice_events_session ON public.voice_events(session_id) WHERE session_id IS NOT NULL;

-- Volltextsuche auf Transkripten
ALTER TABLE public.voice_events ADD COLUMN transcript_fts tsvector
  GENERATED ALWAYS AS (to_tsvector('german', coalesce(raw_transcript, '') || ' ' || coalesce(cleaned_transcript, ''))) STORED;
CREATE INDEX idx_voice_events_fts ON public.voice_events USING GIN(transcript_fts);

-- RLS
ALTER TABLE public.voice_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own voice events"
  ON public.voice_events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own voice events"
  ON public.voice_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own voice events"
  ON public.voice_events FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own voice events"
  ON public.voice_events FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Auto-update updated_at
CREATE TRIGGER update_voice_events_updated_at
  BEFORE UPDATE ON public.voice_events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
