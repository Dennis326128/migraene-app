-- Phase 2.1: Migration auf ID-basiertes System
-- Schritt 1: Neue Spalten hinzufügen (parallel zu bestehenden)

-- pain_entries: Neue Spalte für Medikamenten-IDs
ALTER TABLE pain_entries 
ADD COLUMN IF NOT EXISTS medication_ids uuid[] DEFAULT '{}';

-- medication_effects: Neue Spalte für Medikamenten-ID
ALTER TABLE medication_effects
ADD COLUMN IF NOT EXISTS medication_id uuid REFERENCES user_medications(id) ON DELETE CASCADE;

-- user_medication_limits: Neue Spalte für Medikamenten-ID
ALTER TABLE user_medication_limits
ADD COLUMN IF NOT EXISTS medication_id uuid REFERENCES user_medications(id) ON DELETE CASCADE;

-- Index für bessere Performance
CREATE INDEX IF NOT EXISTS idx_pain_entries_medication_ids ON pain_entries USING GIN(medication_ids);
CREATE INDEX IF NOT EXISTS idx_medication_effects_medication_id ON medication_effects(medication_id);
CREATE INDEX IF NOT EXISTS idx_user_medication_limits_medication_id ON user_medication_limits(medication_id);