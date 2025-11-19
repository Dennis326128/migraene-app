-- Füge Krankenversicherungs-Felder zur patient_data Tabelle hinzu
ALTER TABLE public.patient_data
  ADD COLUMN health_insurance text,
  ADD COLUMN insurance_number text;