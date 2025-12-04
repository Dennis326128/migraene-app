-- Add raw_input field to user_medications for storing original user input
ALTER TABLE public.user_medications 
ADD COLUMN IF NOT EXISTS raw_input text DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.user_medications.raw_input IS 'Original text as entered/spoken by the user, for debugging and analysis';