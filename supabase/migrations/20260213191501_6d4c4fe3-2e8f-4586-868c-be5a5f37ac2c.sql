
-- Add ME/CFS severity fields to pain_entries
ALTER TABLE public.pain_entries
  ADD COLUMN IF NOT EXISTS me_cfs_severity_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS me_cfs_severity_level text NOT NULL DEFAULT 'none';

-- Add check constraint for valid score values (MVP: 0,3,7,10; future: 0-10)
ALTER TABLE public.pain_entries
  ADD CONSTRAINT chk_me_cfs_severity_score CHECK (me_cfs_severity_score >= 0 AND me_cfs_severity_score <= 10);

-- Add check constraint for valid level values
ALTER TABLE public.pain_entries
  ADD CONSTRAINT chk_me_cfs_severity_level CHECK (me_cfs_severity_level IN ('none', 'mild', 'moderate', 'severe'));

-- Create index for future analytics queries
CREATE INDEX IF NOT EXISTS idx_pain_entries_me_cfs_score 
  ON public.pain_entries (user_id, selected_date, me_cfs_severity_score)
  WHERE me_cfs_severity_score > 0;
