-- Create debug table for voice entry tracking
CREATE TABLE voice_entries_debug (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  source_text text NOT NULL,
  parsed_json jsonb,
  missing_fields text[],
  confidence_scores jsonb,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE voice_entries_debug ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own debug entries" 
  ON voice_entries_debug FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own debug entries" 
  ON voice_entries_debug FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Index for performance
CREATE INDEX idx_voice_debug_user_created ON voice_entries_debug(user_id, created_at DESC);