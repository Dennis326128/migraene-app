-- Phase 1: Kern-Infrastruktur - Events-basiertes Schema

-- 1. Events Tabelle (Schmerzereignisse)
CREATE TABLE public.events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  type TEXT NOT NULL CHECK (type IN ('pain', 'quick_pain')) DEFAULT 'pain',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_min INTEGER,
  intensity_0_10 INTEGER CHECK (intensity_0_10 >= 0 AND intensity_0_10 <= 10),
  notes_extraordinary TEXT,
  default_symptoms_applied BOOLEAN DEFAULT false,
  location_geo POINT,
  weather_id BIGINT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. Event-Medikamente Junction Tabelle
CREATE TABLE public.event_meds (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  med_id UUID NOT NULL REFERENCES public.user_medications(id) ON DELETE CASCADE,
  dose_mg NUMERIC,
  units TEXT DEFAULT 'Stück',
  taken_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  source TEXT NOT NULL CHECK (source IN ('quick', 'regular')) DEFAULT 'regular',
  was_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. Medikamenten-Wirkung Tabelle
CREATE TABLE public.med_effects (
  id BIGSERIAL PRIMARY KEY,
  event_med_id BIGINT NOT NULL REFERENCES public.event_meds(id) ON DELETE CASCADE,
  effect_rating_0_4 INTEGER CHECK (effect_rating_0_4 >= 0 AND effect_rating_0_4 <= 4),
  pain_before_0_10 INTEGER CHECK (pain_before_0_10 >= 0 AND pain_before_0_10 <= 10),
  pain_after_0_10 INTEGER CHECK (pain_after_0_10 >= 0 AND pain_after_0_10 <= 10),
  relief_percent_0_100 INTEGER GENERATED ALWAYS AS (
    CASE 
      WHEN pain_before_0_10 > 0 AND pain_after_0_10 IS NOT NULL 
      THEN GREATEST(0, LEAST(100, ROUND(((pain_before_0_10 - pain_after_0_10)::NUMERIC / pain_before_0_10 * 100)::INTEGER)))
      ELSE NULL 
    END
  ) STORED,
  onset_min INTEGER,
  relief_duration_min INTEGER,
  side_effects_text TEXT,
  documented_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4. User Profiles erweitern
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS default_symptoms TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS quick_entry_mode BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS notes_layout TEXT CHECK (notes_layout IN ('single', 'split')) DEFAULT 'single';

-- 5. Weather Logs erweitern für Luftdrucktrend
ALTER TABLE public.weather_logs 
ADD COLUMN IF NOT EXISTS pressure_trend_24h NUMERIC;

-- 6. Reminder Queue Tabelle
CREATE TABLE public.reminder_queue (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  event_med_id BIGINT NOT NULL REFERENCES public.event_meds(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('med_effect')) DEFAULT 'med_effect',
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'completed', 'cancelled')) DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Row Level Security
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_meds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.med_effects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies für events
CREATE POLICY "events_select" ON public.events FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "events_insert" ON public.events FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "events_update" ON public.events FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "events_delete" ON public.events FOR DELETE USING (user_id = auth.uid());

-- RLS Policies für event_meds
CREATE POLICY "event_meds_select" ON public.event_meds FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_meds.event_id AND e.user_id = auth.uid())
);
CREATE POLICY "event_meds_insert" ON public.event_meds FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_meds.event_id AND e.user_id = auth.uid())
);
CREATE POLICY "event_meds_update" ON public.event_meds FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_meds.event_id AND e.user_id = auth.uid())
);
CREATE POLICY "event_meds_delete" ON public.event_meds FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_meds.event_id AND e.user_id = auth.uid())
);

-- RLS Policies für med_effects  
CREATE POLICY "med_effects_select" ON public.med_effects FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.event_meds em 
    JOIN public.events e ON e.id = em.event_id 
    WHERE em.id = med_effects.event_med_id AND e.user_id = auth.uid()
  )
);
CREATE POLICY "med_effects_insert" ON public.med_effects FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.event_meds em 
    JOIN public.events e ON e.id = em.event_id 
    WHERE em.id = med_effects.event_med_id AND e.user_id = auth.uid()
  )
);
CREATE POLICY "med_effects_update" ON public.med_effects FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.event_meds em 
    JOIN public.events e ON e.id = em.event_id 
    WHERE em.id = med_effects.event_med_id AND e.user_id = auth.uid()
  )
);
CREATE POLICY "med_effects_delete" ON public.med_effects FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.event_meds em 
    JOIN public.events e ON e.id = em.event_id 
    WHERE em.id = med_effects.event_med_id AND e.user_id = auth.uid()
  )
);

-- RLS Policies für reminder_queue
CREATE POLICY "reminder_queue_select" ON public.reminder_queue FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "reminder_queue_insert" ON public.reminder_queue FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "reminder_queue_update" ON public.reminder_queue FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "reminder_queue_delete" ON public.reminder_queue FOR DELETE USING (user_id = auth.uid());

-- Indizes für Performance
CREATE INDEX idx_events_user_started ON public.events(user_id, started_at DESC);
CREATE INDEX idx_events_type ON public.events(type);
CREATE INDEX idx_event_meds_event ON public.event_meds(event_id);
CREATE INDEX idx_event_meds_med ON public.event_meds(med_id);
CREATE INDEX idx_med_effects_event_med ON public.med_effects(event_med_id);
CREATE INDEX idx_med_effects_documented ON public.med_effects(documented_at DESC);
CREATE INDEX idx_reminder_queue_scheduled ON public.reminder_queue(scheduled_for) WHERE status = 'pending';
CREATE INDEX idx_reminder_queue_user_status ON public.reminder_queue(user_id, status);

-- Update Trigger für updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_reminder_queue_updated_at
  BEFORE UPDATE ON public.reminder_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RPC Funktionen
CREATE OR REPLACE FUNCTION public.create_quick_pain_event(
  p_intensity_0_10 INTEGER,
  p_medications JSONB DEFAULT '[]'::jsonb,
  p_notes TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_event_id BIGINT;
  v_med JSONB;
  v_med_id UUID;
  v_event_med_id BIGINT;
  v_user_id UUID := auth.uid();
  v_default_symptoms TEXT[];
BEGIN
  -- Hole Standard-Symptome des Users
  SELECT COALESCE(default_symptoms, '{}') INTO v_default_symptoms
  FROM user_profiles WHERE user_id = v_user_id;
  
  -- Erstelle Event
  INSERT INTO events (
    user_id, type, started_at, intensity_0_10, 
    notes_extraordinary, default_symptoms_applied
  ) VALUES (
    v_user_id, 'quick_pain', now(), p_intensity_0_10,
    p_notes, array_length(v_default_symptoms, 1) > 0
  ) RETURNING id INTO v_event_id;
  
  -- Füge Medikamente hinzu
  FOR v_med IN SELECT * FROM jsonb_array_elements(p_medications)
  LOOP
    v_med_id := (v_med->>'med_id')::UUID;
    
    INSERT INTO event_meds (
      event_id, med_id, dose_mg, units, source, was_default
    ) VALUES (
      v_event_id, v_med_id, 
      (v_med->>'dose_mg')::NUMERIC,
      COALESCE(v_med->>'units', 'Stück'),
      'quick',
      (v_med->>'was_default')::BOOLEAN
    ) RETURNING id INTO v_event_med_id;
    
    -- Schedule Reminder für Wirkungsdokumentation (2h später)
    INSERT INTO reminder_queue (
      user_id, event_med_id, reminder_type, scheduled_for
    ) VALUES (
      v_user_id, v_event_med_id, 'med_effect', now() + interval '2 hours'
    );
  END LOOP;
  
  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_med_effect(
  p_event_med_id BIGINT,
  p_effect_rating_0_4 INTEGER,
  p_pain_before_0_10 INTEGER DEFAULT NULL,
  p_pain_after_0_10 INTEGER DEFAULT NULL,
  p_onset_min INTEGER DEFAULT NULL,
  p_relief_duration_min INTEGER DEFAULT NULL,
  p_side_effects_text TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Validierung
  IF p_effect_rating_0_4 < 0 OR p_effect_rating_0_4 > 4 THEN
    RAISE EXCEPTION 'effect_rating_0_4 must be between 0 and 4';
  END IF;
  
  -- Upsert med_effects
  INSERT INTO med_effects (
    event_med_id, effect_rating_0_4, pain_before_0_10, pain_after_0_10,
    onset_min, relief_duration_min, side_effects_text
  ) VALUES (
    p_event_med_id, p_effect_rating_0_4, p_pain_before_0_10, p_pain_after_0_10,
    p_onset_min, p_relief_duration_min, p_side_effects_text
  )
  ON CONFLICT (event_med_id) DO UPDATE SET
    effect_rating_0_4 = EXCLUDED.effect_rating_0_4,
    pain_before_0_10 = EXCLUDED.pain_before_0_10,
    pain_after_0_10 = EXCLUDED.pain_after_0_10,
    onset_min = EXCLUDED.onset_min,
    relief_duration_min = EXCLUDED.relief_duration_min,
    side_effects_text = EXCLUDED.side_effects_text,
    documented_at = now();
  
  -- Markiere Reminder als completed
  UPDATE reminder_queue 
  SET status = 'completed', updated_at = now()
  WHERE event_med_id = p_event_med_id AND status = 'pending';
END;
$$;