-- Erweitere doctor_shares um 24h-Freigabe-Fenster Felder
-- share_active_until: Bis wann ist die Freigabe aktiv (NULL = nicht freigegeben)
-- share_revoked_at: Wann wurde die Freigabe bewusst beendet (für "heute nicht reaktivieren" Logik)

ALTER TABLE public.doctor_shares
ADD COLUMN share_active_until TIMESTAMPTZ NULL,
ADD COLUMN share_revoked_at TIMESTAMPTZ NULL;

-- Kommentar zur Dokumentation
COMMENT ON COLUMN public.doctor_shares.share_active_until IS 'Bis wann ist das 24h-Freigabe-Fenster aktiv. NULL = nicht freigegeben.';
COMMENT ON COLUMN public.doctor_shares.share_revoked_at IS 'Wann wurde die Freigabe bewusst beendet. Für "heute nicht automatisch reaktivieren" Logik.';