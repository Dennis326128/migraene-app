-- ========================================
-- Migration: Fix Weather Duplicate Bug
-- Lösung ohne problematische Funktionen im INDEX
-- ========================================

-- 1. Entferne problematischen UNIQUE INDEX
DROP INDEX IF EXISTS public.weather_logs_user_date_uidx;

-- 2. Neue Spalten für präzises Tracking
ALTER TABLE public.weather_logs 
ADD COLUMN IF NOT EXISTS requested_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS lat_rounded NUMERIC GENERATED ALWAYS AS (ROUND(latitude::numeric, 2)) STORED,
ADD COLUMN IF NOT EXISTS lon_rounded NUMERIC GENERATED ALWAYS AS (ROUND(longitude::numeric, 2)) STORED;

-- 3. Befülle bestehende Daten
UPDATE public.weather_logs 
SET requested_at = created_at 
WHERE requested_at IS NULL;

-- 4. Trigger: Auto-fill requested_at
CREATE OR REPLACE FUNCTION public.auto_fill_requested_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.requested_at IS NULL THEN
    NEW.requested_at := NEW.created_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_fill_requested_at ON public.weather_logs;
CREATE TRIGGER trigger_auto_fill_requested_at
BEFORE INSERT ON public.weather_logs
FOR EACH ROW
EXECUTE FUNCTION public.auto_fill_requested_at();

-- 5. Einfacher Index für Caching (ohne date_trunc)
CREATE INDEX IF NOT EXISTS idx_weather_logs_requested_at 
ON public.weather_logs(user_id, requested_at, lat_rounded, lon_rounded);

-- 6. Kein strikter UNIQUE INDEX mehr
-- Stattdessen: Duplikaterkennung in der Anwendungslogik (5km Radius)
-- Das erlaubt flexible Caching ohne DB-Constraints zu verletzen