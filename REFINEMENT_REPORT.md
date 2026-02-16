
# Refinement Report: Igboverse Expansion

## 1. Audio Strategy
- **Removed**: All audio UI components (`Volume2`, `playAudio` button) and logic from `IgboverseApp.tsx`.
- **Infrastructure**: The `Verb` schema in `VerbDrillEngine` and `igbo-api.ts` now explicitly includes `audioUrl: string | null`.
- **Status**: Audio is disabled in the frontend but data-ready for future assets.

## 2. Dataset Expansion
- **Source**: Integrated ~200 common verbs derived from linguistic resources.
- **Generator**: Implemented a `generateVerb` function in `igbo-api.ts` that applies standard Igbo vowel harmony rules:
    - Detects root vowel group (Light/Heavy).
    - Applies correct prefixes (`na-a`/`na-e`, `ga-a`/`ga-e`).
    - generative Past tense suffix (`r` + vowel).
    - Handles pronoun patterns (Active "Ana m", "Anyị na-...", etc).
- **Quality**: Avoids "hallucinated" random strings; uses real root words with algorithmic conjugation based on grammar rules.

## 3. Search & Answer Normalization
- **Logic**: Updated `ConjugationEngine.ts` `submitAnswer` method.
- **Tolerance**:
    - **Case-insensitive**: `A` == `a`.
    - **Whitespace**: Trims and collapses multiple spaces.
    - **Diacritics**: Strips accents/dots using NFD normalization (e.g., `biara` matches `bịara`).
- **Goal**: Reduces frustration while maintaining spelling requirements for the base letters.

## 4. Structure Training
- **New Engine**: Created `StructureDrillEngine.ts` handling:
    - `sentence-builder`: Reordering shuffled segments (SVO).
    - `translation`: Multiple choice.
    - `pronoun-match`: Context matching.
- **Integration**: Added "Structure Basics" card to Home.
- **Progression**: Conjugation Drills are now **Gated**. Users must score > 3 in Structure Training to unlock the Conjugation mode. State is persisted via `localStorage`.

## 5. Folder Structure
- `src/lib/igbo-api.ts`: Expanded Verb Data & Generator.
- `src/lib/drills/`:
    - `VerbDrillEngine.ts`: Type definitions.
    - `ConjugationEngine.ts`: Conjugation drill logic (Normalizer added).
    - `StructureDrillEngine.ts`: **NEW** Structure drill logic.
- `src/components/ui/IgboverseApp.tsx`: UI Logic (Audio removed, Structure View added, Gating logic).

## 6. Limitations & Assumptions
- **Mock Data**: We are simulating the "API" with a local generator for reliability.
- **Conjugation Rules**: The generator assumes standard "Active" verb patterns. Stative verbs or irregulars might have generated conjugations that technically follow rules but aren't idiomatic (e.g. `bụ` -> `na-abụ` vs `bụ`).
- **Structure Content**: The structure drill questions are currently hardcoded in the engine prototype. They should eventually move to a data file or API.
