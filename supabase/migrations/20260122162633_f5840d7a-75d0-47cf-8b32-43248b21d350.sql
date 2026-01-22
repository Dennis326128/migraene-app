-- ============================================================
-- A) Neue Tabelle: doctor_share_report_snapshots
-- Für gecachte Report-Snapshots (Single Source of Truth für Website)
-- ============================================================

-- Tabelle erstellen
CREATE TABLE public.doctor_share_report_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  share_id uuid NOT NULL REFERENCES public.doctor_shares(id) ON DELETE CASCADE,
  session_id uuid NULL REFERENCES public.doctor_share_sessions(id) ON DELETE SET NULL,
  range text NOT NULL CHECK (range IN ('30d', '3m', '6m', '12m')),
  report_version text NOT NULL DEFAULT 'v1',
  generated_at timestamptz NOT NULL DEFAULT now(),
  source_updated_at timestamptz NULL,
  report_json jsonb NOT NULL,
  pdf_report_id uuid NULL REFERENCES public.generated_reports(id) ON DELETE SET NULL,
  pdf_last_generated_at timestamptz NULL,
  is_stale boolean NOT NULL DEFAULT false
);

-- Kommentar für Dokumentation
COMMENT ON TABLE public.doctor_share_report_snapshots IS 
  'Gecachte Report-Snapshots für Doctor-Share. Nur über Edge Functions (service role) zugreifbar.';

-- ============================================================
-- INDEXE
-- ============================================================

-- Unique Constraint: Ein Snapshot pro share_id + range + version
CREATE UNIQUE INDEX idx_doctor_share_report_snapshots_unique 
  ON public.doctor_share_report_snapshots (share_id, range, report_version);

-- Index für schnellen Lookup nach share_id
CREATE INDEX idx_doctor_share_report_snapshots_share_id 
  ON public.doctor_share_report_snapshots (share_id);

-- Index für Cleanup nach generated_at
CREATE INDEX idx_doctor_share_report_snapshots_generated_at 
  ON public.doctor_share_report_snapshots (generated_at);

-- ============================================================
-- RLS: Komplett sperren für normale Clients
-- Nur service_role / Edge Functions haben Zugriff
-- ============================================================

ALTER TABLE public.doctor_share_report_snapshots ENABLE ROW LEVEL SECURITY;

-- KEINE Policies für anon/authenticated = komplett gesperrt
-- Edge Functions nutzen service_role und umgehen RLS automatisch