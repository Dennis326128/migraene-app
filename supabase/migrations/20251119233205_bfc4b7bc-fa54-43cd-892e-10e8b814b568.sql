-- Phase 2.1: Migration auf ID-basiertes System
-- Schritt 2: Bestehende Daten migrieren (Text → UUID)

-- pain_entries: Wandle medications array (text) → medication_ids array (uuid)
UPDATE pain_entries pe
SET medication_ids = (
  SELECT ARRAY_AGG(DISTINCT um.id)
  FROM unnest(pe.medications) AS med_name
  JOIN user_medications um ON um.user_id = pe.user_id 
    AND LOWER(TRIM(um.name)) = LOWER(TRIM(med_name))
)
WHERE pe.medications IS NOT NULL 
  AND array_length(pe.medications, 1) > 0
  AND (pe.medication_ids IS NULL OR array_length(pe.medication_ids, 1) = 0);

-- medication_effects: Wandle med_name (text) → medication_id (uuid)
UPDATE medication_effects me
SET medication_id = (
  SELECT um.id
  FROM user_medications um
  JOIN pain_entries pe ON pe.id = me.entry_id
  WHERE um.user_id = pe.user_id
    AND LOWER(TRIM(um.name)) = LOWER(TRIM(me.med_name))
  LIMIT 1
)
WHERE me.medication_id IS NULL
  AND me.med_name IS NOT NULL;

-- user_medication_limits: Wandle medication_name (text) → medication_id (uuid)
UPDATE user_medication_limits uml
SET medication_id = (
  SELECT um.id
  FROM user_medications um
  WHERE um.user_id = uml.user_id
    AND LOWER(TRIM(um.name)) = LOWER(TRIM(uml.medication_name))
  LIMIT 1
)
WHERE uml.medication_id IS NULL
  AND uml.medication_name IS NOT NULL;