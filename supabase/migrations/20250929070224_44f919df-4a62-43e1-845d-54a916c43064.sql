-- Create medication_effects table for tracking medication effectiveness
CREATE TABLE public.medication_effects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id bigint NOT NULL,
  med_name TEXT NOT NULL,
  effect_rating TEXT NOT NULL CHECK (effect_rating IN ('none', 'poor', 'moderate', 'good', 'very_good')),
  side_effects TEXT[] DEFAULT '{}',
  notes TEXT,
  method TEXT DEFAULT 'ui' CHECK (method IN ('ui', 'voice')),
  confidence TEXT DEFAULT 'high' CHECK (confidence IN ('high', 'medium', 'low')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.medication_effects ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own medication effects"
ON public.medication_effects
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM pain_entries 
  WHERE pain_entries.id = medication_effects.entry_id 
  AND pain_entries.user_id = auth.uid()
));

CREATE POLICY "Users can create medication effects for their entries"
ON public.medication_effects
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM pain_entries 
  WHERE pain_entries.id = medication_effects.entry_id 
  AND pain_entries.user_id = auth.uid()
));

CREATE POLICY "Users can update their own medication effects"
ON public.medication_effects
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM pain_entries 
  WHERE pain_entries.id = medication_effects.entry_id 
  AND pain_entries.user_id = auth.uid()
));

CREATE POLICY "Users can delete their own medication effects"
ON public.medication_effects
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM pain_entries 
  WHERE pain_entries.id = medication_effects.entry_id 
  AND pain_entries.user_id = auth.uid()
));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_medication_effects_updated_at
BEFORE UPDATE ON public.medication_effects
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for better performance
CREATE INDEX idx_medication_effects_entry_id ON public.medication_effects(entry_id);
CREATE INDEX idx_medication_effects_created_at ON public.medication_effects(created_at DESC);