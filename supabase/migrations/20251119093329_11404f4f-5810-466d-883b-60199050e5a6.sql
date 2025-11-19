-- Update rpc_migraine_stats to exclude pain-free entries from average calculation
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
      -- Only calculate average for entries with actual pain (exclude 'keine' and '0')
      avg(case pain_level
            when 'leicht' then 2 when 'mittel' then 5
            when 'stark' then 7 when 'sehr_stark' then 9
            else null
          end) as avg_score,
      sum(case when medications is not null and array_length(medications, 1) > 0 then 1 else 0 end) as med_count,
      mode() WITHIN GROUP (ORDER BY extract(hour from timestamp_created AT TIME ZONE 'Europe/Berlin')) as common_hour,
      mode() WITHIN GROUP (ORDER BY aura_type) FILTER (WHERE aura_type != 'keine') as common_aura,
      mode() WITHIN GROUP (ORDER BY pain_location) FILTER (WHERE pain_location IS NOT NULL) as common_location
    FROM pain_entries
    WHERE user_id = p_user
      AND (timestamp_created AT TIME ZONE 'Europe/Berlin')::date BETWEEN p_from AND p_to
      AND pain_level != '-'
      AND pain_level != 'keine'
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