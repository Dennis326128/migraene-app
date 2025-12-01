-- ============================================
-- Schritt 1: Tabelle medication_courses
-- Speichert Prophylaxe-/Medikationsverläufe
-- ============================================

CREATE TABLE public.medication_courses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  medication_name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'prophylaxe' CHECK (type IN ('prophylaxe', 'akut', 'sonstige')),
  start_date DATE NOT NULL,
  end_date DATE NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  dose_text TEXT NULL,
  
  -- Baseline-Werte VOR Beginn der Behandlung (Patientenangaben)
  baseline_migraine_days TEXT NULL CHECK (baseline_migraine_days IN ('<5', '5-10', '11-15', '16-20', '>20', 'unknown')),
  baseline_acute_med_days TEXT NULL CHECK (baseline_acute_med_days IN ('<5', '5-10', '11-15', '16-20', '>20', 'unknown')),
  baseline_triptan_doses_per_month INTEGER NULL,
  baseline_impairment_level TEXT NULL CHECK (baseline_impairment_level IN ('wenig', 'mittel', 'stark', 'unknown')),
  
  -- Bewertung
  subjective_effectiveness INTEGER NULL CHECK (subjective_effectiveness >= 0 AND subjective_effectiveness <= 10),
  side_effects_text TEXT NULL,
  had_side_effects BOOLEAN NULL DEFAULT false,
  
  -- Absetzgrund
  discontinuation_reason TEXT NULL CHECK (discontinuation_reason IN ('keine_wirkung', 'nebenwirkungen', 'migraene_gebessert', 'kinderwunsch', 'andere', NULL)),
  discontinuation_details TEXT NULL,
  
  -- Notiz für Arzt
  note_for_physician TEXT NULL,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index für schnelle User-Abfragen
CREATE INDEX idx_medication_courses_user_id ON public.medication_courses(user_id);
CREATE INDEX idx_medication_courses_type ON public.medication_courses(type);
CREATE INDEX idx_medication_courses_is_active ON public.medication_courses(is_active);

-- RLS aktivieren
ALTER TABLE public.medication_courses ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Nutzer können nur eigene Daten sehen/bearbeiten
CREATE POLICY "Users can view their own medication courses"
  ON public.medication_courses
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own medication courses"
  ON public.medication_courses
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own medication courses"
  ON public.medication_courses
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own medication courses"
  ON public.medication_courses
  FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger für updated_at
CREATE TRIGGER update_medication_courses_updated_at
  BEFORE UPDATE ON public.medication_courses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();