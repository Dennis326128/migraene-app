
-- Add disclaimer_version column to track which version was accepted
ALTER TABLE public.user_consents
ADD COLUMN IF NOT EXISTS medical_disclaimer_version text DEFAULT NULL;

-- Backfill: users who already accepted get version "1.0"
UPDATE public.user_consents
SET medical_disclaimer_version = '1.0'
WHERE medical_disclaimer_accepted_at IS NOT NULL
  AND medical_disclaimer_version IS NULL;
