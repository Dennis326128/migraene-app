-- Add ai_processing_consent column to user_consents
ALTER TABLE public.user_consents
ADD COLUMN IF NOT EXISTS ai_processing_consent boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS ai_processing_consent_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS ai_processing_consent_version text DEFAULT '1.0';

-- Helper function: check current user has active AI consent
CREATE OR REPLACE FUNCTION public.has_ai_consent(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT ai_processing_consent
      FROM public.user_consents
      WHERE user_id = p_user_id
        AND consent_withdrawn_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    ),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_ai_consent(uuid) TO authenticated, service_role;