-- Add dewpoint column to weather_logs table
ALTER TABLE public.weather_logs 
ADD COLUMN dewpoint_c numeric;