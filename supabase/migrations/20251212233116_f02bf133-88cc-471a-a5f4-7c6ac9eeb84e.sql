-- Add follow-up appointment columns to reminders table
ALTER TABLE public.reminders
ADD COLUMN IF NOT EXISTS follow_up_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS follow_up_interval_value integer NULL,
ADD COLUMN IF NOT EXISTS follow_up_interval_unit text NULL,
ADD COLUMN IF NOT EXISTS next_follow_up_date date NULL,
ADD COLUMN IF NOT EXISTS series_id uuid NULL;

-- Add constraint for interval_unit
ALTER TABLE public.reminders
ADD CONSTRAINT reminders_follow_up_interval_unit_check 
CHECK (follow_up_interval_unit IS NULL OR follow_up_interval_unit IN ('weeks', 'months'));

-- Add index for series lookups
CREATE INDEX IF NOT EXISTS idx_reminders_series_id ON public.reminders(series_id) WHERE series_id IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN public.reminders.follow_up_enabled IS 'Whether follow-up appointment suggestion is enabled';
COMMENT ON COLUMN public.reminders.follow_up_interval_value IS 'Number of weeks/months until next follow-up';
COMMENT ON COLUMN public.reminders.follow_up_interval_unit IS 'Unit for follow-up interval: weeks or months';
COMMENT ON COLUMN public.reminders.next_follow_up_date IS 'Calculated date when next follow-up should be scheduled';
COMMENT ON COLUMN public.reminders.series_id IS 'UUID linking related follow-up appointments together';