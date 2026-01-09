-- Migrate pain_location from single text to text array for multiple locations
-- Step 1: Add new column
ALTER TABLE public.pain_entries 
ADD COLUMN pain_locations text[] DEFAULT '{}';

-- Step 2: Migrate existing data (convert single value to array)
UPDATE public.pain_entries 
SET pain_locations = ARRAY[pain_location]::text[]
WHERE pain_location IS NOT NULL AND pain_location != '';

-- Step 3: Drop old column
ALTER TABLE public.pain_entries DROP COLUMN pain_location;

-- Step 4: Rename new column to old name (optional, for backwards compatibility)
-- We keep pain_locations (plural) for clarity