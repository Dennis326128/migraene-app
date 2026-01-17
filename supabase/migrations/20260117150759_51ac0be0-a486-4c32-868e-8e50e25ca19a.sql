-- Add is_active column to doctors table for archiving functionality
-- Default is true (active) for existing and new doctors
ALTER TABLE public.doctors
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Add comment for documentation
COMMENT ON COLUMN public.doctors.is_active IS 'Whether the doctor is active (true) or archived (false). Archived doctors are not included in reports.';

-- Create index for filtering active doctors
CREATE INDEX IF NOT EXISTS idx_doctors_user_is_active ON public.doctors(user_id, is_active);