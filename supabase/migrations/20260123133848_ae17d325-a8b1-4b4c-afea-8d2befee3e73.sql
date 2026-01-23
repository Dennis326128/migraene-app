-- Create storage bucket for generated PDF reports
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('generated-reports', 'generated-reports', false, 52428800, ARRAY['application/pdf']);

-- RLS: Users can upload their own reports
CREATE POLICY "Users can upload own reports"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'generated-reports' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- RLS: Users can view their own reports
CREATE POLICY "Users can view own reports"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'generated-reports'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- RLS: Users can delete their own reports
CREATE POLICY "Users can delete own reports"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'generated-reports'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Add storage_path column to generated_reports (pdf_blob will be deprecated)
ALTER TABLE public.generated_reports 
ADD COLUMN IF NOT EXISTS storage_path text;

-- Make pdf_blob nullable for new storage-based reports
ALTER TABLE public.generated_reports 
ALTER COLUMN pdf_blob DROP NOT NULL;