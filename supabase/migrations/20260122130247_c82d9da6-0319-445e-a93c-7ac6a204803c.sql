-- Partial Unique Index: Max 1 aktiver Code pro User
-- Verhindert Race Condition bei parallelen Code-Erstellungen
CREATE UNIQUE INDEX IF NOT EXISTS doctor_shares_user_active_unique 
ON doctor_shares (user_id) 
WHERE revoked_at IS NULL;