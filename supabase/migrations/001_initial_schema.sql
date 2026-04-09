-- =============================================================
-- Igboverse — Initial Schema Migration
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- CLEAN SLATE
-- Drop any existing tables from previous schema attempts.
-- CASCADE removes dependent objects (indexes, triggers, policies).
-- ─────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.srs_queue   CASCADE;
DROP TABLE IF EXISTS public.user_progress CASCADE;
DROP TABLE IF EXISTS public.words        CASCADE;


-- ─────────────────────────────────────────────────────────────
-- HELPER FUNCTION: auto-update updated_at timestamps
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ─────────────────────────────────────────────────────────────
-- TABLE: words
-- Local vocabulary cache seeded from IgboAPI.
-- App queries this first; IgboAPI is only a fallback for misses.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE public.words (
    id              TEXT PRIMARY KEY,                      -- IgboAPI word ID
    word            TEXT NOT NULL UNIQUE,                  -- The Igbo word
    word_class      TEXT NOT NULL,                         -- NNC, AV, ADJ, INTJ, etc.
    definitions     TEXT[]       NOT NULL DEFAULT '{}',    -- English definitions
    audio_url       TEXT,                                  -- Pronunciation URL (nullable)
    theme_ids       TEXT[]       NOT NULL DEFAULT '{}',    -- Curriculum themes this word belongs to
    examples        JSONB        NOT NULL DEFAULT '[]',    -- [{igbo, english, pronunciation?}]
    dialects        JSONB        NOT NULL DEFAULT '[]',    -- [{word, pronunciation, communities}]
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- GIN index: fast array containment queries
-- e.g. WHERE theme_ids @> ARRAY['food-drink']
CREATE INDEX idx_words_theme_ids  ON public.words USING GIN(theme_ids);
CREATE INDEX idx_words_word_class ON public.words(word_class);

CREATE TRIGGER words_updated_at
    BEFORE UPDATE ON public.words
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- words is public read-only (seed script writes via service role key which bypasses RLS)
ALTER TABLE public.words ENABLE ROW LEVEL SECURITY;

CREATE POLICY "words_read_all"
    ON public.words FOR SELECT
    TO authenticated, anon
    USING (true);


-- ─────────────────────────────────────────────────────────────
-- TABLE: user_progress
-- One row per user. Replaces igboverse_v2_profile in localStorage.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE public.user_progress (
    user_id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    total_xp            INT          NOT NULL DEFAULT 0,
    level               INT          NOT NULL DEFAULT 1,
    words_learned       INT          NOT NULL DEFAULT 0,
    lessons_completed   INT          NOT NULL DEFAULT 0,
    current_streak      INT          NOT NULL DEFAULT 0,
    longest_streak      INT          NOT NULL DEFAULT 0,
    last_session_date   DATE,
    seen_word_ids       TEXT[]       NOT NULL DEFAULT '{}',
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TRIGGER user_progress_updated_at
    BEFORE UPDATE ON public.user_progress
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_progress_own_row"
    ON public.user_progress FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────
-- TABLE: srs_queue
-- One row per (user, word) pair. Replaces igboverse_srs in localStorage.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE public.srs_queue (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    word_id         TEXT         NOT NULL,              -- matches words.id
    last_seen       BIGINT       NOT NULL,              -- Unix timestamp ms
    next_review     BIGINT       NOT NULL,              -- Unix timestamp ms
    ease_factor     FLOAT        NOT NULL DEFAULT 2.5,  -- SM-2 ease factor (1.3–2.5)
    interval_days   INT          NOT NULL DEFAULT 1,    -- SM-2 interval in days
    repetitions     INT          NOT NULL DEFAULT 0,
    lapses          INT          NOT NULL DEFAULT 0,
    UNIQUE(user_id, word_id)
);

-- Index for: "get all due words for this user ordered by next_review"
CREATE INDEX idx_srs_user_next_review ON public.srs_queue(user_id, next_review);

ALTER TABLE public.srs_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "srs_queue_own_rows"
    ON public.srs_queue FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────
-- DONE
-- After running this, go to:
-- Authentication → Providers → Anonymous → toggle ON
-- ─────────────────────────────────────────────────────────────
