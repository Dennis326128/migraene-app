-- Fix security issues: Remove problematic view and recreate functions with proper search_path

-- Drop the view (will recreate as a function instead)
DROP VIEW IF EXISTS v_migraine_daily;

-- Recreate functions with proper search_path
CREATE OR REPLACE FUNCTION rpc_entries_filtered(
  p_user uuid,
  p_from date,
  p_to date,
  p_levels text[] DEFAULT NULL,
  p_aura_types text[] DEFAULT NULL,
  p_pain_locations text[] DEFAULT NULL
)
RETURNS SETOF pain_entries
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT *
  FROM pain_entries
  WHERE user_id = p_user
    AND (timestamp_created AT TIME ZONE 'Europe/Berlin')::date BETWEEN p_from AND p_to
    AND (p_levels IS NULL OR pain_level = ANY(p_levels))
    AND (p_aura_types IS NULL OR aura_type = ANY(p_aura_types))
    AND (p_pain_locations IS NULL OR pain_location = ANY(p_pain_locations))
  ORDER BY timestamp_created DESC
$$;

CREATE OR REPLACE FUNCTION rpc_migraine_stats(
  p_user uuid,
  p_from date,
  p_to date
)
RETURNS TABLE(
  total_entries bigint,
  avg_intensity numeric,
  with_medication_count bigint,
  most_common_time_hour int,
  most_common_aura text,
  most_common_location text
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH stats AS (
    SELECT 
      count(*) as total,
      avg(case pain_level
            when 'leicht' then 2 when 'mittel' then 5
            when 'stark' then 7 when 'sehr_stark' then 9
            else 0
          end) as avg_score,
      sum(case when medications is not null and array_length(medications, 1) > 0 then 1 else 0 end) as med_count,
      mode() WITHIN GROUP (ORDER BY extract(hour from timestamp_created AT TIME ZONE 'Europe/Berlin')) as common_hour,
      mode() WITHIN GROUP (ORDER BY aura_type) FILTER (WHERE aura_type != 'keine') as common_aura,
      mode() WITHIN GROUP (ORDER BY pain_location) FILTER (WHERE pain_location IS NOT NULL) as common_location
    FROM pain_entries
    WHERE user_id = p_user
      AND (timestamp_created AT TIME ZONE 'Europe/Berlin')::date BETWEEN p_from AND p_to
      AND pain_level != '-'
  )
  SELECT 
    total,
    round(avg_score, 2),
    med_count,
    common_hour::int,
    common_aura,
    common_location
  FROM stats;
$$;

CREATE OR REPLACE FUNCTION rpc_time_distribution(
  p_user uuid,
  p_from date,
  p_to date
)
RETURNS TABLE(hour_of_day int, entry_count bigint)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT 
    extract(hour from timestamp_created AT TIME ZONE 'Europe/Berlin')::int as hour_of_day,
    count(*) as entry_count
  FROM pain_entries
  WHERE user_id = p_user
    AND (timestamp_created AT TIME ZONE 'Europe/Berlin')::date BETWEEN p_from AND p_to
    AND pain_level != '-'
  GROUP BY 1
  ORDER BY 1;
$$;