-- Phase 1: Populate GPS coordinates in pain_entries from weather_logs
-- This migration backfills missing GPS coordinates in pain_entries from linked weather_logs

-- First, update pain_entries that have weather_id but missing GPS coordinates
UPDATE pain_entries 
SET 
  latitude = w.latitude,
  longitude = w.longitude
FROM weather_logs w
WHERE pain_entries.weather_id = w.id 
  AND pain_entries.weather_id IS NOT NULL
  AND (pain_entries.latitude IS NULL OR pain_entries.longitude IS NULL);

-- Log the migration for audit
INSERT INTO audit_logs (user_id, action, table_name, record_id) 
SELECT DISTINCT 
  pe.user_id,
  'GPS_COORDINATE_BACKFILL',
  'pain_entries',
  pe.id::text
FROM pain_entries pe
JOIN weather_logs w ON pe.weather_id = w.id
WHERE pe.weather_id IS NOT NULL
  AND pe.latitude IS NOT NULL
  AND pe.longitude IS NOT NULL;