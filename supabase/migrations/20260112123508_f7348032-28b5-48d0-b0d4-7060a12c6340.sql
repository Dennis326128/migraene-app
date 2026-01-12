-- ============================================================
-- AI REPORTS TABLE FOR PERSISTENT STORAGE OF LLM ANALYSIS RESULTS
-- ============================================================

-- Create ai_reports table for storing all KI-Analyseberichte
CREATE TABLE public.ai_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  report_type TEXT NOT NULL, -- 'diary_pdf' | 'pattern_analysis' | 'custom'
  title TEXT NOT NULL,
  from_date DATE NULL,
  to_date DATE NULL,
  source TEXT NOT NULL, -- 'pdf_flow' | 'analysis_view' | 'assistant'
  input_summary JSONB NULL, -- optional metadata about what was analyzed
  response_json JSONB NOT NULL, -- the actual AI response
  model TEXT NULL, -- e.g., 'google/gemini-2.5-flash'
  dedupe_key TEXT NULL, -- for deduplication
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_ai_reports_user_id ON public.ai_reports(user_id);
CREATE INDEX idx_ai_reports_created_at ON public.ai_reports(created_at DESC);
CREATE INDEX idx_ai_reports_dedupe_key ON public.ai_reports(dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE UNIQUE INDEX idx_ai_reports_unique_dedupe ON public.ai_reports(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

-- Enable RLS
ALTER TABLE public.ai_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can read their own reports
CREATE POLICY "Users can view their own AI reports"
ON public.ai_reports
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own reports (for direct client inserts if needed)
CREATE POLICY "Users can create their own AI reports"
ON public.ai_reports
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own reports
CREATE POLICY "Users can update their own AI reports"
ON public.ai_reports
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own reports
CREATE POLICY "Users can delete their own AI reports"
ON public.ai_reports
FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_ai_reports_updated_at
BEFORE UPDATE ON public.ai_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add comment
COMMENT ON TABLE public.ai_reports IS 'Stores persistent AI analysis reports (Premium feature) that users can view anytime';