-- Add medication_limit_warning_threshold_pct to user_profiles
-- Default 80%, valid range 50-100%
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS medication_limit_warning_threshold_pct INTEGER NOT NULL DEFAULT 80;

-- Add CHECK constraint to prevent invalid values
ALTER TABLE user_profiles 
ADD CONSTRAINT valid_warning_threshold 
CHECK (medication_limit_warning_threshold_pct >= 50 AND medication_limit_warning_threshold_pct <= 100);