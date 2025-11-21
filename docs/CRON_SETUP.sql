-- ========================================
-- Cron-Job Setup für automatisches Weather-Backfill
-- ========================================
-- 
-- Diese SQL-Statements müssen in der Supabase SQL Console ausgeführt werden,
-- um den automatischen Weather-Backfill einzurichten.
--
-- WICHTIG: Ersetze 'dev-test-secret' durch einen sicheren Wert in Production!
-- ========================================

-- Schritt 1: Aktiviere benötigte Extensions (falls noch nicht aktiv)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Schritt 2: Lösche alte Cron-Jobs (falls vorhanden)
SELECT cron.unschedule('auto-weather-backfill-job');

-- Schritt 3: Erstelle neuen Cron-Job für Weather-Backfill
-- Läuft alle 3 Stunden zur vollen Stunde (00:00, 03:00, 06:00, ...)
SELECT cron.schedule(
  'auto-weather-backfill-job',       -- Job-Name
  '0 */3 * * *',                     -- Cron-Ausdruck: Alle 3 Stunden
  $$
  SELECT net.http_post(
    url := 'https://lzcbjciqrhsezxkjeyhb.supabase.co/functions/v1/auto-weather-backfill',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'dev-test-secret'  -- ⚠️ In Production ändern!
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Schritt 4: Prüfe ob der Cron-Job erstellt wurde
SELECT 
  jobid,
  jobname,
  schedule,
  active,
  command
FROM cron.job 
WHERE jobname = 'auto-weather-backfill-job';

-- Erwartetes Ergebnis:
-- jobid | jobname                    | schedule    | active | command
-- ------|----------------------------|-------------|--------|----------
-- 1     | auto-weather-backfill-job  | 0 */3 * * * | true   | SELECT net.http_post(...)

-- ========================================
-- Zusätzliche Cron-Ausdrücke (zur Info)
-- ========================================
--
-- Jede Stunde:        '0 * * * *'
-- Alle 6 Stunden:     '0 */6 * * *'
-- Täglich um 02:00:   '0 2 * * *'
-- Alle 15 Minuten:    '*/15 * * * *'
--
-- Format: Minute Stunde Tag Monat Wochentag
--
-- ========================================
-- Cron-Job Management
-- ========================================

-- Alle Cron-Jobs anzeigen:
SELECT * FROM cron.job;

-- Job pausieren (deaktivieren):
UPDATE cron.job SET active = false WHERE jobname = 'auto-weather-backfill-job';

-- Job aktivieren:
UPDATE cron.job SET active = true WHERE jobname = 'auto-weather-backfill-job';

-- Job löschen:
SELECT cron.unschedule('auto-weather-backfill-job');

-- ========================================
-- Job-Historie (Ausführungen)
-- ========================================

-- Letzte 10 Ausführungen des Jobs anzeigen:
SELECT 
  runid,
  jobid,
  start_time,
  end_time,
  status,
  return_message
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'auto-weather-backfill-job')
ORDER BY start_time DESC
LIMIT 10;

-- ========================================
-- Manueller Test
-- ========================================

-- Job manuell ausführen (für Tests):
SELECT net.http_post(
  url := 'https://lzcbjciqrhsezxkjeyhb.supabase.co/functions/v1/auto-weather-backfill',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-cron-secret', 'dev-test-secret'
  ),
  body := '{}'::jsonb
);

-- ========================================
-- WICHTIG für Production
-- ========================================
--
-- 1. Erstelle ein sicheres CRON_SECRET in Supabase Secrets:
--    https://supabase.com/dashboard/project/lzcbjciqrhsezxkjeyhb/settings/functions
--
-- 2. Ersetze 'dev-test-secret' in diesem SQL durch den neuen Wert
--
-- 3. Teste den Cron-Job manuell bevor du ihn aktivierst
--
-- 4. Überwache die Job-Historie regelmäßig auf Fehler
--
-- ========================================
