-- Mission 4: SRS Review Mode — reviews counter column
-- Run in Supabase SQL Editor (Project → SQL Editor → New query)

ALTER TABLE user_progress
    ADD COLUMN IF NOT EXISTS reviews_completed INTEGER DEFAULT 0;

COMMENT ON COLUMN user_progress.reviews_completed IS
    'Number of dedicated SRS review sessions completed, distinct from new-word lessons.';
