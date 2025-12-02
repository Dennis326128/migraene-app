-- Erweitere user_medications um BMP-relevante Felder
ALTER TABLE public.user_medications
ADD COLUMN IF NOT EXISTS wirkstoff text,
ADD COLUMN IF NOT EXISTS staerke text,
ADD COLUMN IF NOT EXISTS darreichungsform text,
ADD COLUMN IF NOT EXISTS einheit text DEFAULT 'Stueck',
ADD COLUMN IF NOT EXISTS dosis_morgens text,
ADD COLUMN IF NOT EXISTS dosis_mittags text,
ADD COLUMN IF NOT EXISTS dosis_abends text,
ADD COLUMN IF NOT EXISTS dosis_nacht text,
ADD COLUMN IF NOT EXISTS dosis_bedarf text,
ADD COLUMN IF NOT EXISTS anwendungsgebiet text,
ADD COLUMN IF NOT EXISTS hinweise text,
ADD COLUMN IF NOT EXISTS art text DEFAULT 'bedarf',
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS discontinued_at timestamp with time zone;

-- Index für häufige Abfragen
CREATE INDEX IF NOT EXISTS idx_user_medications_active ON public.user_medications(user_id, is_active);