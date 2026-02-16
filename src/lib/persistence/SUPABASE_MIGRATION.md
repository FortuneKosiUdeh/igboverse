
# 2026-02-13 21:51:00 - Supabase Migration Plan

## Overview
This document outlines the steps to migrate user progress and authentication from `localStorage` to Supabase. The goal is to retain the existing `ProgressStore` interface while swapping the implementation.

## 1. Authentication
- **Current**: Local `userStore` saves a mock user object to `localStorage`.
- **Target**: Use Supabase Auth.
- **Migration**:
    - Update `IgboverseApp.tsx` to use `useSupabaseClient` and `useUser` hooks.
    - Replace `handleAuth` / `handleGuestLogin` with Supabase `signInWithPassword` or `signInAnonymously`.
    - Retrieve `user.id` from Supabase session instead of `Date.now()`.

## 2. Database Schema
Create the following tables in Supabase:

```sql
-- Profiles table linked to auth.users
create table public.profiles (
  id uuid references auth.users not null primary key,
  xp integer default 0,
  streak integer default 0,
  last_activity_date date,
  total_sessions integer default 0
);

-- Card Progress table (one row per user-card pair)
create table public.card_progress (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) not null,
  card_id text not null, -- 'igbo' word or unique ID
  interval integer default 0,
  repetitions integer default 0,
  ease_factor float default 2.5,
  next_review_date date default current_date,
  unique(user_id, card_id)
);
```

## 3. Progress Store Implementation
Create `src/lib/persistence/supabaseProgressStore.ts`:

```typescript
import { ProgressStore, UserProgress, CardProgress } from "./types";
import { createClient } from "@supabase/supabase-js";

// Initialize client (or pass in constructor)
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export class SupabaseProgressStore implements ProgressStore {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  async getProgress(): Promise<UserProgress> {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', this.userId)
      .single();
    
    const { data: cards } = await supabase
      .from('card_progress')
      .select('*')
      .eq('user_id', this.userId);

    const cardsMap: Record<string, CardProgress> = {};
    cards?.forEach(c => {
      cardsMap[c.card_id] = {
        interval: c.interval,
        repetitions: c.repetitions,
        easeFactor: c.ease_factor,
        nextReviewDate: c.next_review_date
      };
    });

    return {
      xp: profile?.xp || 0,
      streak: profile?.streak || 0,
      lastActivityDate: profile?.last_activity_date,
      totalSessions: profile?.total_sessions || 0,
      cards: cardsMap
    };
  }

  async saveProgress(progress: UserProgress): Promise<void> {
    // Upsert profile
    await supabase.from('profiles').upsert({
      id: this.userId,
      xp: progress.xp,
      streak: progress.streak,
      last_activity_date: progress.lastActivityDate,
      total_sessions: progress.totalSessions
    });
    // Note: Saving ALL cards might be inefficient. 
    // In Supabase implementation, updateCardState handles individual card upserts.
  }

  async updateCardState(cardId: string, result: "correct" | "incorrect"): Promise<void> {
     // ... Calculate next state using srsEngine ...
     // ... Upsert single row to card_progress ...
  }
  
  reset(): void {
      // Delete user data? Be careful.
  }
}
```

## 4. Integration
- In `IgboverseApp.tsx`, determine which store to use based on auth state.
- Check if user is logged in. If yes, instantiate `SupabaseProgressStore(user.id)`.
- If guest (or offline), instantiate `LocalProgressStore`.
- This strategy pattern allows seamless transition.

## 5. Sync (Optional)
- Upon login, you may want to sync local progress to the cloud.
- Read from `LocalProgressStore`, then iterate and upsert to Supabase.
