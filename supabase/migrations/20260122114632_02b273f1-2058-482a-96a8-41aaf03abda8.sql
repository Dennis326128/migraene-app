-- Erlaube NULL für expires_at (permanente Codes haben kein Ablaufdatum)
ALTER TABLE public.doctor_shares 
ALTER COLUMN expires_at DROP NOT NULL;

-- Kommentar zur Klarstellung
COMMENT ON COLUMN public.doctor_shares.expires_at IS 'NULL = permanenter Code ohne Ablauf';