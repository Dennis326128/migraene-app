-- Indexes for hourly weather cache optimization
-- Enables fast lookup of recent weather logs within hourly windows and proximity radius

-- Composite index for hourly cache queries (user + time range + coordinates)
CREATE INDEX IF NOT EXISTS idx_weather_logs_user_hourly 
ON weather_logs (user_id, created_at DESC, latitude, longitude);

-- Spatial index for proximity-based cache lookups
CREATE INDEX IF NOT EXISTS idx_weather_logs_coords
ON weather_logs (latitude, longitude, created_at DESC);

-- Comment explaining the optimization
COMMENT ON INDEX idx_weather_logs_user_hourly IS 'Optimizes hourly weather cache lookups with 5km proximity radius';
COMMENT ON INDEX idx_weather_logs_coords IS 'Enables fast coordinate-based proximity searches for weather data reuse';