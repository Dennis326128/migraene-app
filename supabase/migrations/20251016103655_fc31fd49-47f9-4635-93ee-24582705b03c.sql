-- Phase 4: User Consent Tracking
-- Tabelle für rechtssichere Speicherung von Nutzer-Zustimmungen

CREATE TABLE IF NOT EXISTS public.user_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  terms_accepted_at timestamptz NOT NULL DEFAULT now(),
  terms_version text NOT NULL DEFAULT '1.0',
  privacy_accepted_at timestamptz NOT NULL DEFAULT now(),
  privacy_version text NOT NULL DEFAULT '1.0',
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- RLS aktivieren
ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

-- Policy: Nutzer können nur eigene Consents sehen
CREATE POLICY "Users can view their own consents"
ON public.user_consents
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Policy: Nutzer können Consents beim Signup einfügen
CREATE POLICY "Users can insert their own consents"
ON public.user_consents
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Index für Performance
CREATE INDEX idx_user_consents_user_id ON public.user_consents(user_id);

-- Audit-Log-Trigger für Consent-Änderungen
CREATE OR REPLACE FUNCTION log_consent_to_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO audit_logs (user_id, action, table_name, old_data)
  VALUES (
    NEW.user_id,
    'CONSENT_ACCEPTED',
    'user_consents',
    jsonb_build_object(
      'terms_version', NEW.terms_version,
      'privacy_version', NEW.privacy_version,
      'timestamp', NEW.created_at
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER consent_audit_trigger
AFTER INSERT ON public.user_consents
FOR EACH ROW
EXECUTE FUNCTION log_consent_to_audit();