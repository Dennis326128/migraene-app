-- Add tutorial tracking fields to user_profiles
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS tutorial_completed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS tutorial_completed_at timestamp with time zone DEFAULT NULL;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_tutorial_completed 
ON public.user_profiles(tutorial_completed);

-- Add comment for documentation
COMMENT ON COLUMN public.user_profiles.tutorial_completed IS 'Tracks if user has completed the app tutorial';
COMMENT ON COLUMN public.user_profiles.tutorial_completed_at IS 'Timestamp when user completed the tutorial';