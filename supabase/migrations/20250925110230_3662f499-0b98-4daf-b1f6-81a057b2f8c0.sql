-- Erweitere Symptom-Katalog auf 15-20 relevante Migräne-Symptome
INSERT INTO symptom_catalog (name, is_active) VALUES
  ('Erbrechen', true),
  ('Appetitlosigkeit', true),
  ('Konzentrationsstörung', true),
  ('Müdigkeit', true),
  ('Geruchsempfindlichkeit', true),
  ('Spannungskopfschmerz', true),
  ('Kribbeln/Taubheit', true),
  ('Wortfindungsstörung', true),
  ('Sehfeld-Ausfall', true),
  ('Doppelbilder', true),
  ('Gleichgewichtsstörung', true),
  ('Hitzewallungen', true),
  ('Kältegefühl', true)
ON CONFLICT (name) DO NOTHING;