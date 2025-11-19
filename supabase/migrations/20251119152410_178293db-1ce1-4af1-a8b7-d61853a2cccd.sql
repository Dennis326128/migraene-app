-- Füge Anrede und Titel zur doctors Tabelle hinzu
ALTER TABLE public.doctors
  ADD COLUMN salutation text,
  ADD COLUMN title text;

COMMENT ON COLUMN public.doctors.salutation IS 'Anrede: Herr, Frau, Divers';
COMMENT ON COLUMN public.doctors.title IS 'Akademischer Titel: Dr. med., Prof. Dr. med., etc.';