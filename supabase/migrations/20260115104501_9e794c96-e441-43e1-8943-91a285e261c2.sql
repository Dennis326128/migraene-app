-- Add optional website field to doctors table
ALTER TABLE public.doctors 
ADD COLUMN website text NULL;