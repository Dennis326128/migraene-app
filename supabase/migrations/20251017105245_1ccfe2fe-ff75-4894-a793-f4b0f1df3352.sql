-- 1. Haupttabelle für Voice-Notizen
CREATE TABLE IF NOT EXISTS voice_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Kernfelder
  text TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  tz TEXT NOT NULL DEFAULT 'Europe/Berlin',
  
  -- Metadaten
  source TEXT NOT NULL DEFAULT 'voice',
  stt_confidence NUMERIC(4,3),
  
  -- Soft-Delete
  deleted_at TIMESTAMPTZ,
  
  -- Full-Text-Search (automatisch generiert)
  text_fts TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('german', coalesce(text, ''))
  ) STORED
);

-- 2. Indizes für Performance
CREATE INDEX IF NOT EXISTS idx_voice_notes_user_time 
  ON voice_notes(user_id, occurred_at DESC) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_voice_notes_fts 
  ON voice_notes USING GIN (text_fts);

CREATE INDEX IF NOT EXISTS idx_voice_notes_captured 
  ON voice_notes(user_id, captured_at DESC);

-- 3. Row Level Security
ALTER TABLE voice_notes ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY voice_notes_select_owner 
ON voice_notes FOR SELECT 
USING (auth.uid() = user_id AND deleted_at IS NULL);

CREATE POLICY voice_notes_insert_owner 
ON voice_notes FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY voice_notes_update_owner 
ON voice_notes FOR UPDATE 
USING (auth.uid() = user_id);