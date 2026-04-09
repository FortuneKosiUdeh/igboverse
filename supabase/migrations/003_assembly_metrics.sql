-- Mission 3: Assembly speed tracking column
-- Run in Supabase SQL Editor (Project → SQL Editor → New query)

ALTER TABLE user_progress
    ADD COLUMN IF NOT EXISTS avg_assembly_ms INTEGER;

COMMENT ON COLUMN user_progress.avg_assembly_ms IS
    'Average Assembly phase response time (ms) from the most recent lesson session. Lower = faster chunk retrieval = more automaticity.';
