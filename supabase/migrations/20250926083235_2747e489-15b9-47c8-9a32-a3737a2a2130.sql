-- Phase 1: Drop backup table
DROP TABLE IF EXISTS weather_logs_dups_backup;

-- Phase 2: Drop duplicate event architecture tables and functions
DROP TABLE IF EXISTS med_effects CASCADE;
DROP TABLE IF EXISTS event_meds CASCADE;
DROP TABLE IF EXISTS reminder_queue CASCADE;
DROP TABLE IF EXISTS events CASCADE;

-- Drop related functions
DROP FUNCTION IF EXISTS create_quick_pain_event(integer, jsonb, text);
DROP FUNCTION IF EXISTS record_med_effect(bigint, integer, integer, integer, integer, integer, text);

-- Phase 3: Drop unused feature tables
DROP TABLE IF EXISTS entry_medications CASCADE;
DROP TABLE IF EXISTS hormonal_logs CASCADE;
DROP TABLE IF EXISTS lifestyle_logs CASCADE;
DROP TABLE IF EXISTS user_consents CASCADE;
DROP TABLE IF EXISTS user_settings CASCADE;
DROP TABLE IF EXISTS user_medication_limits CASCADE;

-- Phase 4: Clean up entry_symptoms foreign key references
-- Since we're keeping entry_symptoms but it references pain_entries
-- we need to ensure the relationship is properly maintained
ALTER TABLE entry_symptoms DROP CONSTRAINT IF EXISTS entry_symptoms_entry_id_fkey;
ALTER TABLE entry_symptoms ADD CONSTRAINT entry_symptoms_entry_id_fkey 
  FOREIGN KEY (entry_id) REFERENCES pain_entries(id) ON DELETE CASCADE;

-- Ensure proper indexes exist on remaining core tables
CREATE INDEX IF NOT EXISTS idx_pain_entries_user_date ON pain_entries(user_id, selected_date);
CREATE INDEX IF NOT EXISTS idx_pain_entries_weather ON pain_entries(weather_id);
CREATE INDEX IF NOT EXISTS idx_weather_logs_user_date ON weather_logs(user_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_user_medications_user ON user_medications(user_id);
CREATE INDEX IF NOT EXISTS idx_entry_symptoms_entry ON entry_symptoms(entry_id);

-- Clean up any orphaned data in remaining tables
DELETE FROM entry_symptoms 
WHERE entry_id NOT IN (SELECT id FROM pain_entries);

-- Verify final table structure
COMMENT ON TABLE pain_entries IS 'Core migraine/pain tracking entries';
COMMENT ON TABLE weather_logs IS 'Weather data for correlation analysis';
COMMENT ON TABLE user_medications IS 'User-defined medication list';
COMMENT ON TABLE user_profiles IS 'Extended user profile information';
COMMENT ON TABLE symptom_catalog IS 'Master list of available symptoms';
COMMENT ON TABLE entry_symptoms IS 'Links between entries and symptoms';
COMMENT ON TABLE audit_logs IS 'System audit trail';