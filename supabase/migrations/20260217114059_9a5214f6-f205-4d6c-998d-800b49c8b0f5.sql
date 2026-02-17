
-- Add mecfs_tracking_started_at to user_profiles
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS mecfs_tracking_started_at date DEFAULT NULL;

-- Comment for clarity
COMMENT ON COLUMN public.user_profiles.mecfs_tracking_started_at IS 'Date when ME/CFS tracking was first used by this user. Used to filter ME/CFS statistics to avoid backfill bias from entries created before the feature existed.';
