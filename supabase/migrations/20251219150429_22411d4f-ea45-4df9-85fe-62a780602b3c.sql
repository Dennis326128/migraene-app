-- Add account management fields to user_profiles
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active' 
  CHECK (account_status IN ('active', 'deactivated', 'deletion_requested')),
ADD COLUMN IF NOT EXISTS deactivated_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS deletion_requested_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS deletion_scheduled_for timestamp with time zone;

-- Create index for scheduled deletions (cron job efficiency)
CREATE INDEX IF NOT EXISTS idx_user_profiles_deletion_scheduled 
ON public.user_profiles (deletion_scheduled_for) 
WHERE account_status = 'deletion_requested';

-- Function to deactivate account (reversible)
CREATE OR REPLACE FUNCTION public.deactivate_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  UPDATE user_profiles
  SET 
    account_status = 'deactivated',
    deactivated_at = now(),
    updated_at = now()
  WHERE user_id = v_user_id;

  -- Log the action
  INSERT INTO audit_logs (user_id, action, table_name, old_data)
  VALUES (v_user_id, 'ACCOUNT_DEACTIVATED', 'user_profiles', 
    jsonb_build_object('timestamp', now()));
END;
$$;

-- Function to reactivate account
CREATE OR REPLACE FUNCTION public.reactivate_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  UPDATE user_profiles
  SET 
    account_status = 'active',
    deactivated_at = NULL,
    deletion_requested_at = NULL,
    deletion_scheduled_for = NULL,
    updated_at = now()
  WHERE user_id = v_user_id
    AND account_status IN ('deactivated', 'deletion_requested');

  -- Log the action
  INSERT INTO audit_logs (user_id, action, table_name, old_data)
  VALUES (v_user_id, 'ACCOUNT_REACTIVATED', 'user_profiles', 
    jsonb_build_object('timestamp', now()));
END;
$$;

-- Function to request account deletion (30-day soft delete)
CREATE OR REPLACE FUNCTION public.request_account_deletion()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_scheduled_for timestamp with time zone;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  v_scheduled_for := now() + interval '30 days';

  UPDATE user_profiles
  SET 
    account_status = 'deletion_requested',
    deletion_requested_at = now(),
    deletion_scheduled_for = v_scheduled_for,
    updated_at = now()
  WHERE user_id = v_user_id;

  -- Log the action
  INSERT INTO audit_logs (user_id, action, table_name, old_data)
  VALUES (v_user_id, 'DELETION_REQUESTED', 'user_profiles', 
    jsonb_build_object(
      'requested_at', now(),
      'scheduled_for', v_scheduled_for
    ));

  RETURN jsonb_build_object(
    'success', true,
    'deletion_scheduled_for', v_scheduled_for
  );
END;
$$;

-- Function to cancel deletion request
CREATE OR REPLACE FUNCTION public.cancel_account_deletion()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Only allow cancellation if deletion is still pending
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE user_id = v_user_id 
      AND account_status = 'deletion_requested'
      AND deletion_scheduled_for > now()
  ) THEN
    RAISE EXCEPTION 'No pending deletion to cancel';
  END IF;

  UPDATE user_profiles
  SET 
    account_status = 'active',
    deletion_requested_at = NULL,
    deletion_scheduled_for = NULL,
    updated_at = now()
  WHERE user_id = v_user_id;

  -- Log the action
  INSERT INTO audit_logs (user_id, action, table_name, old_data)
  VALUES (v_user_id, 'DELETION_CANCELLED', 'user_profiles', 
    jsonb_build_object('timestamp', now()));
END;
$$;

-- Function to get account status (for AuthGuard)
CREATE OR REPLACE FUNCTION public.get_account_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('status', 'not_authenticated');
  END IF;

  SELECT jsonb_build_object(
    'status', COALESCE(account_status, 'active'),
    'deactivated_at', deactivated_at,
    'deletion_requested_at', deletion_requested_at,
    'deletion_scheduled_for', deletion_scheduled_for
  ) INTO v_result
  FROM user_profiles
  WHERE user_id = v_user_id;

  IF v_result IS NULL THEN
    RETURN jsonb_build_object('status', 'active');
  END IF;

  RETURN v_result;
END;
$$;