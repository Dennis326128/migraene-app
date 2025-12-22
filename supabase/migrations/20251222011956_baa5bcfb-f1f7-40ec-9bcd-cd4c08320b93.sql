-- ═══════════════════════════════════════════════════════════════════════════
-- MEDICATION PHASES - Tracks start/stop periods for each medication
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE public.medication_phases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  medication_id UUID NOT NULL REFERENCES public.user_medications(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE,
  stop_reason TEXT,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.medication_phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own medication phases"
  ON public.medication_phases FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own medication phases"
  ON public.medication_phases FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own medication phases"
  ON public.medication_phases FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own medication phases"
  ON public.medication_phases FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_medication_phases_updated_at
  BEFORE UPDATE ON public.medication_phases
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for fast lookups
CREATE INDEX idx_medication_phases_medication_id ON public.medication_phases(medication_id);
CREATE INDEX idx_medication_phases_user_id ON public.medication_phases(user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION: Create initial phases for existing medications
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.medication_phases (user_id, medication_id, start_date, end_date)
SELECT 
  user_id,
  id,
  COALESCE(start_date, created_at::date),
  CASE 
    WHEN is_active = false OR discontinued_at IS NOT NULL THEN COALESCE(end_date, discontinued_at::date, CURRENT_DATE)
    ELSE NULL
  END
FROM public.user_medications;