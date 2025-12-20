-- ═══════════════════════════════════════════════════════════════════════════
-- MEDICATION INTAKES TABLE: Fraktions-Dosis (½, ¼ Tabletten) Feature
-- ═══════════════════════════════════════════════════════════════════════════
-- Speichert Medikamenteneinnahmen mit Dosierung pro Eintrag
-- dose_quarters: Anzahl Viertel-Tabletten (1=¼, 2=½, 3=¾, 4=1, 6=1½, 8=2)
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Neue Tabelle für Medikamenteneinnahmen mit Dosis
CREATE TABLE public.medication_intakes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  entry_id BIGINT NOT NULL REFERENCES public.pain_entries(id) ON DELETE CASCADE,
  medication_id UUID REFERENCES public.user_medications(id) ON DELETE SET NULL,
  medication_name TEXT NOT NULL,
  dose_quarters INTEGER NOT NULL DEFAULT 4 CHECK (dose_quarters >= 1 AND dose_quarters <= 32),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. Indizes für Performance
CREATE INDEX idx_medication_intakes_user_id ON public.medication_intakes(user_id);
CREATE INDEX idx_medication_intakes_entry_id ON public.medication_intakes(entry_id);
CREATE INDEX idx_medication_intakes_medication_name ON public.medication_intakes(medication_name);
CREATE INDEX idx_medication_intakes_created_at ON public.medication_intakes(created_at);

-- 3. Unique Constraint: Ein Medikament pro Eintrag nur einmal
CREATE UNIQUE INDEX idx_medication_intakes_unique_entry_med 
  ON public.medication_intakes(entry_id, medication_name);

-- 4. RLS aktivieren
ALTER TABLE public.medication_intakes ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
CREATE POLICY "Users can view their own medication intakes"
  ON public.medication_intakes FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their own medication intakes"
  ON public.medication_intakes FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own medication intakes"
  ON public.medication_intakes FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own medication intakes"
  ON public.medication_intakes FOR DELETE
  USING (user_id = auth.uid());

-- 6. Trigger für updated_at
CREATE TRIGGER update_medication_intakes_updated_at
  BEFORE UPDATE ON public.medication_intakes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Migration bestehender Daten: Für alle existierenden pain_entries mit Medikamenten
--    werden medication_intakes mit dose_quarters = 4 (Standard 1 Tablette) erstellt
INSERT INTO public.medication_intakes (user_id, entry_id, medication_name, dose_quarters, created_at)
SELECT 
  pe.user_id,
  pe.id as entry_id,
  unnest(pe.medications) as medication_name,
  4 as dose_quarters,
  pe.timestamp_created as created_at
FROM public.pain_entries pe
WHERE pe.medications IS NOT NULL 
  AND array_length(pe.medications, 1) > 0
ON CONFLICT (entry_id, medication_name) DO NOTHING;