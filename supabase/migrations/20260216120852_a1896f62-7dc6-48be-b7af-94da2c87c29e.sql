
-- 1) Add dedupe_key column (nullable initially for backfill)
ALTER TABLE public.reminders
ADD COLUMN IF NOT EXISTS dedupe_key text;

-- 2) Backfill dedupe_key for all existing rows
-- Formula: md5(type | med_identifier | time_key)
-- med_identifier: medication_id if set, else normalized title
-- time_key: for one-time (repeat='none'): date_time rounded to minute
--           for recurring: repeat + time_of_day or time portion
UPDATE public.reminders
SET dedupe_key = md5(
  type || '|' ||
  coalesce(medication_id::text, lower(trim(regexp_replace(title, '\s+', ' ', 'g')))) || '|' ||
  CASE
    WHEN repeat = 'none' THEN
      'once|' || to_char(date_time, 'YYYY-MM-DD"T"HH24:MI')
    ELSE
      repeat || '|' || coalesce(time_of_day, to_char(date_time, 'HH24:MI'))
  END
)
WHERE dedupe_key IS NULL;

-- 3) Clean up legacy duplicates: for each (user_id, dedupe_key) group with count>1,
--    keep the "canonical" row (prefer status='pending', latest updated_at) and delete the rest
DELETE FROM public.reminders
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id, dedupe_key
        ORDER BY
          CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
          notification_enabled DESC,
          updated_at DESC
      ) AS rn
    FROM public.reminders
    WHERE dedupe_key IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- 4) Now make dedupe_key NOT NULL
ALTER TABLE public.reminders
ALTER COLUMN dedupe_key SET NOT NULL;

-- 5) Create unique index for duplicate prevention
CREATE UNIQUE INDEX IF NOT EXISTS idx_reminders_user_dedupe
ON public.reminders (user_id, dedupe_key);
