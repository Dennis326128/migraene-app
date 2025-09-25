-- Create entry_medications table for tracking medication effectiveness
CREATE TABLE public.entry_medications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id BIGINT NOT NULL,
  medication_name TEXT NOT NULL,
  dosage TEXT,
  effectiveness_rating INTEGER CHECK (effectiveness_rating >= 0 AND effectiveness_rating <= 4),
  taken_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.entry_medications ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own entry medications" 
ON public.entry_medications 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM pain_entries pe 
  WHERE pe.id = entry_medications.entry_id 
  AND pe.user_id = auth.uid()
));

CREATE POLICY "Users can create their own entry medications" 
ON public.entry_medications 
FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM pain_entries pe 
  WHERE pe.id = entry_medications.entry_id 
  AND pe.user_id = auth.uid()
));

CREATE POLICY "Users can update their own entry medications" 
ON public.entry_medications 
FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM pain_entries pe 
  WHERE pe.id = entry_medications.entry_id 
  AND pe.user_id = auth.uid()
));

CREATE POLICY "Users can delete their own entry medications" 
ON public.entry_medications 
FOR DELETE 
USING (EXISTS (
  SELECT 1 FROM pain_entries pe 
  WHERE pe.id = entry_medications.entry_id 
  AND pe.user_id = auth.uid()
));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_entry_medications_updated_at
BEFORE UPDATE ON public.entry_medications
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();