-- ═══════════════════════════════════════════════════════════════════════════
-- Doctor Share Feature: Tabellen für "Mit Arzt teilen"
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Haupttabelle: Freigabe-Codes
CREATE TABLE public.doctor_shares (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Code (normalisiert: uppercase, ohne Bindestrich)
  code TEXT NOT NULL,
  code_display TEXT NOT NULL,
  
  -- Zeitraum & Gültigkeit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  
  -- Zugriffs-Tracking
  last_accessed_at TIMESTAMPTZ,
  
  -- Report-Default (konsistent zu user_report_settings)
  default_range TEXT NOT NULL DEFAULT '3m' CHECK (default_range IN ('30d', '3m', '6m', '12m')),
  
  CONSTRAINT doctor_shares_code_unique UNIQUE (code)
);

-- 2. Session-Tabelle: Arzt-Sitzungen
CREATE TABLE public.doctor_share_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  share_id UUID NOT NULL REFERENCES public.doctor_shares(id) ON DELETE CASCADE,
  
  -- Session-Tracking
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  
  -- Minimal-Audit (optional)
  user_agent_hash TEXT
);

-- 3. Indizes
CREATE INDEX idx_doctor_shares_user_id ON public.doctor_shares(user_id);
CREATE INDEX idx_doctor_shares_code ON public.doctor_shares(code);
CREATE INDEX idx_doctor_shares_expires_at ON public.doctor_shares(expires_at);
CREATE INDEX idx_doctor_share_sessions_share_id ON public.doctor_share_sessions(share_id);

-- 4. RLS für doctor_shares (Patient kann eigene Shares verwalten)
ALTER TABLE public.doctor_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own shares" 
  ON public.doctor_shares 
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own shares" 
  ON public.doctor_shares 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own shares" 
  ON public.doctor_shares 
  FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own shares" 
  ON public.doctor_shares 
  FOR DELETE 
  USING (auth.uid() = user_id);

-- 5. RLS für doctor_share_sessions (nur service_role, keine User-Policies)
ALTER TABLE public.doctor_share_sessions ENABLE ROW LEVEL SECURITY;
-- Keine Policies = nur service_role kann zugreifen (Edge Functions)

-- 6. Kommentare
COMMENT ON TABLE public.doctor_shares IS 'Freigabe-Codes für Ärzte zum Einsehen von Patientendaten';
COMMENT ON TABLE public.doctor_share_sessions IS 'Arzt-Sessions für zeitlich begrenzte Dateneinsicht';
COMMENT ON COLUMN public.doctor_shares.code IS 'Normalisierter Code (uppercase, ohne Bindestrich)';
COMMENT ON COLUMN public.doctor_shares.code_display IS 'Anzeige-Format mit Bindestrich (z.B. K7QF-3921)';
COMMENT ON COLUMN public.doctor_share_sessions.ended_at IS 'Nur bei Logout oder Timeout gesetzt, nicht bei jedem Ping';