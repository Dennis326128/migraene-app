-- Fix critical security issue: Remove overly permissive weather_logs policy
-- that allows any authenticated user to read all users' location data

-- Drop the dangerous policy that allows all authenticated users to read all weather logs
DROP POLICY IF EXISTS "Authenticated users can read weather logs" ON public.weather_logs;

-- Verify that proper user-specific policies remain in place:
-- ✅ "Users can select their own weather logs" (auth.uid() = user_id)
-- ✅ "Users can view their own weather logs" (auth.uid() = user_id)  
-- ✅ "weather_logs_rw" (user_id = auth.uid())

-- These existing policies ensure users can only access their own weather data