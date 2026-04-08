
-- 1. Expand protect_ai_unlimited trigger to also protect account management columns
CREATE OR REPLACE FUNCTION public.protect_ai_unlimited()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only service_role can modify privileged columns
  IF current_setting('request.jwt.claims', true)::jsonb->>'role' != 'service_role' THEN
    -- Protect ai_unlimited
    IF OLD.ai_unlimited IS DISTINCT FROM NEW.ai_unlimited THEN
      NEW.ai_unlimited := OLD.ai_unlimited;
    END IF;
    -- Protect account_status
    IF OLD.account_status IS DISTINCT FROM NEW.account_status THEN
      NEW.account_status := OLD.account_status;
    END IF;
    -- Protect deactivated_at
    IF OLD.deactivated_at IS DISTINCT FROM NEW.deactivated_at THEN
      NEW.deactivated_at := OLD.deactivated_at;
    END IF;
    -- Protect deletion_requested_at
    IF OLD.deletion_requested_at IS DISTINCT FROM NEW.deletion_requested_at THEN
      NEW.deletion_requested_at := OLD.deletion_requested_at;
    END IF;
    -- Protect deletion_scheduled_for
    IF OLD.deletion_scheduled_for IS DISTINCT FROM NEW.deletion_scheduled_for THEN
      NEW.deletion_scheduled_for := OLD.deletion_scheduled_for;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Ensure trigger exists (recreate to be safe)
DROP TRIGGER IF EXISTS protect_ai_unlimited ON public.user_profiles;
CREATE TRIGGER protect_ai_unlimited
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_ai_unlimited();

-- 2. Remove client-side write access to user_ai_usage (all writes go through edge functions with service role)
DROP POLICY IF EXISTS "Users can insert their own AI usage" ON public.user_ai_usage;
DROP POLICY IF EXISTS "Users can update their own AI usage" ON public.user_ai_usage;
