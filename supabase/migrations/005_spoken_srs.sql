-- Mission 10: Speech input tracking columns on srs_queue
-- Safe to run multiple times (IF NOT EXISTS guards).

ALTER TABLE public.srs_queue
    ADD COLUMN IF NOT EXISTS spoken_attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS spoken_correct  INTEGER NOT NULL DEFAULT 0;
