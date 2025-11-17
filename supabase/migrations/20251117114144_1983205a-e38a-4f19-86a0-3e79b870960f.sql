-- Add medications and time_of_day support to reminders table
ALTER TABLE reminders 
  ADD COLUMN IF NOT EXISTS medications text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS time_of_day text;

-- Add comment for time_of_day values
COMMENT ON COLUMN reminders.time_of_day IS 'Optional time of day category: morning, noon, evening, night';