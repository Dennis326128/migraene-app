-- Migration: Erweitere user_consents für Art. 9 DSGVO Gesundheitsdaten-Einwilligung

-- Neue Spalten hinzufügen
ALTER TABLE user_consents 
ADD COLUMN IF NOT EXISTS health_data_consent boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS health_data_consent_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS health_data_consent_version text DEFAULT '1.0',
ADD COLUMN IF NOT EXISTS medical_disclaimer_accepted_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS consent_withdrawn_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS withdrawal_reason text;

-- Index für Compliance-Abfragen
CREATE INDEX IF NOT EXISTS idx_consents_health_data 
ON user_consents(user_id, health_data_consent);

CREATE INDEX IF NOT EXISTS idx_consents_withdrawn 
ON user_consents(user_id, consent_withdrawn_at) 
WHERE consent_withdrawn_at IS NOT NULL;

-- Kommentar für Dokumentation
COMMENT ON COLUMN user_consents.health_data_consent IS 'Explizite Einwilligung zur Verarbeitung von Gesundheitsdaten nach Art. 9 DSGVO';
COMMENT ON COLUMN user_consents.health_data_consent_at IS 'Zeitpunkt der Einwilligung zur Gesundheitsdatenverarbeitung';
COMMENT ON COLUMN user_consents.consent_withdrawn_at IS 'Zeitpunkt des Einwilligungswiderrufs (wenn widerrufen)';