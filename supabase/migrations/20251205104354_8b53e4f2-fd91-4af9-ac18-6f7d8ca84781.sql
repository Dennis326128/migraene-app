-- Add track_cycle column to user_profiles for conditional cycle tracking display
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS track_cycle BOOLEAN DEFAULT false;