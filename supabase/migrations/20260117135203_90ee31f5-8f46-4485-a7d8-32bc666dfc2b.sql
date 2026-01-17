-- Aktiviere unbegrenzten KI-Zugang für beide User
UPDATE public.user_profiles 
SET ai_unlimited = true, updated_at = now()
WHERE user_id IN (
  '4a70d2fd-5ab7-4023-a331-8cb23f570d98',
  'ab53d5f5-e122-4ff9-a934-ce7b2348dccc'
);