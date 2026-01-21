-- Create generated_reports table for storing PDF report history
CREATE TABLE public.generated_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL CHECK (report_type IN ('diary', 'medication_plan', 'hit6')),
  title TEXT NOT NULL,
  from_date DATE NULL,
  to_date DATE NULL,
  pdf_blob BYTEA NOT NULL,
  file_size_bytes INTEGER NULL,
  metadata JSONB NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.generated_reports ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own reports" 
ON public.generated_reports 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own reports" 
ON public.generated_reports 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reports" 
ON public.generated_reports 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_generated_reports_user_id_created ON public.generated_reports(user_id, created_at DESC);
CREATE INDEX idx_generated_reports_user_type ON public.generated_reports(user_id, report_type);

-- Add comment
COMMENT ON TABLE public.generated_reports IS 'Stores generated PDF reports for user download history';