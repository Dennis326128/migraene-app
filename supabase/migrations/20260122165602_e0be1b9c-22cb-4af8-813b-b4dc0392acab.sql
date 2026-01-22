-- ═══════════════════════════════════════════════════════════════════════════
-- doctor_share_settings: Share-spezifische Einstellungen
-- Speichert die Datenschutz- und Inhaltsoptionen pro Doctor-Share
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE public.doctor_share_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id uuid NOT NULL REFERENCES public.doctor_shares(id) ON DELETE CASCADE,
  
  -- Zeitraum
  range_preset text NOT NULL DEFAULT '3m',  -- '1m','3m','6m','12m','custom'
  custom_from date NULL,
  custom_to date NULL,
  
  -- Datenschutz-Toggles (Default AUS)
  include_entry_notes boolean NOT NULL DEFAULT false,
  include_context_notes boolean NOT NULL DEFAULT false,
  
  -- KI-Analyse
  include_ai_analysis boolean NOT NULL DEFAULT false,
  ai_analysis_generated_at timestamptz NULL,
  
  -- PDF-Link (wenn generiert)
  generated_report_id uuid NULL REFERENCES public.generated_reports(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Unique pro Share
  UNIQUE(share_id)
);

-- Indexe
CREATE INDEX idx_doctor_share_settings_share ON public.doctor_share_settings(share_id);

-- RLS: Nur User können eigene Share-Settings sehen/bearbeiten
ALTER TABLE public.doctor_share_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies via Join auf doctor_shares
CREATE POLICY "Users can view own share settings"
  ON public.doctor_share_settings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.doctor_shares ds
      WHERE ds.id = doctor_share_settings.share_id
      AND ds.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own share settings"
  ON public.doctor_share_settings
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.doctor_shares ds
      WHERE ds.id = doctor_share_settings.share_id
      AND ds.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own share settings"
  ON public.doctor_share_settings
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.doctor_shares ds
      WHERE ds.id = doctor_share_settings.share_id
      AND ds.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.doctor_shares ds
      WHERE ds.id = doctor_share_settings.share_id
      AND ds.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own share settings"
  ON public.doctor_share_settings
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.doctor_shares ds
      WHERE ds.id = doctor_share_settings.share_id
      AND ds.user_id = auth.uid()
    )
  );

-- Trigger für updated_at
CREATE TRIGGER update_doctor_share_settings_updated_at
  BEFORE UPDATE ON public.doctor_share_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();