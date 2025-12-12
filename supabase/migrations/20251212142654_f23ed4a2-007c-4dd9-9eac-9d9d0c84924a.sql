-- Add last_popup_date column to track when popup was last shown
ALTER TABLE public.reminders 
ADD COLUMN IF NOT EXISTS last_popup_date date DEFAULT NULL;

-- Add comment explaining the purpose
COMMENT ON COLUMN public.reminders.last_popup_date IS 'Date when the reminder popup was last shown to the user. Used to limit popups to once per day.';