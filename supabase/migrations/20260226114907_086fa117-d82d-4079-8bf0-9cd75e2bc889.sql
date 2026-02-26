-- Nullify falsely inserted pressure_change_24h = 0 values from historical backfills.
-- Real 0 deltas are extremely rare and were never computed by our backfill logic,
-- so all 0 values are artifacts of the old INSERT default.
UPDATE weather_logs
SET pressure_change_24h = NULL
WHERE pressure_change_24h = 0;