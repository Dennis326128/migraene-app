-- CRITICAL SECURITY FIXES: RLS Policies

-- 1. Fix audit_logs - add missing RLS policies (currently has RLS enabled but NO policies!)
CREATE POLICY "audit_logs_select" ON public.audit_logs
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "audit_logs_insert" ON public.audit_logs  
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- 2. Fix weather_logs_dups_backup - enable RLS and add policies
ALTER TABLE public.weather_logs_dups_backup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weather_dups_select" ON public.weather_logs_dups_backup
  FOR SELECT USING (user_id = auth.uid());

-- 3. Add missing DELETE policy for user_consents
CREATE POLICY "Users can delete their own consents" ON public.user_consents
  FOR DELETE USING (auth.uid() = user_id);

-- 4. Create missing lifestyle_logs table with full RLS
CREATE TABLE public.lifestyle_logs (
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

-- Create RLS policies for lifestyle_logs
CREATE POLICY "lifestyle_logs_select" ON public.lifestyle_logs
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "lifestyle_logs_insert" ON public.lifestyle_logs
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "lifestyle_logs_update" ON public.lifestyle_logs
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "lifestyle_logs_delete" ON public.lifestyle_logs
  FOR DELETE USING (user_id = auth.uid());

-- 5. Create missing hormonal_logs table with full RLS
CREATE TABLE public.hormonal_logs (
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

-- Create RLS policies for hormonal_logs
CREATE POLICY "hormonal_logs_select" ON public.hormonal_logs
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "hormonal_logs_insert" ON public.hormonal_logs
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "hormonal_logs_update" ON public.hormonal_logs
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "hormonal_logs_delete" ON public.hormonal_logs
  FOR DELETE USING (user_id = auth.uid());

-- 6. Add indexes for performance
CREATE INDEX idx_lifestyle_logs_user_date ON public.lifestyle_logs (user_id, log_date);
CREATE INDEX idx_hormonal_logs_user_date ON public.hormonal_logs (user_id, log_date);

-- 7. Add update triggers for updated_at columns
CREATE TRIGGER update_lifestyle_logs_updated_at
  BEFORE UPDATE ON public.lifestyle_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_hormonal_logs_updated_at
  BEFORE UPDATE ON public.hormonal_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();