-- Add effect_category field to user_medications for categorizing medication types
-- This is used for analysis, AI features, and future BMP enhancements

ALTER TABLE public.user_medications 
ADD COLUMN IF NOT EXISTS effect_category TEXT;

-- Add a comment to document the field
COMMENT ON COLUMN public.user_medications.effect_category IS 'Medication effect category for analysis (e.g., migraene_triptan, schmerzmittel_nsar)';