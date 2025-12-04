-- Phase 1: Medikamenten-System Erweiterungen

-- 1.1 user_medications: Unverträglichkeits-Felder hinzufügen
ALTER TABLE user_medications
  ADD COLUMN IF NOT EXISTS intolerance_flag BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS intolerance_notes TEXT;

-- 1.2 medication_courses: Referenz auf user_medications hinzufügen
ALTER TABLE medication_courses
  ADD COLUMN IF NOT EXISTS medication_id UUID REFERENCES user_medications(id) ON DELETE SET NULL;

-- 1.3 Backfill: medication_courses.medication_id füllen per eindeutigem Match
UPDATE medication_courses mc
SET medication_id = um.id
FROM user_medications um
WHERE mc.user_id = um.user_id
  AND LOWER(TRIM(mc.medication_name)) = LOWER(TRIM(um.name))
  AND mc.medication_id IS NULL;

-- 1.4 Backfill: intolerance_flag setzen wenn Kurs mit nebenwirkungen-Absetzgrund existiert
UPDATE user_medications um
SET intolerance_flag = true
WHERE EXISTS (
  SELECT 1 FROM medication_courses mc
  WHERE mc.user_id = um.user_id
    AND LOWER(TRIM(mc.medication_name)) = LOWER(TRIM(um.name))
    AND mc.discontinuation_reason = 'nebenwirkungen'
)
AND um.intolerance_flag = false;