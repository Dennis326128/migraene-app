-- =============================================
-- Migration: AI Quota System with Unlimited Bypass
-- =============================================

-- 1) Add ai_unlimited field to user_profiles (ADMIN-ONLY, default false)
-- This field can ONLY be set by admins via direct DB access
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS ai_unlimited boolean NOT NULL DEFAULT false;

-- Ensure all existing rows have ai_unlimited = false
UPDATE public.user_profiles SET ai_unlimited = false WHERE ai_unlimited IS NULL;

-- 2) Add pattern_analysis tracking fields to user_ai_usage if needed
-- This table already exists, we'll use it for pattern_analysis quota tracking

-- 3) Create AI Analysis Cache table
CREATE TABLE IF NOT EXISTS public.ai_analysis_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cache_key text NOT NULL,
  feature text NOT NULL DEFAULT 'pattern_analysis',
  from_date date NOT NULL,
  to_date date NOT NULL,
  latest_source_updated_at timestamptz NOT NULL,
  response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, cache_key)
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_ai_analysis_cache_user_id ON public.ai_analysis_cache(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_cache_lookup ON public.ai_analysis_cache(user_id, cache_key);

-- 4) Add last_used_at to user_ai_usage for cooldown tracking
ALTER TABLE public.user_ai_usage
ADD COLUMN IF NOT EXISTS last_used_at timestamptz;

-- 5) Enable RLS on ai_analysis_cache
ALTER TABLE public.ai_analysis_cache ENABLE ROW LEVEL SECURITY;

-- 6) RLS Policies for ai_analysis_cache

-- Users can read their own cached analyses
CREATE POLICY "Users can view own cache"
ON public.ai_analysis_cache
FOR SELECT
USING (auth.uid() = user_id);

-- Users CANNOT insert/update/delete directly - only service role can
-- This means the Edge Function must use service_role key for writes
-- No INSERT/UPDATE/DELETE policies for authenticated users

-- 7) SECURITY: Protect ai_unlimited from client updates
-- We need to ensure the RLS policy on user_profiles prevents updating ai_unlimited

-- Drop existing update policy if it exists (to recreate with restrictions)
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;

-- Create a new restricted update policy that explicitly excludes ai_unlimited
-- Users can update their own profile BUT cannot change ai_unlimited
CREATE POLICY "Users can update own profile restricted"
ON public.user_profiles
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id 
  -- The column ai_unlimited cannot be changed by users - enforced by trigger below
);

-- 8) Create a trigger to prevent users from modifying ai_unlimited
CREATE OR REPLACE FUNCTION public.protect_ai_unlimited()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If ai_unlimited is being changed and it's not a service role call,
  -- revert to the old value
  IF OLD.ai_unlimited IS DISTINCT FROM NEW.ai_unlimited THEN
    -- Check if caller has service_role (indicated by current_setting)
    -- Normal users cannot change this field
    IF current_setting('request.jwt.claims', true)::jsonb->>'role' != 'service_role' THEN
      NEW.ai_unlimited := OLD.ai_unlimited;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS protect_ai_unlimited_trigger ON public.user_profiles;

CREATE TRIGGER protect_ai_unlimited_trigger
BEFORE UPDATE ON public.user_profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_ai_unlimited();

-- 9) Create helper function to get user's pattern analysis usage
CREATE OR REPLACE FUNCTION public.get_pattern_analysis_usage(p_user_id uuid)
RETURNS TABLE(
  request_count integer,
  last_used_at timestamptz,
  period_start date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    COALESCE(request_count, 0)::integer,
    last_used_at,
    period_start::date
  FROM user_ai_usage
  WHERE user_id = p_user_id 
    AND feature = 'pattern_analysis'
    AND period_start >= date_trunc('month', now())::date
  ORDER BY period_start DESC
  LIMIT 1;
$$;

-- 10) Grant execute on function to authenticated users
GRANT EXECUTE ON FUNCTION public.get_pattern_analysis_usage(uuid) TO authenticated;