-- Feedback table for beta testers
-- Results: SELECT * FROM user_feedback ORDER BY created_at DESC;
-- Or in Supabase Dashboard: Table Editor -> user_feedback

CREATE TABLE public.user_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- User input (all optional)
  message text NULL,
  category text NULL,  -- 'bug' | 'ux' | 'feature' | 'other'
  severity text NULL,  -- 'low' | 'medium' | 'high'
  contact_email text NULL,
  
  -- Tech info (collected if user opts in)
  include_tech_info boolean NOT NULL DEFAULT true,
  route text NULL,
  app_version text NULL,
  build text NULL,
  user_agent text NULL,
  platform text NULL,
  locale text NULL,
  timezone text NULL,
  screen jsonb NULL,
  extra jsonb NULL
);

-- Indices for efficient querying
CREATE INDEX idx_user_feedback_created_at ON public.user_feedback (created_at DESC);
CREATE INDEX idx_user_feedback_user_created ON public.user_feedback (user_id, created_at DESC);
CREATE INDEX idx_user_feedback_category ON public.user_feedback (category) WHERE category IS NOT NULL;

-- Enable RLS
ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;

-- Users can insert their own feedback
CREATE POLICY "Users can insert own feedback"
  ON public.user_feedback
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can view only their own feedback (not public!)
CREATE POLICY "Users can view own feedback"
  ON public.user_feedback
  FOR SELECT
  USING (auth.uid() = user_id);

-- No UPDATE/DELETE allowed (immutable feedback)