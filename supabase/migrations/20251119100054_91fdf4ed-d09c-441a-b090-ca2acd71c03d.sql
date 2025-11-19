-- Fix security warning: Set explicit search_path for rpc_migraine_stats function
-- This prevents search_path manipulation attacks

CREATE OR REPLACE FUNCTION rpc_migraine_stats(
  p_user uuid,
  p_from text,
  p_to text
)
RETURNS TABLE (
  total_entries bigint,
  avg_intensity numeric,
  most_common_aura text,
  most_common_location text,
  most_common_time_hour int,
  with_medication_count bigint
) AS $$
BEGIN
  RETURN QUERY
  WITH entries_in_range AS (
    SELECT 
      e.pain_level,
      e.aura_type,
      e.pain_location,
      e.selected_time,
      e.medications
    FROM pain_entries e
    WHERE e.user_id = p_user
      AND COALESCE(e.selected_date::text, e.timestamp_created::text) >= p_from
      AND COALESCE(e.selected_date::text, e.timestamp_created::text) <= p_to
  ),
  pain_mapping AS (
    SELECT 
      *,
      CASE pain_level
        WHEN 'keine' THEN 0
        WHEN 'leicht' THEN 1
        WHEN 'mittel' THEN 2
        WHEN 'stark' THEN 3
        WHEN 'sehr stark' THEN 4
        ELSE 0
      END as pain_numeric
    FROM entries_in_range
  )
  SELECT
    COUNT(*)::bigint as total_entries,
    -- Only calculate average for entries with pain_level > 0
    COALESCE(
      ROUND(
        AVG(pain_numeric) FILTER (WHERE pain_numeric > 0), 
        2
      ), 
      0
    ) as avg_intensity,
    COALESCE(
      (SELECT aura_type 
       FROM pain_mapping 
       WHERE aura_type IS NOT NULL AND aura_type != '' 
       GROUP BY aura_type 
       ORDER BY COUNT(*) DESC 
       LIMIT 1),
      'keine'
    ) as most_common_aura,
    COALESCE(
      (SELECT pain_location 
       FROM pain_mapping 
       WHERE pain_location IS NOT NULL AND pain_location != '' 
       GROUP BY pain_location 
       ORDER BY COUNT(*) DESC 
       LIMIT 1),
      'unbekannt'
    ) as most_common_location,
    COALESCE(
      (SELECT EXTRACT(HOUR FROM selected_time)::int 
       FROM pain_mapping 
       WHERE selected_time IS NOT NULL 
       GROUP BY EXTRACT(HOUR FROM selected_time) 
       ORDER BY COUNT(*) DESC 
       LIMIT 1),
      0
    ) as most_common_time_hour,
    COUNT(*) FILTER (WHERE medications IS NOT NULL AND array_length(medications, 1) > 0)::bigint as with_medication_count
  FROM pain_mapping;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;