-- Add data_state_signature to ai_reports for data-state-aware reuse
ALTER TABLE public.ai_reports
ADD COLUMN IF NOT EXISTS data_state_signature text;

-- Index for efficient lookup by dedupe_key + signature
CREATE INDEX IF NOT EXISTS idx_ai_reports_dedupe_signature 
ON public.ai_reports (user_id, dedupe_key, data_state_signature)
WHERE report_type = 'pattern_analysis';

-- Add source_updated_at to ai_reports for staleness tracking
ALTER TABLE public.ai_reports
ADD COLUMN IF NOT EXISTS source_updated_at timestamp with time zone;