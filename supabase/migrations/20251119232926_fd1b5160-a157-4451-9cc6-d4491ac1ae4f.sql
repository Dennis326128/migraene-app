-- Phase 1.1: RPC-Funktion für zuletzt verwendete Medikamente
-- Gibt die am häufigsten/zuletzt genutzten Medikamente zurück

CREATE OR REPLACE FUNCTION get_recent_medications(p_user_id uuid, p_limit int DEFAULT 5)
RETURNS TABLE (
  id uuid, 
  name text, 
  use_count bigint, 
  last_used timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    um.id,
    um.name,
    COUNT(pe.id) as use_count,
    MAX(pe.timestamp_created) as last_used
  FROM user_medications um
  LEFT JOIN pain_entries pe ON pe.user_id = p_user_id 
    AND um.name = ANY(pe.medications)
  WHERE um.user_id = p_user_id
  GROUP BY um.id, um.name
  ORDER BY last_used DESC NULLS LAST, use_count DESC
  LIMIT p_limit;
$$;