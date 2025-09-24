-- Add migraine-specific fields to pain_entries table
ALTER TABLE public.pain_entries 
ADD COLUMN aura_type TEXT DEFAULT 'keine',
ADD COLUMN pain_location TEXT;

-- Add check constraints for the new enum fields
ALTER TABLE public.pain_entries 
ADD CONSTRAINT pain_entries_aura_type_check 
CHECK (aura_type IN ('keine', 'visuell', 'sensorisch', 'sprachlich', 'gemischt'));

ALTER TABLE public.pain_entries 
ADD CONSTRAINT pain_entries_pain_location_check 
CHECK (pain_location IN ('einseitig_links', 'einseitig_rechts', 'beidseitig', 'stirn', 'nacken', 'schlaefe') OR pain_location IS NULL);

-- Update existing entries to have default aura_type
UPDATE public.pain_entries SET aura_type = 'keine' WHERE aura_type IS NULL;

-- Make aura_type NOT NULL after setting defaults
ALTER TABLE public.pain_entries ALTER COLUMN aura_type SET NOT NULL;