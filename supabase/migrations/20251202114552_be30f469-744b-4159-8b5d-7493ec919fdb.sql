-- Add effect_score to medication_effects table
-- effect_score is integer 0-10, nullable (NULL = unrated)
ALTER TABLE medication_effects 
ADD COLUMN IF NOT EXISTS effect_score integer CHECK (effect_score >= 0 AND effect_score <= 10);

COMMENT ON COLUMN medication_effects.effect_score IS 'Numeric effect score 0-10 (0=keine Wirkung, 10=perfekt). NULL = unrated/pending.';

-- Create index for querying unrated entries
CREATE INDEX IF NOT EXISTS idx_medication_effects_effect_score 
ON medication_effects(entry_id, effect_score) 
WHERE effect_score IS NULL;