-- Erstelle Tabelle für Report-Einstellungen
CREATE TABLE IF NOT EXISTS public.user_report_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Zeitraum-Präferenz
  default_report_preset text NOT NULL DEFAULT '3m' CHECK (default_report_preset IN ('3m', '6m', '12m', 'custom')),
  
  -- Medikamentenauswahl
  selected_medications text[] DEFAULT '{}',
  include_all_medications boolean DEFAULT false,
  
  -- Inhaltsauswahl
  include_patient_data boolean DEFAULT true,
  include_doctor_data boolean DEFAULT true,
  include_statistics boolean DEFAULT true,
  include_chart boolean DEFAULT true,
  include_ai_analysis boolean DEFAULT true,
  include_entries_list boolean DEFAULT true,
  include_medication_summary boolean DEFAULT true,
  
  -- Metadaten
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.user_report_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own report settings"
  ON public.user_report_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own report settings"
  ON public.user_report_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own report settings"
  ON public.user_report_settings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trigger für updated_at
CREATE TRIGGER update_user_report_settings_updated_at
  BEFORE UPDATE ON public.user_report_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Erweitere patient_data Tabelle
ALTER TABLE public.patient_data
  ADD COLUMN IF NOT EXISTS salutation text,
  ADD COLUMN IF NOT EXISTS title text;