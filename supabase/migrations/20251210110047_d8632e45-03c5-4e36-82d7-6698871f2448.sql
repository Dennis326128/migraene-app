-- ============================================
-- MIGRATION: Voice Context Analysis System
-- Hybrid-Ansatz: voice_notes + pain_entries Verknüpfung
-- ============================================

-- 1. pain_entries erweitern: Optionale Referenz auf voice_note
ALTER TABLE public.pain_entries
ADD COLUMN IF NOT EXISTS voice_note_id uuid REFERENCES public.voice_notes(id) ON DELETE SET NULL;

-- 2. Index für schnelle Lookups
CREATE INDEX IF NOT EXISTS idx_pain_entries_voice_note_id 
ON public.pain_entries(voice_note_id) 
WHERE voice_note_id IS NOT NULL;

-- 3. voice_notes erweitern: NLP-Verarbeitungsstatus
ALTER TABLE public.voice_notes
ADD COLUMN IF NOT EXISTS nlp_status text DEFAULT 'not_processed',
ADD COLUMN IF NOT EXISTS nlp_version text,
ADD COLUMN IF NOT EXISTS nlp_processed_at timestamp with time zone;

-- 4. Neue Tabelle: voice_note_segments (KI-extrahierte Segmente)
CREATE TABLE IF NOT EXISTS public.voice_note_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_note_id uuid NOT NULL REFERENCES public.voice_notes(id) ON DELETE CASCADE,
  segment_index integer NOT NULL,
  
  -- Segment-Klassifikation
  segment_type text NOT NULL DEFAULT 'unknown',
  -- Typen: 'medication_event', 'symptom_course', 'lifestyle_factor', 
  --        'trigger', 'protective_factor', 'time_pattern', 'meta_info', 'unknown'
  
  -- Originaler und normalisierter Text
  source_text text NOT NULL,
  normalized_summary text,
  
  -- Strukturierte Felder (optional, je nach segment_type)
  medication_name text,
  medication_dose text,
  medication_role text, -- 'akut', 'rescue', 'prophylaxe', 'begleit'
  effect_rating text, -- 'keine_wirkung', 'teilweise', 'gut', 'sehr_gut', 'verschlechterung'
  timing_relation text, -- 'vor_auftreten', 'waehrend', 'nach_auftreten', 'naechster_morgen'
  time_reference text, -- z.B. 'zweiter_dienstag_in_folge', 'heute_morgen'
  factor_type text, -- 'schlaf', 'stress', 'ernaehrung', 'koffein', 'alkohol', 'menstruation', 'wetter', 'sport'
  factor_value text, -- z.B. 'wenig_schlaf', 'viel_kaffee', 'kein_fruehstueck'
  
  -- Metadaten
  confidence numeric(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  is_ambiguous boolean DEFAULT false,
  
  -- Timestamps
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  
  -- Unique constraint: Ein Segment pro Index pro voice_note
  UNIQUE (voice_note_id, segment_index)
);

-- 5. Index für Segment-Queries
CREATE INDEX IF NOT EXISTS idx_voice_note_segments_voice_note_id 
ON public.voice_note_segments(voice_note_id);

CREATE INDEX IF NOT EXISTS idx_voice_note_segments_type 
ON public.voice_note_segments(segment_type);

CREATE INDEX IF NOT EXISTS idx_voice_note_segments_medication 
ON public.voice_note_segments(medication_name) 
WHERE medication_name IS NOT NULL;

-- 6. RLS für voice_note_segments (über voice_notes verkn뫋ft)
ALTER TABLE public.voice_note_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "segments_select_via_voice_note" ON public.voice_note_segments
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.voice_notes vn 
    WHERE vn.id = voice_note_segments.voice_note_id 
    AND vn.user_id = auth.uid()
    AND vn.deleted_at IS NULL
  )
);

CREATE POLICY "segments_insert_via_voice_note" ON public.voice_note_segments
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.voice_notes vn 
    WHERE vn.id = voice_note_segments.voice_note_id 
    AND vn.user_id = auth.uid()
  )
);

CREATE POLICY "segments_delete_via_voice_note" ON public.voice_note_segments
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.voice_notes vn 
    WHERE vn.id = voice_note_segments.voice_note_id 
    AND vn.user_id = auth.uid()
  )
);

-- 7. voice_notes erweitern: Optionales JSON für sonstige Fakten
ALTER TABLE public.voice_notes
ADD COLUMN IF NOT EXISTS extracted_facts jsonb DEFAULT '{}';

-- 8. Kommentare für Dokumentation
COMMENT ON TABLE public.voice_note_segments IS 'KI-extrahierte Kontext-Segmente aus Spracheingaben';
COMMENT ON COLUMN public.voice_note_segments.segment_type IS 'medication_event, symptom_course, lifestyle_factor, trigger, protective_factor, time_pattern, meta_info, unknown';
COMMENT ON COLUMN public.voice_note_segments.confidence IS 'KI-Konfidenz 0.0-1.0';
COMMENT ON COLUMN public.pain_entries.voice_note_id IS 'Optionale Verknüpfung zu voice_notes für erweiterte Kontextanalyse';