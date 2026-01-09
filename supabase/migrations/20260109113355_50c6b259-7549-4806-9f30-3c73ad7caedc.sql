-- Fix RPC functions for pain_locations (array) instead of pain_location (single)

-- 1. Update rpc_entries_filtered to use array overlap operator
CREATE OR REPLACE FUNCTION public.rpc_entries_filtered(
  p_user uuid, 
  p_from date, 
  p_to date, 
  p_levels text[] DEFAULT NULL::text[], 
  p_aura_types text[] DEFAULT NULL::text[], 
  p_pain_locations text[] DEFAULT NULL::text[]
)
RETURNS SETOF pain_entries
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT *
  FROM pain_entries
  WHERE user_id = p_user
    AND (timestamp_created AT TIME ZONE 'Europe/Berlin')::date BETWEEN p_from AND p_to
    AND (p_levels IS NULL OR pain_level = ANY(p_levels))
    AND (p_aura_types IS NULL OR aura_type = ANY(p_aura_types))
    AND (p_pain_locations IS NULL OR pain_locations && p_pain_locations)
  ORDER BY timestamp_created DESC
$function$;

-- 2. Update rpc_migraine_stats to use unnest for pain_locations array
CREATE OR REPLACE FUNCTION public.rpc_migraine_stats(p_user uuid, p_from date, p_to date)
RETURNS TABLE(
  total_entries bigint, 
  avg_intensity numeric, 
  with_medication_count bigint, 
  most_common_time_hour integer, 
  most_common_aura text, 
  most_common_location text
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH stats AS (
    SELECT 
      count(*) as total,
      avg(case pain_level
            when 'leicht' then 2 when 'mittel' then 5
            when 'stark' then 7 when 'sehr_stark' then 9
            else null
          end) as avg_score,
      sum(case when medications is not null and array_length(medications, 1) > 0 then 1 else 0 end) as med_count,
      mode() WITHIN GROUP (ORDER BY extract(hour from timestamp_created AT TIME ZONE 'Europe/Berlin')) as common_hour,
      mode() WITHIN GROUP (ORDER BY aura_type) FILTER (WHERE aura_type != 'keine') as common_aura
    FROM pain_entries
    WHERE user_id = p_user
      AND (timestamp_created AT TIME ZONE 'Europe/Berlin')::date BETWEEN p_from AND p_to
      AND pain_level != '-'
      AND pain_level != 'keine'
  ),
  location_stats AS (
    SELECT loc, count(*) as loc_count
    FROM (
      SELECT unnest(pain_locations) as loc
      FROM pain_entries 
      WHERE user_id = p_user 
        AND (timestamp_created AT TIME ZONE 'Europe/Berlin')::date BETWEEN p_from AND p_to
        AND pain_level != '-'
        AND pain_locations IS NOT NULL 
        AND array_length(pain_locations, 1) > 0
    ) sub 
    GROUP BY loc 
    ORDER BY loc_count DESC 
    LIMIT 1
  )
  SELECT 
    stats.total,
    round(stats.avg_score, 2),
    stats.med_count,
    stats.common_hour::int,
    stats.common_aura,
    location_stats.loc as common_location
  FROM stats
  LEFT JOIN location_stats ON true;
$function$;