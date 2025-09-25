-- Add latitude and longitude columns to pain_entries
ALTER TABLE public.pain_entries 
ADD COLUMN latitude NUMERIC,
ADD COLUMN longitude NUMERIC;

-- Update existing pain_entries with coordinates from their weather_logs
UPDATE public.pain_entries pe
SET 
  latitude = wl.latitude,
  longitude = wl.longitude
FROM public.weather_logs wl
WHERE pe.weather_id = wl.id
  AND pe.latitude IS NULL;

-- Add comment to document the new columns
COMMENT ON COLUMN public.pain_entries.latitude IS 'GPS latitude at time of entry creation';
COMMENT ON COLUMN public.pain_entries.longitude IS 'GPS longitude at time of entry creation';