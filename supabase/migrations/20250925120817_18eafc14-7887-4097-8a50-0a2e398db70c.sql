-- Add missing tables for complete data model

-- Create lifestyle_logs table for daily check-ins
CREATE TABLE IF NOT EXISTS public.lifestyle_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  log_date DATE NOT NULL,
  sleep_hours NUMERIC(3,1),
  sleep_quality INTEGER CHECK (sleep_quality >= 0 AND sleep_quality <= 10),
  caffeine_mg INTEGER DEFAULT 0,
  alcohol_units NUMERIC(3,1) DEFAULT 0,
  stress_level INTEGER CHECK (stress_level >= 0 AND stress_level <= 3),
  exercise_minutes INTEGER DEFAULT 0,
  trigger_foods TEXT[],
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on lifestyle_logs
ALTER TABLE public.lifestyle_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for lifestyle_logs (only if table is new)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lifestyle_logs' AND policyname = 'lifestyle_logs_select') THEN
        EXECUTE 'CREATE POLICY "lifestyle_logs_select" ON public.lifestyle_logs FOR SELECT USING (user_id = auth.uid())';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lifestyle_logs' AND policyname = 'lifestyle_logs_insert') THEN
        EXECUTE 'CREATE POLICY "lifestyle_logs_insert" ON public.lifestyle_logs FOR INSERT WITH CHECK (user_id = auth.uid())';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lifestyle_logs' AND policyname = 'lifestyle_logs_update') THEN
        EXECUTE 'CREATE POLICY "lifestyle_logs_update" ON public.lifestyle_logs FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lifestyle_logs' AND policyname = 'lifestyle_logs_delete') THEN
        EXECUTE 'CREATE POLICY "lifestyle_logs_delete" ON public.lifestyle_logs FOR DELETE USING (user_id = auth.uid())';
    END IF;
END
$$;

-- Create hormonal_logs table for cycle tracking
CREATE TABLE IF NOT EXISTS public.hormonal_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  log_date DATE NOT NULL,
  cycle_day INTEGER,
  cycle_phase TEXT CHECK (cycle_phase IN ('menstrual', 'follicular', 'ovulatory', 'luteal')),
  contraception_type TEXT,
  contraception_active BOOLEAN DEFAULT false,
  symptoms TEXT[],
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on hormonal_logs
ALTER TABLE public.hormonal_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for hormonal_logs (only if table is new)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'hormonal_logs' AND policyname = 'hormonal_logs_select') THEN
        EXECUTE 'CREATE POLICY "hormonal_logs_select" ON public.hormonal_logs FOR SELECT USING (user_id = auth.uid())';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'hormonal_logs' AND policyname = 'hormonal_logs_insert') THEN
        EXECUTE 'CREATE POLICY "hormonal_logs_insert" ON public.hormonal_logs FOR INSERT WITH CHECK (user_id = auth.uid())';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'hormonal_logs' AND policyname = 'hormonal_logs_update') THEN
        EXECUTE 'CREATE POLICY "hormonal_logs_update" ON public.hormonal_logs FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'hormonal_logs' AND policyname = 'hormonal_logs_delete') THEN
        EXECUTE 'CREATE POLICY "hormonal_logs_delete" ON public.hormonal_logs FOR DELETE USING (user_id = auth.uid())';
    END IF;
END
$$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_lifestyle_logs_user_date ON public.lifestyle_logs (user_id, log_date);
CREATE INDEX IF NOT EXISTS idx_hormonal_logs_user_date ON public.hormonal_logs (user_id, log_date);

-- Add update triggers
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'update_lifestyle_logs_updated_at') THEN
        EXECUTE 'CREATE TRIGGER update_lifestyle_logs_updated_at
          BEFORE UPDATE ON public.lifestyle_logs
          FOR EACH ROW
          EXECUTE FUNCTION public.update_updated_at_column()';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'update_hormonal_logs_updated_at') THEN
        EXECUTE 'CREATE TRIGGER update_hormonal_logs_updated_at
          BEFORE UPDATE ON public.hormonal_logs
          FOR EACH ROW
          EXECUTE FUNCTION public.update_updated_at_column()';
    END IF;
END
$$;