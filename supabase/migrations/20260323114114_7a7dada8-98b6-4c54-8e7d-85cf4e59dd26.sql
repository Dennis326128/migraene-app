-- Fix rpc_migraine_stats: align pain_level mapping with app SSOT
-- Canonical scale: leicht=2, mittel=5, stark=7, sehr_stark=9
-- Previously leicht was mapped to 3, which was inconsistent with the app

CREATE OR REPLACE FUNCTION public.rpc_migraine_stats(p_user uuid, p_from date, p_to date)
 RETURNS TABLE(total_entries bigint, avg_intensity numeric, with_medication_count bigint, most_common_location text, most_common_aura text, most_common_time_hour integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::bigint AS total_entries,
    ROUND(AVG(
      CASE 
        WHEN pain_level ~ '^\d+$' THEN pain_level::numeric
        WHEN pain_level = 'leicht' THEN 2
        WHEN pain_level = 'mittel' THEN 5
        WHEN pain_level = 'stark' THEN 7
        WHEN pain_level = 'sehr_stark' THEN 9
        ELSE 0
      END
    ), 1) AS avg_intensity,
    COUNT(*) FILTER (WHERE medications IS NOT NULL AND array_length(medications, 1) > 0)::bigint AS with_medication_count,
    (
      SELECT loc
      FROM pain_entries pe2, unnest(pe2.pain_locations) AS loc
      WHERE pe2.user_id = p_user
        AND pe2.selected_date BETWEEN p_from AND p_to
      GROUP BY loc
      ORDER BY COUNT(*) DESC
      LIMIT 1
    ) AS most_common_location,
    (
      SELECT aura_type
      FROM pain_entries pe3
      WHERE pe3.user_id = p_user
        AND pe3.selected_date BETWEEN p_from AND p_to
        AND pe3.aura_type IS NOT NULL
        AND pe3.aura_type != 'keine'
      GROUP BY aura_type
      ORDER BY COUNT(*) DESC
      LIMIT 1
    ) AS most_common_aura,
    (
      SELECT EXTRACT(HOUR FROM selected_time)::integer
      FROM pain_entries pe4
      WHERE pe4.user_id = p_user
        AND pe4.selected_date BETWEEN p_from AND p_to
        AND pe4.selected_time IS NOT NULL
      GROUP BY EXTRACT(HOUR FROM selected_time)
      ORDER BY COUNT(*) DESC
      LIMIT 1
    ) AS most_common_time_hour
  FROM pain_entries pe
  WHERE pe.user_id = p_user
    AND pe.selected_date BETWEEN p_from AND p_to;
END;
$function$;