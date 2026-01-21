-- Daily Impact Assessments (Alltagsbelastung Kurzcheck)
-- Rechtssichere Alternative zum HIT-6 Fragebogen

CREATE TABLE public.daily_impact_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- Bezugszeitraum (letzte 4 Wochen)
  period_start_date date NOT NULL DEFAULT (CURRENT_DATE - INTERVAL '28 days')::date,
  period_end_date date NOT NULL DEFAULT CURRENT_DATE,
  
  -- 7 eigene Fragen, Antworten 0-4 (gar nicht bis sehr stark)
  answers jsonb NOT NULL,
  
  -- Score 0-28 (eigene Logik, NICHT HIT-6)
  score integer NOT NULL CHECK (score >= 0 AND score <= 28),
  
  -- Optional: Extern ausgefüllter HIT-6 Gesamtwert (36-78)
  external_hit6_score integer CHECK (external_hit6_score IS NULL OR (external_hit6_score >= 36 AND external_hit6_score <= 78)),
  external_hit6_date date,
  
  -- PDF-Tracking
  pdf_last_generated_at timestamptz
);

-- RLS aktivieren
ALTER TABLE public.daily_impact_assessments ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own daily impact assessments"
  ON public.daily_impact_assessments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own daily impact assessments"
  ON public.daily_impact_assessments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own daily impact assessments"
  ON public.daily_impact_assessments FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own daily impact assessments"
  ON public.daily_impact_assessments FOR DELETE
  USING (auth.uid() = user_id);

-- Index für schnelle Abfragen
CREATE INDEX idx_daily_impact_assessments_user_created 
  ON public.daily_impact_assessments(user_id, created_at DESC);