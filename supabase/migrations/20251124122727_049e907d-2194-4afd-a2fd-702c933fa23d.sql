-- Add DELETE policy for patient_data to comply with privacy regulations
-- Users must be able to delete their own sensitive health information

CREATE POLICY "Users can delete own patient data" 
ON patient_data 
FOR DELETE 
USING (auth.uid() = user_id);

-- Add comment for documentation
COMMENT ON POLICY "Users can delete own patient data" ON patient_data IS 
'GDPR compliance: Users have the right to delete their personal health information including insurance numbers and contact details.';