-- Security Fix: Clean orphaned data and make user_id columns NOT NULL
-- This prevents orphaned data and strengthens RLS enforcement

-- Delete orphaned weather_logs row with NULL user_id
DELETE FROM weather_logs WHERE user_id IS NULL;

-- Make user_id NOT NULL on pain_entries
ALTER TABLE pain_entries 
ALTER COLUMN user_id SET NOT NULL;

-- Make user_id NOT NULL on user_medications
ALTER TABLE user_medications 
ALTER COLUMN user_id SET NOT NULL;

-- Make user_id NOT NULL on weather_logs
ALTER TABLE weather_logs 
ALTER COLUMN user_id SET NOT NULL;