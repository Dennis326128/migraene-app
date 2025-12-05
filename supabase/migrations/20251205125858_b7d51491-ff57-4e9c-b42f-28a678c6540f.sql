-- Add start_date and end_date columns to user_medications for therapy history
ALTER TABLE public.user_medications 
ADD COLUMN IF NOT EXISTS start_date date DEFAULT NULL,
ADD COLUMN IF NOT EXISTS end_date date DEFAULT NULL;

-- Add custom_reasons column to user_profiles for reusable custom application reasons
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS custom_medication_reasons text[] DEFAULT '{}';

-- Add comments for documentation
COMMENT ON COLUMN public.user_medications.start_date IS 'Start date of medication intake (optional)';
COMMENT ON COLUMN public.user_medications.end_date IS 'End date of medication intake - when medication was discontinued';
COMMENT ON COLUMN public.user_profiles.custom_medication_reasons IS 'User-defined custom application reasons for medications (e.g., Thrombose, Bluthochdruck)';