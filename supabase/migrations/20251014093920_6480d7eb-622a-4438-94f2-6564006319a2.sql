-- Step 1: Remove duplicate entries, keeping only the most recent one per (user_id, selected_date, selected_time)
DELETE FROM pain_entries
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY user_id, selected_date, selected_time 
             ORDER BY timestamp_created DESC, id DESC
           ) AS rn
    FROM pain_entries
  ) t
  WHERE rn > 1
);

-- Step 2: Add unique constraint for efficient UPSERT on natural key (date + time)
ALTER TABLE pain_entries 
ADD CONSTRAINT pain_entries_user_date_time_unique 
UNIQUE (user_id, selected_date, selected_time);

-- Step 3: Add performance index for common queries
CREATE INDEX IF NOT EXISTS idx_pain_entries_user_date 
ON pain_entries(user_id, selected_date DESC, selected_time DESC);

-- Step 4: Consolidate RLS policies (remove duplicates, create single efficient policy)
DROP POLICY IF EXISTS "Allow delete own entries" ON pain_entries;
DROP POLICY IF EXISTS "Delete own pain entries" ON pain_entries;
DROP POLICY IF EXISTS "Insert own pain entries" ON pain_entries;
DROP POLICY IF EXISTS "Select own pain entries" ON pain_entries;
DROP POLICY IF EXISTS "Update own pain entries" ON pain_entries;
DROP POLICY IF EXISTS "Users can delete their own pain entries" ON pain_entries;
DROP POLICY IF EXISTS "Users can insert their own pain entries" ON pain_entries;
DROP POLICY IF EXISTS "Users can select their own pain entries" ON pain_entries;
DROP POLICY IF EXISTS "Users can update their own pain entries" ON pain_entries;
DROP POLICY IF EXISTS "Users can view their own pain entries" ON pain_entries;
DROP POLICY IF EXISTS "pain_entries_delete" ON pain_entries;
DROP POLICY IF EXISTS "pain_entries_insert" ON pain_entries;
DROP POLICY IF EXISTS "pain_entries_select" ON pain_entries;
DROP POLICY IF EXISTS "pain_entries_update" ON pain_entries;

-- Step 5: Create single, efficient RLS policy for all operations
CREATE POLICY pain_entries_rw ON pain_entries
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());