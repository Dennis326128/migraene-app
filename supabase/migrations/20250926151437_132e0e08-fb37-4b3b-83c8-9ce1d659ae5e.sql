-- Create user_medication_limits table
CREATE TABLE public.user_medication_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  medication_name TEXT NOT NULL,
  limit_count INTEGER NOT NULL CHECK (limit_count > 0),
  period_type TEXT NOT NULL CHECK (period_type IN ('day', 'week', 'month')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, medication_name, period_type)
);

-- Enable RLS
ALTER TABLE public.user_medication_limits ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own medication limits"
ON public.user_medication_limits
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own medication limits"
ON public.user_medication_limits
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own medication limits"
ON public.user_medication_limits
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own medication limits"
ON public.user_medication_limits
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_user_medication_limits_updated_at
BEFORE UPDATE ON public.user_medication_limits
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();