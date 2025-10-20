-- Add voice notes enabled toggle to user profiles
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS voice_notes_enabled BOOLEAN NOT NULL DEFAULT true;

-- Add comment for documentation
COMMENT ON COLUMN user_profiles.voice_notes_enabled IS 'User consent for storing and analyzing voice notes';