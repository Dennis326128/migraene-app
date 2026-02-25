CREATE INDEX IF NOT EXISTS idx_weather_user_requested_at ON weather_logs (user_id, requested_at);
CREATE INDEX IF NOT EXISTS idx_weather_location_rounded ON weather_logs (lat_rounded, lon_rounded);