-- Create table for HIT-6 assessment results
CREATE TABLE public.hit6_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  period_end_date date NOT NULL DEFAULT CURRENT_DATE,
  period_start_date date NOT NULL DEFAULT (CURRENT_DATE - INTERVAL '28 days')::date,
  answers jsonb NOT NULL,
  score integer NOT NULL CHECK (score >= 36 AND score <= 78),
  pdf_last_generated_at timestamptz
);

-- Enable RLS
ALTER TABLE public.hit6_assessments ENABLE ROW LEVEL SECURITY;

-- RLS policies for hit6_assessments
CREATE POLICY "Users can view their own HIT-6 assessments"
  ON public.hit6_assessments
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own HIT-6 assessments"
  ON public.hit6_assessments
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own HIT-6 assessments"
  ON public.hit6_assessments
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own HIT-6 assessments"
  ON public.hit6_assessments
  FOR DELETE
  USING (auth.uid() = user_id);

-- Index for efficient queries
CREATE INDEX idx_hit6_assessments_user_date ON public.hit6_assessments(user_id, created_at DESC);