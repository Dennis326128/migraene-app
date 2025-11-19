-- Füge Fax-Nummer zu doctors und patient_data hinzu
ALTER TABLE public.doctors
  ADD COLUMN fax text;

ALTER TABLE public.patient_data
  ADD COLUMN fax text;