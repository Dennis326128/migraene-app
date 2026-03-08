
-- One-time data fix: mark stale snapshot for rebuild
UPDATE doctor_share_report_snapshots 
SET is_stale = true 
WHERE share_id = 'a8850033-aa0b-45a1-af49-93d57482216b' AND range = '3m';
