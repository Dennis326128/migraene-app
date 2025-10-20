-- Add ai_enabled flag to user_profiles for AI-powered voice note analysis
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN user_profiles.ai_enabled IS 'Enables AI-powered pattern recognition and insights for voice notes';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_ai_enabled 
ON user_profiles(user_id, ai_enabled);