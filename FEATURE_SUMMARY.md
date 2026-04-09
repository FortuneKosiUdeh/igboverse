# Igboverse — Feature Summary
> Current as of April 2026

---

## Overview

Igboverse is a heritage Igbo language revitalization app built as a Progressive Web App (PWA). It is designed specifically for **Igbo heritage learners** — people who grew up hearing Igbo but never fully acquired active production — not beginners starting from zero. The cognitive model it runs on: fluency is chunk-driven. The goal is automated multi-word retrieval, not grammar translation.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript + React 19 |
| Styling | Vanilla CSS-in-JS (inline styles) |
| Font | Inter (Google Fonts) |
| Database | Supabase (PostgreSQL, PostgREST, Auth) |
| HTTP client | Zero-dependency fetch-based REST client (no `@supabase/supabase-js` at build time) |
| PWA | Service Worker + Web App Manifest |
| Deployment target | Vercel |

---

## Core Learning Engine

### 5-Phase Micro-Lesson Structure

Every lesson is ~3 minutes and follows a fixed cognitive sequence. Each phase targets a specific neurological requirement for chunk acquisition:

| Phase | Step Type | What Happens | Cognitive Target |
|---|---|---|---|
| 1 | **Exposure** | Word appears with Igbo, English, and audio URL. Auto-advances after 3s. | Stress-free initial encoding |
| 2 | **Recognition** | 4-option multiple choice: "Which one means X?" | Lexical decision speed |
| 3 | **Cloze** | Fill-in-the-blank from a real IgboAPI sentence | Morphological intuition, verb suffix awareness |
| 4 | **Assembly** | Sentence scramble — tap blocks in correct order | Active chunk synthesis + production speed |
| 5 | **Pattern** | Two near-identical sentences, spot the tense/tone difference | Implicit grammar induction (no rules stated) |

A typical lesson contains **8–12 steps** across 3–4 target words, targeting a 2–3 minute session length.

### Lesson Generator (`lessonGenerator.ts`)

- Dynamically builds lesson steps from live word data
- Smart distractor generation: wrong answers come from the same theme pool (not random), making them plausible and cognitively challenging
- Sentence chunking for Assembly: splits real IgboAPI example sentences into 3–5 semantic blocks
- Auto-selects step types based on word data availability (skips Assembly if no example sentence exists)

### Word Fetcher (`wordFetcher.ts`) — DB-First with Fallback

```
1. Query Supabase words table (GIN-indexed, instant)
   ↓ If ≥3 results: return immediately (fast path)
2. Fall back to live IgboAPI call
   ↓ Auto-insert results into Supabase for future sessions
```

In-memory cache prevents redundant network calls within the same session.

---

## Vocabulary Database

- **Source:** IgboAPI (`igboapi.com`) — 100,000+ sentences, multi-dialectal
- **Seeded:** 650 words pre-loaded at launch across all 10 curriculum themes
- **Schema fields per word:** `id`, `word`, `word_class`, `definitions[]`, `audio_url`, `theme_ids[]`, `examples[]` (igbo, english, pronunciation), `dialects[]` (word, pronunciation, communities)
- **Indexes:** GIN index on `theme_ids` for fast array-contains queries; B-tree on `word_class`

---

## Curriculum — 10 Thematic Clusters

Ordered by the "Lego Block" principle: concrete nouns first, high-frequency actions second, abstract last. Each theme unlocks at a specific level.

| # | Theme | Description | Unlocks at |
|---|---|---|---|
| 1 | 👋 Greetings | Hello, thank you, essential social words | Level 1 |
| 2 | 🍲 Food & Drink | What you eat and drink every day | Level 1 |
| 3 | 👨‍👩‍👧 Family & People | Mother, father, child, your people | Level 1 |
| 4 | 🏃 Core Actions | Go, come, see, buy — verbs used every hour | Level 3 |
| 5 | 🫀 Body & Health | Head, hand, eye — know your body | Level 4 |
| 6 | 🏠 Home & Places | House, market, school, road | Level 5 |
| 7 | 🌿 Nature & Animals | Dog, bird, tree, rain, sun | Level 6 |
| 8 | 🕐 Time & Numbers | Today, tomorrow, one through ten | Level 7 |
| 9 | 💭 Feelings | Happy, sad, angry, afraid | Level 8 |
| 10 | 👔 Clothing & Appearance | Cloth, shoe, hat, dress, colors | Level 9 |

---

## Spaced Repetition System (SRS)

Full SM-2 algorithm implementation adapted for Igbo vocabulary.

### How it works

- Every word answered in a lesson is added to the SRS queue
- Correct answers → interval expands: 1d → 3d → 7d → 16d → ...
- Incorrect answers → interval resets to 1d, lapse counter increments
- **Response-time-aware quality scoring:**
  - < 2s correct → quality 5 (easy)
  - 2–5s correct → quality 4 (good)
  - > 5s correct → quality 3 (hard)
  - Incorrect → quality 1 (fail)
- Ease factor self-adjusts per word (1.3–2.5 range)

### Queue intelligence

- `getDueWords()` — words past their review date, sorted by urgency
- `getUpcomingWords()` — words due within 6 hours (lesson padding)
- `getHardWords()` — lowest ease factor + most lapses (targeted drilling)
- Due count displayed on home screen as a review reminder badge

---

## User Progress & Gamification

### Profile fields tracked

| Field | Description |
|---|---|
| `totalXP` | Cumulative XP earned |
| `level` | `floor(totalXP / 100) + 1` |
| `wordsLearned` | Count of unique words in SRS queue |
| `lessonsCompleted` | Total lessons finished |
| `currentStreak` | Consecutive days with at least one lesson |
| `longestStreak` | All-time best streak |
| `lastSessionDate` | ISO date of last session (for streak calculation) |
| `seenWordIds` | Set of all word IDs ever encountered |

### XP system

- **+10 XP** per correct answer
- **+5 XP × maxStreak bonus** at lesson completion
- Streak bonus fires a ⚡ "zap" animation at every 3rd consecutive correct answer

### Home screen stats bar

Live display of 🔥 current streak / ⚡ total XP / 📚 level.

---

## Data Persistence — Dual-Write Architecture

```
Write path (every lesson):
  localStorage ← instant (always)
  Supabase     ← async fire-and-forget (when auth available)

Read path (app launch):
  1. localStorage → render immediately (no loading spinner)
  2. Supabase → merge in background
     - Higher XP wins per field
     - Union of seenWordIds (never lose a word)
     - Most-recently-seen entry wins per SRS word
```

This means **the app works fully offline** and syncs opportunistically when connected.

---

## Authentication — Anonymous Sessions

- On app mount, `signInAnonymously()` is called via Supabase Auth v1 REST API
- A UUID is assigned and persisted in both Supabase and `localStorage` (`igboverse_user_id`)
- Session token auto-refreshes before expiry
- **No account required** — user gets full sync without signing up
- **"Save to email" flow** — after completing 1+ lessons, a panel appears on the home screen allowing the user to link their anonymous session to an email address. Supabase sends a magic link. Same UUID, same data, now recoverable.

---

## PWA Features

- **Installable** on iOS (Safari) and Android (Chrome) — add to home screen
- **Service Worker** registered via `sw.js` — enables offline caching
- **Web App Manifest** — standalone display mode, portrait lock, theme color `#059669`
- **Apple-specific metadata:** `apple-mobile-web-app-capable`, `apple-touch-icon`, status bar style
- **Viewport locked** — no user scaling (native app feel)
- Icons: 192×192 and 512×512 PNG, maskable

---

## UI & UX

- **Single-page architecture** — no route changes, screen transitions driven by state: `loading → home → drill → summary`
- **Accessible from first paint** — localStorage data renders before Supabase responds
- **Zap animation** — lightning effect at every 3-streak milestone in the drill screen
- **Progress bar** — step counter during active lesson
- **Immediate feedback** — correct/incorrect shown before advancing to next step
- **Lesson summary screen** — shows XP earned, accuracy, max streak after each lesson
- **Theme grid** — locked themes visually dimmed with level requirement shown
- **Review badge** — amber banner showing due word count on home screen

---

## Database Schema (Supabase / PostgreSQL)

### `words`
```
id            TEXT PRIMARY KEY
word          TEXT UNIQUE NOT NULL
word_class    TEXT
definitions   TEXT[]
audio_url     TEXT
theme_ids     TEXT[]          -- GIN indexed
examples      JSONB           -- [{igbo, english, pronunciation}]
dialects      JSONB           -- [{word, pronunciation, communities}]
created_at    TIMESTAMPTZ
```

### `user_progress`
```
user_id            UUID PRIMARY KEY  -- anonymous Supabase user ID
total_xp           INTEGER
level              INTEGER
words_learned      INTEGER
lessons_completed  INTEGER
current_streak     INTEGER
longest_streak     INTEGER
last_session_date  DATE
seen_word_ids      TEXT[]
updated_at         TIMESTAMPTZ
```

### `srs_queue`
```
user_id       UUID
word_id       TEXT
last_seen     BIGINT          -- Unix ms
next_review   BIGINT          -- Unix ms
ease_factor   REAL
interval_days INTEGER
repetitions   INTEGER
lapses        INTEGER
UNIQUE(user_id, word_id)      -- upsert target
INDEX on (user_id, next_review)
```

Row Level Security (RLS) enabled on `user_progress` and `srs_queue` — users can only read/write their own rows.

---

## Infrastructure Notes

- **Zero `@supabase/supabase-js` at runtime** — replaced with a hand-rolled fetch-based REST client to eliminate the `@supabase/realtime-js` WebSocket hang that blocked Next.js dev server startup and Turbopack compilation
- **`wordFetcher.ts` excluded from the lesson barrel export** (`lesson/index.ts`) to prevent it from being pulled into the server module graph
- **`next.config.ts`** marks all `@supabase/*` packages as `serverExternalPackages` as a belt-and-suspenders guard
- **Seed script** (`scripts/seed-vocabulary.cjs`) fetches from IgboAPI and writes to Supabase via direct REST calls — no JS client dependency. Run with `npm run seed`.

---

## File Map

```
src/
├── app/
│   ├── layout.tsx          PWA metadata, SW registration, Inter font
│   └── page.tsx            Root entry → IgboverseV2
├── components/ui/
│   └── IgboverseV2.tsx     Main app component (~1,082 lines)
│                           Screens: home, drill, summary, loading
│                           Auth init, SRS sync, progress dual-write
├── lib/
│   ├── auth.ts             Anonymous session init + email claim
│   ├── progressSync.ts     Supabase read/write for profile + SRS queue
│   ├── supabase.ts         Zero-dep REST client (Auth v1 + PostgREST)
│   └── lesson/
│       ├── types.ts        All TypeScript interfaces
│       ├── curriculum.ts   10-theme curriculum definition
│       ├── lessonGenerator.ts  Step builder (exposure/recognition/cloze/assembly/pattern)
│       ├── srs.ts          SM-2 algorithm + queue management
│       └── wordFetcher.ts  DB-first fetch with IgboAPI fallback
├── data/
│   ├── flashcards.ts       (legacy — not in active use)
│   └── verbs.ts            (legacy — not in active use)
public/
├── manifest.json           PWA manifest
├── sw.js                   Service Worker
├── icon-192.png
├── icon-512.png
└── apple-touch-icon.png
scripts/
└── seed-vocabulary.cjs     One-time DB seeder (npm run seed)
supabase/
└── migrations/
    └── 001_initial_schema.sql
```

---

## What's Not Built Yet

- Dialect-aware lesson branching (Onitsha vs Owerri vs Standard Izugbe)
- Audio playback UI (audio URLs are stored, but no player rendered yet)
- Onboarding/diagnostic questionnaire
- Dedicated SRS review mode (separate from new-word lessons)
- Push notifications for daily review reminders
- Leaderboards or social features
- Vercel deployment (build is clean and ready)
