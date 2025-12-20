-- Drop existing policies to recreate them correctly
DROP POLICY IF EXISTS "Users can view own consent" ON public.user_consents;
DROP POLICY IF EXISTS "Users can insert own consent" ON public.user_consents;
DROP POLICY IF EXISTS "Users can update own consent" ON public.user_consents;
DROP POLICY IF EXISTS "Users can view their own consent" ON public.user_consents;
DROP POLICY IF EXISTS "Users can insert their own consent" ON public.user_consents;
DROP POLICY IF EXISTS "Users can update their own consent" ON public.user_consents;

-- Create correct RLS policies for user_consents
CREATE POLICY "Users can view their own consent"
ON public.user_consents
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own consent"
ON public.user_consents
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own consent"
ON public.user_consents
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);