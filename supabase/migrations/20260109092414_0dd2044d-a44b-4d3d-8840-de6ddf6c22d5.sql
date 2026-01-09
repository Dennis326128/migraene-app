-- Tabelle für Resend-Confirmation Logs (Rate-Limiting + Audit)
CREATE TABLE public.resend_confirmation_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ip_hash TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT true,
  reason TEXT,
  user_agent TEXT
);

-- Index für schnelle Rate-Limit Abfragen
CREATE INDEX idx_resend_logs_ip_time ON public.resend_confirmation_logs (ip_hash, created_at DESC);
CREATE INDEX idx_resend_logs_email_time ON public.resend_confirmation_logs (email_hash, created_at DESC);

-- RLS aktivieren (nur Service Role darf schreiben)
ALTER TABLE public.resend_confirmation_logs ENABLE ROW LEVEL SECURITY;

-- Keine öffentlichen Policies = nur Service Role kann lesen/schreiben
-- Das ist beabsichtigt für Security-Logs

-- Auto-Cleanup nach 30 Tagen (optional, manuell oder via Cron)
COMMENT ON TABLE public.resend_confirmation_logs IS 'Rate-limiting logs for resend confirmation emails. Auto-cleanup after 30 days recommended.';