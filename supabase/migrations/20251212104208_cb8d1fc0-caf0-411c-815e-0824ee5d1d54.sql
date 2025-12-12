-- Phase 2: LLM Draft Engine - Feature Flags + Quota Tracking

-- 1. Add ai_draft_engine column to user_profiles
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS ai_draft_engine text DEFAULT 'heuristic' 
  CHECK (ai_draft_engine IN ('heuristic', 'llm'));

-- 2. Create user_ai_usage table for quota tracking
CREATE TABLE IF NOT EXISTS public.user_ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  feature text NOT NULL,
  request_count integer DEFAULT 0,
  period_start timestamp with time zone DEFAULT date_trunc('month', now()),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, feature, period_start)
);

-- 3. Enable RLS on user_ai_usage
ALTER TABLE public.user_ai_usage ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for user_ai_usage
CREATE POLICY "Users can view their own AI usage"
  ON public.user_ai_usage
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own AI usage"
  ON public.user_ai_usage
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own AI usage"
  ON public.user_ai_usage
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. Add updated_at trigger for user_ai_usage
CREATE TRIGGER update_user_ai_usage_updated_at
  BEFORE UPDATE ON public.user_ai_usage
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();