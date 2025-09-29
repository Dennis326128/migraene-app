-- Create cron job for automatic daily weather snapshots
-- This will call the invoke_auto_weather function 3 times daily at 6:00, 12:00, and 18:00 UTC

-- Schedule for 6:00 UTC (morning snapshot)
SELECT cron.schedule(
  'daily-weather-snapshots-morning',
  '0 6 * * *',
  $$
  SELECT public.invoke_auto_weather();
  $$
);

-- Schedule for 12:00 UTC (noon snapshot)  
SELECT cron.schedule(
  'daily-weather-snapshots-noon',
  '0 12 * * *',
  $$
  SELECT public.invoke_auto_weather();
  $$
);

-- Schedule for 18:00 UTC (evening snapshot)
SELECT cron.schedule(
  'daily-weather-snapshots-evening',
  '0 18 * * *',
  $$
  SELECT public.invoke_auto_weather();
  $$
);

-- Update the invoke_auto_weather function to use auto-weather-backfill instead of deprecated auto-weather
CREATE OR REPLACE FUNCTION public.invoke_auto_weather_backfill()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  base_url   text := 'https://lzcbjciqrhsezxkjeyhb.supabase.co/functions/v1/auto-weather-backfill';
  service_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6Y2JqY2lxcmhzZXp4a2pleWhiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDIzNTE1MiwiZXhwIjoyMDY5ODExMTUyfQ.LrWb2xFtLN9QWXYFMxb3S3alN-OWjLGiJhI-0XaF-ws';  
begin
  perform net.http_post(
    url := base_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey',        service_key,
      'Authorization', 'Bearer ' || service_key,
      'x-cron-secret', 'dev-test-secret'
    ),
    body := '{}'::jsonb
  );
end;
$function$;

-- Update existing cron jobs to use the new function
SELECT cron.unschedule('daily-weather-snapshots-morning');
SELECT cron.unschedule('daily-weather-snapshots-noon');
SELECT cron.unschedule('daily-weather-snapshots-evening');

-- Re-create with correct function
SELECT cron.schedule(
  'daily-weather-backfill-morning',
  '0 6 * * *',
  $$
  SELECT public.invoke_auto_weather_backfill();
  $$
);

SELECT cron.schedule(
  'daily-weather-backfill-noon',
  '0 12 * * *',
  $$
  SELECT public.invoke_auto_weather_backfill();
  $$
);

SELECT cron.schedule(
  'daily-weather-backfill-evening',
  '0 18 * * *',
  $$
  SELECT public.invoke_auto_weather_backfill();
  $$
);