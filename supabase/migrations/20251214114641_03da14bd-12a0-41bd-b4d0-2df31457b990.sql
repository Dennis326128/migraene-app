-- Add notify_offsets_minutes column for iPhone-style notification offsets
ALTER TABLE reminders 
ADD COLUMN IF NOT EXISTS notify_offsets_minutes int[] NULL;

-- Set default for appointments: 1 day (1440) and 2 hours (120) before
COMMENT ON COLUMN reminders.notify_offsets_minutes IS 'Array of notification offset minutes before reminder. Default for appointments: [1440, 120] (1 day, 2 hours).';