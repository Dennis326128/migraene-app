-- Update the repeat column constraint to include 'monthly'
ALTER TABLE public.reminders 
DROP CONSTRAINT IF EXISTS reminders_repeat_check;

ALTER TABLE public.reminders 
ADD CONSTRAINT reminders_repeat_check 
CHECK (repeat IN ('none', 'daily', 'weekly', 'monthly'));