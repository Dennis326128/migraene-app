-- Restrict symptom_catalog access to authenticated users only
DROP POLICY IF EXISTS "sc_select_all" ON symptom_catalog;

CREATE POLICY "sc_select_authenticated" ON symptom_catalog
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Add comment for documentation
COMMENT ON POLICY "sc_select_authenticated" ON symptom_catalog IS 
'Only authenticated users can view the symptom catalog. Changed from public access to improve security posture.';