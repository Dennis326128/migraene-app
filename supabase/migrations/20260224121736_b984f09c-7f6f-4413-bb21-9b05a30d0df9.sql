
-- Add taken_at, taken_date, taken_time to medication_intakes for join-free queries
ALTER TABLE public.medication_intakes
  ADD COLUMN IF NOT EXISTS taken_at timestamptz,
  ADD COLUMN IF NOT EXISTS taken_date date,
  ADD COLUMN IF NOT EXISTS taken_time time;

-- Create index for efficient range queries on taken_date
CREATE INDEX IF NOT EXISTS idx_medication_intakes_taken_date
  ON public.medication_intakes (user_id, medication_name, taken_date DESC);

-- Create index for efficient sorting by taken_at
CREATE INDEX IF NOT EXISTS idx_medication_intakes_taken_at
  ON public.medication_intakes (user_id, medication_name, taken_at DESC);

-- Backfill from pain_entries: build taken_at from selected_date + selected_time, fallback to timestamp_created
UPDATE public.medication_intakes mi
SET
  taken_date = COALESCE(pe.selected_date, (pe.timestamp_created AT TIME ZONE 'Europe/Berlin')::date, (mi.created_at AT TIME ZONE 'Europe/Berlin')::date),
  taken_time = COALESCE(pe.selected_time, (pe.timestamp_created AT TIME ZONE 'Europe/Berlin')::time, (mi.created_at AT TIME ZONE 'Europe/Berlin')::time),
  taken_at = CASE
    WHEN pe.selected_date IS NOT NULL AND pe.selected_time IS NOT NULL THEN
      (pe.selected_date || 'T' || pe.selected_time)::timestamp AT TIME ZONE 'Europe/Berlin'
    WHEN pe.timestamp_created IS NOT NULL THEN
      pe.timestamp_created
    ELSE
      mi.created_at
  END
FROM public.pain_entries pe
WHERE mi.entry_id = pe.id
  AND mi.taken_at IS NULL;

-- For any orphaned intakes without a matching pain_entry, use created_at
UPDATE public.medication_intakes mi
SET
  taken_at = mi.created_at,
  taken_date = (mi.created_at AT TIME ZONE 'Europe/Berlin')::date,
  taken_time = (mi.created_at AT TIME ZONE 'Europe/Berlin')::time
WHERE mi.taken_at IS NULL;

-- Set NOT NULL defaults for future inserts
ALTER TABLE public.medication_intakes
  ALTER COLUMN taken_at SET DEFAULT now();
