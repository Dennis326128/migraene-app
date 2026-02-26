
-- Add is_active column to doctor_shares
ALTER TABLE public.doctor_shares
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false;

-- Create unique partial index: max 1 active (non-revoked) code per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_doctor_shares_user_unique_active
  ON public.doctor_shares (user_id)
  WHERE revoked_at IS NULL;

-- Backfill: set is_active = true for shares that have an active share_active_until window
UPDATE public.doctor_shares
SET is_active = true
WHERE revoked_at IS NULL
  AND share_active_until IS NOT NULL
  AND share_active_until > now()
  AND share_revoked_at IS NULL;
