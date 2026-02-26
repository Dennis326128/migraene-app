-- Add weather_status tracking columns to pain_entries
ALTER TABLE public.pain_entries
  ADD COLUMN IF NOT EXISTS weather_status text NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS weather_error_code text,
  ADD COLUMN IF NOT EXISTS weather_error_at timestamptz,
  ADD COLUMN IF NOT EXISTS weather_retry_count integer NOT NULL DEFAULT 0;

-- Comment for clarity
COMMENT ON COLUMN public.pain_entries.weather_status IS 'ok | pending | failed — tracks weather fetch status for backfill';
COMMENT ON COLUMN public.pain_entries.weather_error_code IS 'Short error code from last failed weather fetch attempt';
COMMENT ON COLUMN public.pain_entries.weather_error_at IS 'Timestamp of last weather fetch failure';
COMMENT ON COLUMN public.pain_entries.weather_retry_count IS 'Number of weather backfill retry attempts';

-- Index for backfill query: find entries needing weather
CREATE INDEX IF NOT EXISTS idx_pain_entries_weather_pending
  ON public.pain_entries (user_id, weather_status)
  WHERE weather_status IN ('pending', 'failed') AND weather_id IS NULL;