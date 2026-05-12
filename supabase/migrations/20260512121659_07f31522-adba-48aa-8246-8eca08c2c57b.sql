ALTER TABLE public.doctor_share_settings
  ADD COLUMN IF NOT EXISTS allow_ai_generate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS share_day_factors boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.doctor_share_settings.allow_ai_generate IS 'When true, the doctor (via website) may trigger a NEW pattern analysis. When false, only the stored ai_reports analysis is shown.';
COMMENT ON COLUMN public.doctor_share_settings.share_day_factors IS 'When true, the structured Tagesfaktoren (mood/stress/sleep/energy/tags) are included in the shared report. Free-text notes are NEVER shared.';