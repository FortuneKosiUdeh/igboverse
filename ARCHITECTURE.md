
# 2026-02-13 21:50:00 - Architecture Summary

## Overview

Igboverse is a web application designed to help users learn the Igbo language through verb drills and flashcards. The application follows a Clean Architecture approach, separating the presentation layer (React components) from the business logic (Engine classes) and data persistence.

## Key Modules

### 1. Presentation Layer (UI)
- Location: `src/components/ui/IgboverseApp.tsx`
- Responsibilities: 
  - Rendering UI based on state.
  - Handling user interactions (clicks, inputs).
  - Delegating logic to Engines.
  - No direct business logic or data storage.

### 2. Logic Engines
- **VerbDrillEngine**: 
  - Location: `src/lib/drills/VerbDrillEngine.ts`
  - Responsibilities: Generates questions, validates answers, manages drill session state.
- **FlashcardEngine**: 
  - Location: `src/lib/flashcards.ts`
  - Responsibilities: Manages SRS-based flashcard sessions, tracks card progress, handles "next card" logic.
- **SRSEngine**:
  - Location: `src/lib/srs/srsEngine.ts`
  - Responsibilities: Implements the SM-2 Spaced Repetition System algorithm. Does not maintain state itself, but calculates next state for cards.

### 3. Data Persistence
- **LocalProgressStore**:
  - Location: `src/lib/persistence/localProgressStore.ts`
  - Responsibilities: Persists user progress (XP, Streak, Card SRS Data) to `localStorage`.
- **UserStore**:
  - Location: `src/lib/persistence/userStore.ts`
  - Responsibilities: Manages user authentication state (stub) in `localStorage`.
- **Lexicon/API**:
  - Location: `src/lib/igbo-api.ts`
  - Responsibilities: Fetches word data from external Igbo API.

## Data Flow

1. **Initialization**: App loads -> `useEffect` fetches data from API -> `LocalProgressStore` loads user progress.
2. **Flashcards**: `FlashcardEngine` initialized with filtered cards (via `SRSEngine` filter) -> User interacts -> `FlashcardEngine` updates state -> calls `LocalProgressStore` to save card SRS data.
3. **Drills**: `VerbDrillEngine` initialized with verbs -> User answers -> `addXP` updates progress via `progressStore`.

## Supabase Upgrade Path

To migrate to Supabase:

1. Create `SupabaseProgressStore` implementing `ProgressStore` interface.
2. Replace `localStorage` calls with Supabase DB queries.
3. Update `IgboverseApp` to initialize `progressStore` based on environment/auth state.
4. Replace `userStore` with Supabase Auth.

Example `src/lib/persistence/SUPABASE_MIGRATION.md` provided for detailed path.
