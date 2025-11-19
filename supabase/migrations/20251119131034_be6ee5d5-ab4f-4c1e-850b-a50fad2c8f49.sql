-- Patientendaten-Tabelle
CREATE TABLE public.patient_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  street text,
  postal_code text,
  city text,
  phone text,
  date_of_birth date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- Ärzte-Tabelle (mehrere Ärzte pro Patient möglich)
CREATE TABLE public.doctors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  specialty text,
  street text,
  postal_code text,
  city text,
  phone text,
  email text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS Policies für patient_data
ALTER TABLE public.patient_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own patient data"
  ON public.patient_data FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own patient data"
  ON public.patient_data FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own patient data"
  ON public.patient_data FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies für doctors
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own doctors"
  ON public.doctors FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own doctors"
  ON public.doctors FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own doctors"
  ON public.doctors FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own doctors"
  ON public.doctors FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger für updated_at
CREATE TRIGGER update_patient_data_updated_at
  BEFORE UPDATE ON public.patient_data
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_doctors_updated_at
  BEFORE UPDATE ON public.doctors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();