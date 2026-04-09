-- Mission 2: Add diagnostic columns to user_progress
-- Run this in Supabase SQL editor or via `supabase db push`

ALTER TABLE user_progress
    ADD COLUMN IF NOT EXISTS stuck_point           TEXT,
    ADD COLUMN IF NOT EXISTS translation_dependent TEXT,
    ADD COLUMN IF NOT EXISTS tonal_awareness       TEXT,
    ADD COLUMN IF NOT EXISTS dialect               TEXT,
    ADD COLUMN IF NOT EXISTS idiomatic_depth       TEXT,
    ADD COLUMN IF NOT EXISTS session_style         TEXT;

COMMENT ON COLUMN user_progress.stuck_point IS
    'Diagnostic Q1 — where the learner gets stuck when speaking';
COMMENT ON COLUMN user_progress.translation_dependent IS
    'Diagnostic Q2 — whether the learner translates from English first';
COMMENT ON COLUMN user_progress.tonal_awareness IS
    'Diagnostic Q3 — ability to distinguish tonal minimal pairs';
COMMENT ON COLUMN user_progress.dialect IS
    'Diagnostic Q4 — home/family Igbo dialect';
COMMENT ON COLUMN user_progress.idiomatic_depth IS
    'Diagnostic Q5 — exposure to proverbs and idioms';
COMMENT ON COLUMN user_progress.session_style IS
    'Diagnostic Q6 — preferred session cadence (short vs focused)';
