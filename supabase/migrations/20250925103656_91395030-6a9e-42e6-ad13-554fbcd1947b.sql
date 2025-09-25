-- Create user_consents table for GDPR compliance
CREATE TABLE public.user_consents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  consent_type TEXT NOT NULL,
  consent_given BOOLEAN NOT NULL DEFAULT false,
  consent_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on user_consents
ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for user_consents
CREATE POLICY "Users can view their own consents" 
ON public.user_consents 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own consents" 
ON public.user_consents 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own consents" 
ON public.user_consents 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates on user_consents
CREATE TRIGGER update_user_consents_updated_at
BEFORE UPDATE ON public.user_consents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create audit_logs table for tracking deletions
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  table_name TEXT,
  record_id TEXT,
  old_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on audit_logs (admin only access)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Create delete_user_account function
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_table_record RECORD;
BEGIN
  -- Verify user is authenticated
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Log the deletion request
  INSERT INTO audit_logs (user_id, action, table_name)
  VALUES (v_user_id, 'DELETE_ACCOUNT_REQUEST', 'all_user_data');

  -- Delete user data in dependency order
  -- Delete med_effects (through event_meds)
  DELETE FROM med_effects 
  WHERE event_med_id IN (
    SELECT em.id 
    FROM event_meds em 
    JOIN events e ON e.id = em.event_id 
    WHERE e.user_id = v_user_id
  );

  -- Delete event_meds
  DELETE FROM event_meds 
  WHERE event_id IN (
    SELECT id FROM events WHERE user_id = v_user_id
  );

  -- Delete entry_symptoms
  DELETE FROM entry_symptoms 
  WHERE entry_id IN (
    SELECT id FROM pain_entries WHERE user_id = v_user_id
  );

  -- Delete reminder_queue
  DELETE FROM reminder_queue WHERE user_id = v_user_id;
  
  -- Delete events
  DELETE FROM events WHERE user_id = v_user_id;
  
  -- Delete pain_entries
  DELETE FROM pain_entries WHERE user_id = v_user_id;
  
  -- Delete weather_logs
  DELETE FROM weather_logs WHERE user_id = v_user_id;
  
  -- Delete user_medications
  DELETE FROM user_medications WHERE user_id = v_user_id;
  
  -- Delete user_settings
  DELETE FROM user_settings WHERE user_id = v_user_id;
  
  -- Delete user_consents
  DELETE FROM user_consents WHERE user_id = v_user_id;
  
  -- Delete user_profiles
  DELETE FROM user_profiles WHERE user_id = v_user_id;

  -- Final audit log
  INSERT INTO audit_logs (user_id, action, table_name)
  VALUES (v_user_id, 'DELETE_ACCOUNT_COMPLETED', 'all_user_data');
  
END;
$$;