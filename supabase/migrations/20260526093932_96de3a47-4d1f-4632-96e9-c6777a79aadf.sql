ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS ai_include_private_notes boolean NOT NULL DEFAULT false;