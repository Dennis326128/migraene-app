-- Migration: user_consents robust machen - UNIQUE constraint auf user_id

-- Zuerst eventuell doppelte Einträge bereinigen (behalte neuesten)
DELETE FROM user_consents 
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id) id 
  FROM user_consents 
  ORDER BY user_id, created_at DESC
);

-- UNIQUE constraint hinzufügen
ALTER TABLE user_consents 
ADD CONSTRAINT user_consents_user_id_unique UNIQUE (user_id);

-- Kommentar
COMMENT ON CONSTRAINT user_consents_user_id_unique ON user_consents IS 'Stellt sicher, dass pro User genau ein Consent-Datensatz existiert';