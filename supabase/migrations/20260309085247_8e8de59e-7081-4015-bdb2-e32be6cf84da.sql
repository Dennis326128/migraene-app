
-- Backfill medication_intakes.taken_date from pain_entries.selected_date
-- where taken_date is currently NULL
UPDATE medication_intakes mi
SET 
  taken_date = pe.selected_date,
  taken_time = pe.selected_time
FROM pain_entries pe
WHERE mi.entry_id = pe.id
  AND mi.taken_date IS NULL
  AND pe.selected_date IS NOT NULL;
