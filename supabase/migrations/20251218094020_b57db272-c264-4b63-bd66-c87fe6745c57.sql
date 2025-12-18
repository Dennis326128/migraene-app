-- Add snooze fields to reminders table for "Später erinnern" functionality
ALTER TABLE public.reminders
ADD COLUMN IF NOT EXISTS snoozed_until timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS snooze_count integer DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN public.reminders.snoozed_until IS 'Timestamp until which the reminder is snoozed';
COMMENT ON COLUMN public.reminders.snooze_count IS 'Number of times this reminder has been snoozed';