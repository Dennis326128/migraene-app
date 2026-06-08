CREATE POLICY "Users can update own generated reports"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'generated-reports'
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'generated-reports'
  AND auth.uid()::text = (storage.foldername(name))[1]
);