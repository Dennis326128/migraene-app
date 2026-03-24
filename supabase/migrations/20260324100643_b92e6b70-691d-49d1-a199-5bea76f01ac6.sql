-- Add appointment-specific fields to reminders table
-- custom_title: optional user-provided label (e.g. "MRT Kopf", "Botox-Termin")
-- doctor_id: optional FK to doctors table for appointment context

ALTER TABLE public.reminders 
  ADD COLUMN IF NOT EXISTS custom_title TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS doctor_id UUID DEFAULT NULL REFERENCES public.doctors(id) ON DELETE SET NULL;

-- Index for doctor_id lookups
CREATE INDEX IF NOT EXISTS idx_reminders_doctor_id ON public.reminders(doctor_id) WHERE doctor_id IS NOT NULL;

COMMENT ON COLUMN public.reminders.custom_title IS 'Optional user-provided appointment label. Takes priority over auto-generated title.';
COMMENT ON COLUMN public.reminders.doctor_id IS 'Optional reference to a doctor for appointment reminders.';