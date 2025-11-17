-- Create reminders table
CREATE TABLE IF NOT EXISTS public.reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('medication', 'appointment')),
  title TEXT NOT NULL,
  date_time TIMESTAMPTZ NOT NULL,
  repeat TEXT NOT NULL DEFAULT 'none' CHECK (repeat IN ('none', 'daily', 'weekly')),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'missed')),
  notification_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own reminders"
  ON public.reminders
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own reminders"
  ON public.reminders
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reminders"
  ON public.reminders
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reminders"
  ON public.reminders
  FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_reminders_updated_at
  BEFORE UPDATE ON public.reminders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for performance
CREATE INDEX idx_reminders_user_datetime ON public.reminders(user_id, date_time);
CREATE INDEX idx_reminders_status ON public.reminders(status);

COMMENT ON TABLE public.reminders IS 'Stores medication and appointment reminders for users';