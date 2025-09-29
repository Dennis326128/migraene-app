-- Add default_pain_location to user_profiles table for persistent pain location selection
ALTER TABLE public.user_profiles 
ADD COLUMN default_pain_location text;

-- Add comment for documentation
COMMENT ON COLUMN public.user_profiles.default_pain_location IS 'User''s last selected pain location, used as default for new entries';