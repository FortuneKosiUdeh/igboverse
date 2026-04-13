"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    LessonUnit,
    LessonStep,
    SessionState,
    CurriculumTheme,
    WordEntry,
    SRSMetadata,
} from '@/lib/lesson/types';
import { CURRICULUM, getUnlockedThemes } from '@/lib/lesson/curriculum';
import { generateLesson } from '@/lib/lesson/lessonGenerator';
import { generateReviewLesson } from '@/lib/lesson/reviewGenerator';

import OnboardingDiagnostic, { ONBOARDING_KEY, loadDiagnostic, DIAGNOSTIC_KEY } from './OnboardingDiagnostic';
import { fetchThemeWords, selectLessonWords, fetchWordsByIds } from '@/lib/lesson/wordFetcher';
import { getDialectLabel } from '@/lib/dialect';
import { buildFluencyEvents, appendFluencyEvents, getWeeklyDashboard, WeeklyDashboard } from '@/lib/fluencyMetrics';

import {
    loadSRSQueue,
    saveSRSQueue,
    getDueWords,
    addToQueue,
    recordReview,
    getHardWords,
} from '@/lib/lesson/srs';

import { initializeUser, getCachedUserId, claimAccountWithEmail } from '@/lib/auth';
import {
    loadProgressFromDB,
    saveProgressToDB,
    loadSrsFromDB,
    saveSrsToDB,
    mergeProfiles,
    mergeSrsQueues,
    saveAssemblyMetricsToDB,
} from '@/lib/progressSync';
import { getImmersionRecommendation } from '@/data/immersionSources';

// ─── Profile type ─────────────────────────────────────────────

interface UserProfile {
    totalXP: number;
    level: number;
    wordsLearned: number;
    lessonsCompleted: number;
    reviewsCompleted: number;
    currentStreak: number;
    longestStreak: number;
    lastSessionDate: string;
    seenWordIds: string[];
}

// ─── Constants ────────────────────────────────────────────────

const XP_CORRECT = 10;
const XP_STREAK_BONUS = 5;
const STREAK_ZAP_THRESHOLD = 3;

// ─── Helper: persisted state ─────────────────────────────────

function loadProfile() {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem('igboverse_v2_profile');
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function saveProfile(profile: UserProfile) {
    if (typeof window === 'undefined') return;
    localStorage.setItem('igboverse_v2_profile', JSON.stringify(profile));
}

// ─── Main App Component ──────────────────────────────────────

type Screen = 'loading' | 'home' | 'drill' | 'summary';

export default function IgboverseV2() {
    // Profile
    const [profile, setProfile] = useState({
        totalXP: 0,
        level: 1,
        wordsLearned: 0,
        lessonsCompleted: 0,
        reviewsCompleted: 0,
        currentStreak: 0,
        longestStreak: 0,
        lastSessionDate: '',
        seenWordIds: [] as string[],
    });
    const [srsQueue, setSrsQueue] = useState<SRSMetadata[]>([]);

    // Onboarding gate — check localStorage synchronously so there's no flash
    const [showOnboarding, setShowOnboarding] = useState(() => {
        if (typeof window === 'undefined') return false;
        return localStorage.getItem(ONBOARDING_KEY) !== 'true';
    });

    // UI state
    const [screen, setScreen] = useState<Screen>('loading');
    const [lesson, setLesson] = useState<LessonUnit | null>(null);
    const [session, setSession] = useState<SessionState | null>(null);
    // Session mode — distinguishes new-lesson from review sessions
    type SessionMode = 'lesson' | 'review-due' | 'review-hard';
    const [sessionMode, setSessionMode] = useState<SessionMode>('lesson');
    // fastPathWordIds — set from generateReviewLesson for Cloze-skip logic
    const [fastPathWordIds, setFastPathWordIds] = useState<Set<string>>(new Set());
    const [loadingReview, setLoadingReview] = useState(false);

    const [selectedTheme, setSelectedTheme] = useState<CurriculumTheme | null>(null);
    const [, setThemeWords] = useState<WordEntry[]>([]);
    const [loadingLesson, setLoadingLesson] = useState(false);

    // Drill state
    const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
    const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
    const [showResult, setShowResult] = useState(false);
    // Dialect bridging: shown in Cloze when an alternate (home-dialect) answer is selected
    const [softCorrectMsg, setSoftCorrectMsg] = useState<string | null>(null);
    const [zapEffect, setZapEffect] = useState(false);
    const [assemblyOrder, setAssemblyOrder] = useState<string[]>([]);
    const stepStartTime = useRef(Date.now());

    // Assembly timer state (component-level — drives the progress bar in renderAssembly)
    const [assemblyTimerPct, setAssemblyTimerPct] = useState(1);  // 1 = full, 0 = empty
    const [assemblyTimedOut, setAssemblyTimedOut] = useState(false);
    const [timedOutSentence, setTimedOutSentence] = useState('');
    // Stable refs — populated after nextStep is declared below
    const nextStepRef = useRef<() => void>(() => {});
    const showResultRef = useRef(false);
    useEffect(() => { showResultRef.current = showResult; }, [showResult]);

    // Sync state
    const [userId, setUserId] = useState<string | null>(getCachedUserId());
    const [claimEmail, setClaimEmail] = useState('');
    const [claimStatus, setClaimStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
    const [showClaimPanel, setShowClaimPanel] = useState(false);

    // ─── Speech Recognition (Mission 10) ────────────────────────
    // Feature-detect once on mount; stays null if API unavailable.
    // The Web Speech API is not fully typed in TypeScript's DOM lib,
    // so we use explicit `any` casts throughout this feature.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const _w = typeof window !== 'undefined' ? (window as unknown as Record<string, any>) : null;
    const speechSupported = !!(_w?.SpeechRecognition || _w?.webkitSpeechRecognition);
    const [micPermGranted, setMicPermGranted] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        return localStorage.getItem('igboverse_mic_granted') === 'true';
    });
    const [showMicModal, setShowMicModal] = useState(false);
    const [speechRecording, setSpeechRecording] = useState(false);
    const [speechTranscript, setSpeechTranscript] = useState<string | null>(null);
    const [speechMissing, setSpeechMissing] = useState<string[]>([]); // words not found
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognizerRef = useRef<any>(null);

    // ─── Init ───────────────────────────────────────────────────

    useEffect(() => {
        async function init() {
            // ── 1. Load from localStorage immediately (fast path) ──
            const localProfile = loadProfile();
            const localSrs     = loadSRSQueue();

            if (localProfile) setProfile(localProfile);
            setSrsQueue(localSrs);

            // Streak check
            const today = new Date().toISOString().slice(0, 10);
            if (localProfile?.lastSessionDate && localProfile.lastSessionDate !== today) {
                const diff = Math.floor(
                    (Date.now() - new Date(localProfile.lastSessionDate).getTime()) / 86_400_000
                );
                if (diff > 1) setProfile(p => ({ ...p, currentStreak: 0 }));
            }

            setScreen('home'); // show home instantly from localStorage

            // ── 2. Anonymous auth (async, non-blocking) ────────────
            const uid = await initializeUser();
            if (!uid) return; // auth failed — app runs fine from localStorage
            setUserId(uid);

            // ── 3. Load from Supabase and merge ───────────────────
            const [remoteProfile, remoteSrs] = await Promise.all([
                loadProgressFromDB(uid),
                loadSrsFromDB(uid),
            ]);

            if (remoteProfile) {
                const base    = localProfile ?? {
                    totalXP: 0, level: 1, wordsLearned: 0, lessonsCompleted: 0,
                    currentStreak: 0, longestStreak: 0,
                    lastSessionDate: '', seenWordIds: [],
                };
                const merged = mergeProfiles(base, remoteProfile);
                setProfile(merged);
                saveProfile(merged);
            }

            if (remoteSrs.length > 0) {
                const merged = mergeSrsQueues(localSrs, remoteSrs);
                setSrsQueue(merged);
                saveSRSQueue(merged);
            }
        }

        init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ─── Start a lesson ─────────────────────────────────────────

    const startLesson = useCallback(async (theme: CurriculumTheme) => {
        setLoadingLesson(true);
        setSelectedTheme(theme);

        try {
            // Fetch words for this theme
            const words = await fetchThemeWords(theme);
            setThemeWords(words);

            if (words.length < 3) {
                alert('Not enough words available for this theme. Try another!');
                setLoadingLesson(false);
                return;
            }

            // Select lesson words (SRS-aware)
            const dueIds = getDueWords(srsQueue).map(e => e.wordId);
            const seenSet = new Set(profile.seenWordIds);
            const selected = selectLessonWords(words, dueIds, seenSet, 4);

            // Generate the lesson
            const includePatterns = profile.wordsLearned >= 20;
            const newLesson = generateLesson(selected, theme.id, theme.name, {
                includePatterns,
                maxSteps: 10,
                wordPool: words,
            });

            setLesson(newLesson);
            setSession({
                lessonId: newLesson.id,
                currentStepIndex: 0,
                totalSteps: newLesson.steps.length,
                correctCount: 0,
                incorrectCount: 0,
                streak: 0,
                maxStreak: 0,
                startedAt: Date.now(),
                completedAt: null,
                stepResults: [],
                spokenAttempts: 0,
                spokenCorrect: 0,
            });

            // Add target words to SRS queue
            let q = [...srsQueue];
            for (const wid of newLesson.targetWords) {
                q = addToQueue(q, wid);
            }
            setSrsQueue(q);
            saveSRSQueue(q);

            // Mark words as seen
            const newSeen = new Set(profile.seenWordIds);
            for (const wid of newLesson.targetWords) newSeen.add(wid);
            setProfile(p => ({ ...p, seenWordIds: Array.from(newSeen) }));

            setScreen('drill');
        } catch (err) {
            console.error('Failed to start lesson:', err);
            alert('Failed to load lesson. Check your connection.');
        } finally {
            setLoadingLesson(false);
        }
    }, [srsQueue, profile]);

    // ─── Start a review session ──────────────────────────────────

    const startReview = useCallback(async (mode: 'due' | 'hard') => {
        setLoadingReview(true);
        try {
            const dueEntries = mode === 'hard'
                ? getHardWords(srsQueue, 5)
                : getDueWords(srsQueue);
            if (dueEntries.length === 0) { setLoadingReview(false); return; }

            const wordIds  = dueEntries.map((e: SRSMetadata) => e.wordId);
            const poolIds  = profile.seenWordIds.slice(0, 40);

            const [words, poolWords] = await Promise.all([
                fetchWordsByIds(wordIds),
                fetchWordsByIds(poolIds),
            ]);

            if (words.length === 0) { setLoadingReview(false); return; }

            const wordPool = [
                ...words,
                ...poolWords.filter((w: WordEntry) => !words.some((x: WordEntry) => x.id === w.id)),
            ];
            const { lesson: reviewLesson, fastPathWordIds: fpIds } =
                generateReviewLesson(words, dueEntries, wordPool, mode);

            setFastPathWordIds(fpIds);
            setLesson(reviewLesson);
            setSessionMode(mode === 'hard' ? 'review-hard' : 'review-due');
            setSession({
                lessonId: reviewLesson.id,
                currentStepIndex: 0,
                totalSteps: reviewLesson.steps.length,
                correctCount: 0,
                incorrectCount: 0,
                streak: 0,
                maxStreak: 0,
                startedAt: Date.now(),
                completedAt: null,
                stepResults: [],
                spokenAttempts: 0,
                spokenCorrect: 0,
            });
            setScreen('drill');
        } catch (err) {
            console.error('Failed to start review:', err);
        } finally {
            setLoadingReview(false);
        }
    }, [srsQueue, profile.seenWordIds]);

    // ─── Current step ───────────────────────────────────────────

    const currentStep = lesson && session ? lesson.steps[session.currentStepIndex] : null;

    // ─── Handle answer ─────────────────────────────────────────

    const handleAnswer = useCallback((answer: string | 'SUBMIT_SPOKEN_CORRECT') => {
        if (!currentStep || !session || showResult) return;

        const timeMs = Date.now() - stepStartTime.current;
        let correct = false;
        let isSoftCorrect = false;   // dialect alternate-answer: counts as correct
        let softMsg: string | null = null;

        switch (currentStep.type) {
            case 'recognition':
                correct = answer === currentStep.correctAnswer;
                break;
            case 'cloze': {
                if (answer === currentStep.correctAnswer) {
                    correct = true;
                } else if (currentStep.alternateAnswers?.includes(answer)) {
                    // Dialect bridge: home-dialect form accepted as fully correct
                    correct = true;
                    isSoftCorrect = true;
                    softMsg = currentStep.softCorrectNote ?? null;
                } else {
                    correct = false;
                }
                break;
            }
            case 'pattern':
                // Both options are valid in minimal-pair mode — user gets credit either way
                correct = true;
                break;
            case 'assembly':
                // SUBMIT_SPOKEN_CORRECT: speech handler already confirmed correctness
                if (answer === 'SUBMIT_SPOKEN_CORRECT') {
                    correct = true;
                } else {
                    // Block-tap path
                    correct = JSON.stringify(assemblyOrder) === JSON.stringify(currentStep.correctOrder);
                }
                break;
            default:
                correct = true; // exposure is always "correct"
        }

        setSoftCorrectMsg(softMsg);
        setSelectedAnswer(answer);
        setIsCorrect(correct);
        setShowResult(true);

        // Update session
        const newStreak = correct ? session.streak + 1 : 0;
        const newMaxStreak = Math.max(session.maxStreak, newStreak);

        // Zap effect for streak multiples of 3 (not on soft-correct to avoid confusion)
        if (correct && !isSoftCorrect && newStreak > 0 && newStreak % STREAK_ZAP_THRESHOLD === 0) {
            setZapEffect(true);
            setTimeout(() => setZapEffect(false), 800);
        }

        // Update SRS (local-first, then sync to Supabase)
        if (currentStep.type !== 'exposure') {
            const updatedQueue = recordReview(srsQueue, currentStep.wordId, correct, timeMs);
            setSrsQueue(updatedQueue);
            saveSRSQueue(updatedQueue);
            if (userId) saveSrsToDB(userId, updatedQueue).catch(() => {});
        }

        setSession(prev => prev ? {
            ...prev,
            correctCount: prev.correctCount + (correct ? 1 : 0),
            incorrectCount: prev.incorrectCount + (correct ? 0 : 1),
            streak: newStreak,
            maxStreak: newMaxStreak,
            stepResults: [...prev.stepResults, {
                stepIndex: prev.currentStepIndex,
                correct,
                timeMs,
                skipped: false,
            }],
        } : prev);
    }, [currentStep, session, showResult, assemblyOrder, srsQueue]);

    // ─── Advance to next step ──────────────────────────────────

    const nextStep = useCallback(() => {
        if (!session || !lesson) return;

        const nextIndex = session.currentStepIndex + 1;

        if (nextIndex >= lesson.steps.length) {
            // ── Compute avg assembly time for this session ────────
            const assemblyIndices = new Set(
                lesson.steps.map((s, i) => s.type === 'assembly' ? i : -1).filter(i => i !== -1)
            );
            const assemblyResults = session.stepResults.filter(r => assemblyIndices.has(r.stepIndex));
            const avgAssemblyMs = assemblyResults.length > 0
                ? Math.round(assemblyResults.reduce((sum, r) => sum + r.timeMs, 0) / assemblyResults.length)
                : null;

            if (avgAssemblyMs !== null) {
                localStorage.setItem('igboverse_last_assembly_ms', String(avgAssemblyMs));
                if (userId) saveAssemblyMetricsToDB(userId, avgAssemblyMs).catch(() => {});
            }

            // ── Append fluency events to rolling log ─────────────────
            const stepMetas = lesson.steps.map(s => ({
                type: s.type,
                wordId: s.wordId,
                sourceExampleIgbo: s.type === 'assembly' ? s.sourceExampleIgbo : undefined,
                minimalPairType: s.type === 'pattern' ? s.minimalPairType : undefined,
                correctAnswer: s.type === 'cloze' ? s.correctAnswer : undefined,
            }));
            appendFluencyEvents(buildFluencyEvents(session.stepResults, stepMetas));

            // Lesson complete!
            const xpEarned = session.correctCount * XP_CORRECT +
                session.maxStreak * XP_STREAK_BONUS;

            const today = new Date().toISOString().slice(0, 10);
            const isNewDay = profile.lastSessionDate !== today;
            const isReview = sessionMode === 'review-due' || sessionMode === 'review-hard';

            setProfile(p => {
                const updated = {
                    ...p,
                    totalXP: p.totalXP + xpEarned,
                    level: Math.floor((p.totalXP + xpEarned) / 100) + 1,
                    wordsLearned: new Set(p.seenWordIds).size,
                    lessonsCompleted: isReview ? p.lessonsCompleted : p.lessonsCompleted + 1,
                    reviewsCompleted: isReview ? (p.reviewsCompleted ?? 0) + 1 : (p.reviewsCompleted ?? 0),
                    currentStreak: isNewDay ? p.currentStreak + 1 : p.currentStreak,
                    longestStreak: Math.max(p.longestStreak, (isNewDay ? p.currentStreak + 1 : p.currentStreak)),
                    lastSessionDate: today,
                };
                saveProfile(updated);
                if (userId) saveProgressToDB(userId, updated).catch(() => {});
                return updated;
            });

            setSession(prev => prev ? { ...prev, completedAt: Date.now() } : prev);
            setScreen('summary');
        } else {
            setSession(prev => prev ? { ...prev, currentStepIndex: nextIndex } : prev);
            setSelectedAnswer(null);
            setIsCorrect(null);
            setShowResult(false);
            setSoftCorrectMsg(null);
            setAssemblyOrder([]);
            // Reset assembly timer state for the new step
            setAssemblyTimedOut(false);
            setTimedOutSentence('');
            setAssemblyTimerPct(1);
            stepStartTime.current = Date.now();
        }
    }, [session, lesson, profile, userId]);

    // Keep refs in sync with latest values
    useEffect(() => { nextStepRef.current = nextStep; }, [nextStep]);


    // ─── Auto-advance exposure steps ───────────────────────────

    useEffect(() => {
        if (currentStep?.type === 'exposure' && !showResult) {
            // Exposure: auto-advance after showing the card for a moment
            // User taps to continue
        }
    }, [currentStep, showResult]);

    // ─── Assembly timer effects ────────────────────────────────
    // Runs whenever we move to a new step OR showResult changes.
    // Starts the visual countdown bar + schedules the auto-submit.

    useEffect(() => {
        setAssemblyTimerPct(1);

        if (
            currentStep?.type !== 'assembly' ||
            !currentStep.timerSeconds ||
            showResult
        ) return;

        const totalMs = currentStep.timerSeconds * 1000;
        const startedAt = Date.now();

        // 50 ms visual tick for smooth bar
        const visualId = setInterval(() => {
            const pct = Math.max(0, 1 - (Date.now() - startedAt) / totalMs);
            setAssemblyTimerPct(pct);
        }, 50);

        // One-shot timeout — only schedule auto-submit when timerAutoSubmit is true
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        if (currentStep.timerAutoSubmit) {
            timeoutId = setTimeout(() => {
                if (!showResultRef.current) setAssemblyTimedOut(true);
            }, totalMs);
        }

        return () => {
            clearInterval(visualId);
            if (timeoutId) clearTimeout(timeoutId);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.currentStepIndex, showResult]);

    // Handles the moment assemblyTimedOut flips to true:
    // force-incorrect, flash correct sentence, auto-advance.
    useEffect(() => {
        if (!assemblyTimedOut || showResultRef.current) return;
        if (currentStep?.type !== 'assembly') return;

        const timeMs = Date.now() - stepStartTime.current;
        const correctSentence = currentStep.correctOrder.join(' ');

        setTimedOutSentence(correctSentence);
        setIsCorrect(false);
        setSelectedAnswer('TIMEOUT');
        setShowResult(true);

        // SRS: mark this word incorrect
        const updatedQueue = recordReview(srsQueue, currentStep.wordId, false, timeMs);
        setSrsQueue(updatedQueue);
        saveSRSQueue(updatedQueue);
        if (userId) saveSrsToDB(userId, updatedQueue).catch(() => {});

        // Session bookkeeping
        setSession(prev => prev ? {
            ...prev,
            incorrectCount: prev.incorrectCount + 1,
            streak: 0,
            stepResults: [...prev.stepResults, {
                stepIndex: prev.currentStepIndex,
                correct: false,
                timeMs,
                skipped: false,
            }],
        } : prev);

        // Auto-advance after 1.5 s
        const t = setTimeout(() => nextStepRef.current(), 1500);
        return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [assemblyTimedOut]);

    // ─── Audio: per-step instance with cleanup ────────────────

    /**
     * useStepAudio — creates a single Audio instance for the current step's
     * audio_url. Returns { play, canPlay } where canPlay is false if the
     * URL is null or the browser failed to load it.
     */
    function useStepAudio(url: string | null | undefined): { play: () => void; canPlay: boolean } {
        const audioRef = useRef<HTMLAudioElement | null>(null);
        const [canPlay, setCanPlay] = useState(false);

        useEffect(() => {
            if (!url) {
                setCanPlay(false);
                return;
            }
            const audio = new Audio(url);
            audioRef.current = audio;

            const onCanPlay = () => setCanPlay(true);
            const onError   = () => setCanPlay(false);

            audio.addEventListener('canplaythrough', onCanPlay);
            audio.addEventListener('error', onError);

            // Start loading (won't auto-play — just preloads)
            audio.load();

            return () => {
                audio.removeEventListener('canplaythrough', onCanPlay);
                audio.removeEventListener('error', onError);
                audio.pause();
                audioRef.current = null;
                setCanPlay(false);
            };
        }, [url]);

        const play = useCallback(() => {
            if (!audioRef.current) return;
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => {});
        }, []);

        return { play, canPlay };
    }

    // Tiny helper for one-shot plays (recognition correct-answer, etc.)
    const playAudio = (url: string | null | undefined) => {
        if (!url) return;
        try {
            const a = new Audio(url);
            a.play().catch(() => {});
        } catch {}
    };

    // ─── Speech helpers (Mission 10) ──────────────────────────

    /** Strip tone diacritics and punctuation for loose transcript matching. */
    function normalizeForSpeech(s: string): string {
        return s
            .toLowerCase()
            // common Igbo diacritics → base Latin
            .replace(/[ọ]/g, 'o').replace(/[ụ]/g, 'u')
            .replace(/[ị]/g, 'i').replace(/[ạ]/g, 'a')
            .replace(/[ẹ]/g, 'e').replace(/[ṅ]/g, 'n')
            .replace(/[àáâãäå]/g, 'a').replace(/[èéêë]/g, 'e')
            .replace(/[ìíîï]/g, 'i').replace(/[òóôõö]/g, 'o')
            .replace(/[ùúûü]/g, 'u')
            // strip punctuation
            .replace(/[^a-z0-9\s]/g, '')
            .trim();
    }

    /**
     * Loose match: what fraction of target words appear in the transcript?
     * Returns { score: 0..1, missing: string[] }
     */
    function speechMatchScore(
        transcript: string,
        correctOrder: string[],
    ): { score: number; missing: string[] } {
        const normT = normalizeForSpeech(transcript);
        const targetWords = correctOrder
            .flatMap(chunk => chunk.split(/\s+/))
            .map(normalizeForSpeech)
            .filter(Boolean);
        const missing = targetWords.filter(w => !normT.includes(w));
        const score = targetWords.length > 0
            ? (targetWords.length - missing.length) / targetWords.length
            : 0;
        // return original-case chunks for missing display
        const missingOriginal = correctOrder
            .flatMap(chunk => chunk.split(/\s+/))
            .filter((_, i) => {
                const norm = normalizeForSpeech(correctOrder.flatMap(c => c.split(/\s+/))[i]);
                return !normT.includes(norm);
            });
        return { score, missing: missingOriginal };
    }

    /** Start the Web Speech API recognizer for an assembly step. */
    function startSpeechRecognition(step: LessonStep & { type: 'assembly' }) {
        // Reset per-attempt state
        setSpeechTranscript(null);
        setSpeechMissing([]);
        setSpeechRecording(true);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const _ww = window as unknown as Record<string, any>;
        const SR = (_ww.SpeechRecognition || _ww.webkitSpeechRecognition) as new () => any;
        const rec = new SR();
        rec.lang = 'ig';
        rec.interimResults = false;
        rec.maxAlternatives = 3;
        recognizerRef.current = rec;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rec.onresult = (event: any) => {
            // Pick the top alternative
            const transcript = event.results[0][0].transcript;
            setSpeechTranscript(transcript);
            setSpeechRecording(false);

            const { score, missing } = speechMatchScore(transcript, step.correctOrder);
            setSpeechMissing(missing);

            const correct = score >= 0.8;

            // Update session spoken counters
            setSession(prev => prev ? {
                ...prev,
                spokenAttempts: prev.spokenAttempts + 1,
                spokenCorrect:  prev.spokenCorrect + (correct ? 1 : 0),
            } : prev);

            // Update SRS spoken counters on the word entry
            setSrsQueue(prev => prev.map(e =>
                e.wordId === step.wordId
                    ? {
                        ...e,
                        spokenAttempts: (e.spokenAttempts ?? 0) + 1,
                        spokenCorrect:  (e.spokenCorrect ?? 0) + (correct ? 1 : 0),
                    }
                    : e
            ));

            if (correct) {
                // Positive reinforcement: play native audio immediately
                playAudio(step.audioUrl);
                // Score as correct via handleAnswer pathway
                handleAnswer('SUBMIT_SPOKEN_CORRECT');
            }
            // If incorrect: leave UI visible so user sees missing words, then waits for tap
        };

        rec.onerror = () => setSpeechRecording(false);
        rec.onend   = () => setSpeechRecording(false);
        rec.start();
    }

    function stopSpeechRecognition() {
        recognizerRef.current?.stop();
        setSpeechRecording(false);
    }

    // ─── Render: Onboarding ────────────────────────────────────

    if (showOnboarding) {
        return (
            <OnboardingDiagnostic
                onComplete={() => setShowOnboarding(false)}
            />
        );
    }

    // ─── Render: Loading ───────────────────────────────────────

    if (screen === 'loading') {
        return (
            <div style={styles.loadingScreen}>
                <div style={styles.loadingSpinner} />
                <p style={styles.loadingText}>Loading Igboverse...</p>
            </div>
        );
    }

    // ─── Render: Home ──────────────────────────────────────────

    if (screen === 'home') {
        const unlocked = getUnlockedThemes(profile.level);
        const dueCount = getDueWords(srsQueue).length;

        return (
            <div style={styles.homeScreen}>
                {/* Header */}
                <header style={styles.header}>
                    <h1 style={styles.logo}>Igboverse</h1>
                    <div style={styles.headerStats}>
                        <span style={styles.statBadge}>🔥 {profile.currentStreak}</span>
                        <span style={styles.statBadge}>⚡ {profile.totalXP} XP</span>
                        <span style={styles.statBadge}>📚 Lv {profile.level}</span>
                    </div>
                </header>

                {/* Hero */}
                <div style={styles.hero}>
                    <h2 style={styles.heroTitle}>Nnọọ!</h2>
                    <p style={styles.heroSubtitle}>
                        {profile.lessonsCompleted === 0
                            ? 'Start your Igbo journey — pick a topic below'
                            : (() => {
                                const dash = getWeeklyDashboard();
                                const chunks = dash.chunksPracticed;
                                return chunks > 0
                                    ? `${chunks} chunk${chunks !== 1 ? 's' : ''} practiced · ${profile.lessonsCompleted} lessons done`
                                    : `${profile.lessonsCompleted} lessons done`;
                            })()}
                    </p>

                    {/* Dialect chip */}
                    {(() => {
                        const label = getDialectLabel();
                        if (!label) return null;
                        return (
                            <button
                                id="dialect-chip"
                                onClick={() => {
                                    // Clear onboarding key so the diagnostic re-runs
                                    localStorage.removeItem(DIAGNOSTIC_KEY);
                                    localStorage.removeItem(ONBOARDING_KEY);
                                    setShowOnboarding(true);
                                }}
                                style={styles.dialectChip}
                                title="Tap to change your dialect setting"
                            >
                                🗣 {label} dialect
                            </button>
                        );
                    })()}

                    {/* Review buttons — amber urgency button when words are due */}
                    {dueCount > 0 && (
                        <div style={styles.reviewButtonRow}>
                            <button
                                id="review-due-btn"
                                onClick={() => startReview('due')}
                                disabled={loadingReview}
                                style={styles.reviewDueBtn}
                            >
                                {loadingReview ? 'Loading…' : `📝 Review ${dueCount} word${dueCount > 1 ? 's' : ''} due`}
                            </button>
                            {getHardWords(srsQueue, 5).length > 0 && (
                                <button
                                    id="review-hard-btn"
                                    onClick={() => startReview('hard')}
                                    disabled={loadingReview}
                                    style={styles.reviewHardBtn}
                                    title="Drill your weakest words"
                                >
                                    🔥 Hard words
                                </button>
                            )}
                        </div>
                    )}

                    {/* Sync panel — appears once user has started learning */}
                    {profile.lessonsCompleted >= 1 && (
                        <div style={styles.syncPanel}>
                            {userId ? (
                                <>
                                    <span style={styles.syncStatus}>☁️ Progress synced</span>
                                    <button
                                        onClick={() => setShowClaimPanel(v => !v)}
                                        style={styles.syncBtn}
                                    >
                                        {showClaimPanel ? 'Cancel' : 'Save to email'}
                                    </button>
                                    {showClaimPanel && (
                                        <div style={styles.claimForm}>
                                            <p style={styles.claimHint}>
                                                Link your progress to an email so you can restore it on any device.
                                            </p>
                                            <input
                                                type="email"
                                                placeholder="your@email.com"
                                                value={claimEmail}
                                                onChange={e => setClaimEmail(e.target.value)}
                                                style={styles.claimInput}
                                            />
                                            <button
                                                onClick={async () => {
                                                    if (!claimEmail) return;
                                                    setClaimStatus('sending');
                                                    const err = await claimAccountWithEmail(claimEmail);
                                                    setClaimStatus(err ? 'error' : 'sent');
                                                }}
                                                style={styles.claimSubmit}
                                                disabled={claimStatus === 'sending' || !claimEmail}
                                            >
                                                {claimStatus === 'sending' ? 'Sending…'
                                                    : claimStatus === 'sent' ? '✓ Check your email'
                                                    : claimStatus === 'error' ? 'Try again'
                                                    : 'Send link'}
                                            </button>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <span style={styles.syncStatus}>📱 Progress saved locally</span>
                            )}
                        </div>
                    )}
                </div>

                {/* Theme Grid */}
                <div style={styles.themeGrid}>
                    {CURRICULUM.map((theme, idx) => {
                        const isUnlocked = idx < unlocked.length;
                        return (
                            <button
                                key={theme.id}
                                onClick={() => isUnlocked && startLesson(theme)}
                                disabled={!isUnlocked || loadingLesson}
                                style={{
                                    ...styles.themeCard,
                                    borderColor: isUnlocked ? theme.color : '#e5e7eb',
                                    opacity: isUnlocked ? 1 : 0.5,
                                    cursor: isUnlocked ? 'pointer' : 'not-allowed',
                                }}
                            >
                                <span style={styles.themeIcon}>{theme.icon}</span>
                                <span style={styles.themeName}>{theme.name}</span>
                                <span style={styles.themeDesc}>
                                    {isUnlocked ? theme.description : `🔒 Reach Level ${idx}`}
                                </span>
                                {loadingLesson && selectedTheme?.id === theme.id && (
                                    <span style={styles.loadingDot}>Loading...</span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Fluency Metrics Dashboard */}
                {(() => {
                    const dash: WeeklyDashboard = getWeeklyDashboard();
                    const getArrow = (curr: number | null, prev: number | null) => {
                        if (curr === null || prev === null || Math.abs(curr - prev) < 50) return null;
                        return curr < prev ? '↓' : '↑';
                    };
                    return (
                        <div style={styles.dashRow}>
                            <div style={styles.dashCard}>
                                <span style={styles.dashLabel}>Assembly speed</span>
                                {dash.assemblyAvgMs !== null ? (
                                    <span style={styles.dashValue}>
                                        {(dash.assemblyAvgMs / 1000).toFixed(1)}s
                                        {getArrow(dash.assemblyAvgMs, dash.prevAssemblyAvgMs) && (
                                            <span style={{
                                                fontSize: 13,
                                                color: (dash.assemblyAvgMs ?? 0) < (dash.prevAssemblyAvgMs ?? 0) ? '#059669' : '#ef4444',
                                                marginLeft: 4,
                                            }}>
                                                {getArrow(dash.assemblyAvgMs, dash.prevAssemblyAvgMs)}
                                            </span>
                                        )}
                                    </span>
                                ) : (
                                    <span style={styles.dashBaseline}>Building baseline…</span>
                                )}
                            </div>
                            <div style={styles.dashCard}>
                                <span style={styles.dashLabel}>Suffix accuracy</span>
                                {dash.suffixRate !== null ? (
                                    <span style={{ ...styles.dashValue, color: dash.suffixRate >= 0.7 ? '#059669' : '#f59e0b' }}>
                                        {Math.round(dash.suffixRate * 100)}%
                                    </span>
                                ) : (
                                    <span style={styles.dashBaseline}>Building baseline…</span>
                                )}
                            </div>
                            <div style={styles.dashCard}>
                                <span style={styles.dashLabel}>Tone accuracy</span>
                                {dash.tonalRate !== null ? (
                                    <span style={{ ...styles.dashValue, color: dash.tonalRate >= 0.7 ? '#059669' : '#f59e0b' }}>
                                        {Math.round(dash.tonalRate * 100)}%
                                    </span>
                                ) : (
                                    <span style={styles.dashBaseline}>Building baseline…</span>
                                )}
                            </div>
                        </div>
                    );
                })()}
            </div>
        );
    }

    // ─── Render: Drill ─────────────────────────────────────────

    if (screen === 'drill' && currentStep && session && lesson) {
        const progress = (session.currentStepIndex / lesson.steps.length) * 100;

        return (
            <div style={styles.drillScreen}>
                {/* Zap overlay */}
                {zapEffect && (
                    <div style={styles.zapOverlay}>
                        <span style={styles.zapText}>⚡ {session.streak} streak!</span>
                    </div>
                )}

                {/* Progress bar */}
                <div style={styles.progressBarContainer}>
                    <button onClick={() => setScreen('home')} style={styles.closeBtn}>✕</button>
                    <div style={styles.progressBarTrack}>
                        <div style={{ ...styles.progressBarFill, width: `${progress}%` }} />
                    </div>
                    <span style={styles.streakBadge}>
                        {session.streak > 0 ? `🔥${session.streak}` : ''}
                    </span>
                </div>

                {/* Step Content */}
                <div style={styles.stepContainer}>
                    {renderStep(currentStep)}
                </div>

                {/* Result + Continue — suppressed during assembly timeout flash */}
                {showResult && currentStep.type !== 'exposure' && !assemblyTimedOut && (
                    <div style={{
                        ...styles.resultBanner,
                        backgroundColor: isCorrect ? '#dcfce7' : '#fee2e2',
                        borderColor: isCorrect ? '#22c55e' : '#ef4444',
                    }}>
                        <div style={styles.resultContent}>
                            <span style={styles.resultIcon}>{isCorrect ? '✓' : '✗'}</span>
                            <span style={styles.resultText}>
                                {isCorrect ? 'Correct!' : getCorrectAnswerText(currentStep)}
                            </span>
                        </div>
                        <button onClick={nextStep} style={{
                            ...styles.continueBtn,
                            backgroundColor: isCorrect ? '#22c55e' : '#ef4444',
                        }}>
                            Continue
                        </button>
                    </div>
                )}
            </div>
        );
    }

    // ─── Render: Summary ───────────────────────────────────────

    if (screen === 'summary' && session && lesson) {
        const xpEarned = session.correctCount * XP_CORRECT + session.maxStreak * XP_STREAK_BONUS;
        const accuracy = session.totalSteps > 0
            ? Math.round((session.correctCount / (session.correctCount + session.incorrectCount)) * 100)
            : 0;
        const duration = session.completedAt
            ? Math.round((session.completedAt - session.startedAt) / 1000)
            : 0;

        // ── Assembly speed ────────────────────────────────────────
        const assemblyIndices = new Set(
            lesson.steps.map((s, i) => s.type === 'assembly' ? i : -1).filter(i => i !== -1)
        );
        const assemblyResults = session.stepResults.filter(r => assemblyIndices.has(r.stepIndex) && r.correct);
        const avgAssemblyMs = assemblyResults.length > 0
            ? Math.round(assemblyResults.reduce((sum, r) => sum + r.timeMs, 0) / assemblyResults.length)
            : null;
        const prevAvgAssemblyMs = typeof window !== 'undefined'
            ? (Number(localStorage.getItem('igboverse_last_assembly_ms')) || null)
            : null;
        const assemblyDeltaMs = (avgAssemblyMs !== null && prevAvgAssemblyMs !== null)
            ? avgAssemblyMs - prevAvgAssemblyMs : null;
        const assemblyImproved = assemblyDeltaMs !== null && assemblyDeltaMs < 0;

        // ── Suffix accuracy (Cloze steps) ─────────────────────────
        const clozeIndices = new Set(
            lesson.steps.map((s, i) => s.type === 'cloze' ? i : -1).filter(i => i !== -1)
        );
        const clozeResults = session.stepResults.filter(r => clozeIndices.has(r.stepIndex));
        const suffixCorrect = clozeResults.filter(r => r.correct).length;
        const suffixRate = clozeResults.length > 0 ? suffixCorrect / clozeResults.length : null;

        // ── Tonal accuracy (Pattern steps) ────────────────────────
        const patternIndices = new Set(
            lesson.steps.map((s, i) => s.type === 'pattern' ? i : -1).filter(i => i !== -1)
        );
        const patternResults = session.stepResults.filter(r => patternIndices.has(r.stepIndex));
        const tonalCorrect = patternResults.filter(r => r.correct).length;
        const tonalRate = patternResults.length > 0 ? tonalCorrect / patternResults.length : null;

        // ── Review-specific ───────────────────────────────────────
        const isReview = sessionMode === 'review-due' || sessionMode === 'review-hard';
        const wordsStrengthened = session.stepResults.filter(r => r.correct).length;
        const wordsReset = session.stepResults.filter(r => !r.correct).length;
        const reviewedWordIds = lesson.targetWords;
        const nextReviewLines = isReview
            ? reviewedWordIds.slice(0, 5).map(wid => {
                const entry = srsQueue.find(e => e.wordId === wid);
                if (!entry) return null;
                const daysUntil = Math.max(0, Math.round((entry.nextReview - Date.now()) / 86_400_000));
                const wordEntry = lesson.steps.find(s => s.wordId === wid);
                const label = wordEntry?.wordId ?? wid.slice(0, 8);
                return { label, daysUntil };
            }).filter(Boolean) as { label: string; daysUntil: number }[]
            : [];

        // ── Contextual coach message ──────────────────────────────
        let coachMsg: string | null = null;
        if (suffixRate !== null && suffixRate < 0.7) {
            coachMsg = 'Focus: verb endings are your next unlock';
        } else if (assemblyDeltaMs !== null && assemblyDeltaMs > 200) {
            coachMsg = 'Try thinking in Igbo first — skip the English step';
        } else if (tonalRate !== null && tonalRate < 0.7) {
            coachMsg = 'Your ear is ahead of your eye — the tones will click soon';
        } else if ((avgAssemblyMs !== null && assemblyImproved) ||
            (suffixRate !== null && suffixRate >= 0.9) ||
            (tonalRate !== null && tonalRate >= 0.9)) {
            coachMsg = 'Chunk retrieval is getting faster — this is fluency';
        }

        return (
            <div style={styles.summaryScreen}>
                <div style={styles.summaryCard}>
                    <div style={styles.summaryEmoji}>{isReview ? '🧠' : '🎉'}</div>
                    <h2 style={styles.summaryTitle}>
                        {isReview ? 'Review complete!' : 'Lesson complete!'}
                    </h2>

                    {/* Assembly speed — headline metric */}
                    {avgAssemblyMs !== null && (
                        <div style={styles.summaryHeroMetric}>
                            <span style={styles.summaryHeroValue}>
                                {(avgAssemblyMs / 1000).toFixed(1)}s
                                {assemblyDeltaMs !== null && (
                                    <span style={{
                                        fontSize: 16, fontWeight: 600, marginLeft: 8,
                                        color: assemblyImproved ? '#059669' : '#ef4444',
                                    }}>
                                        {assemblyImproved ? '↓' : '↑'} {(Math.abs(assemblyDeltaMs) / 1000).toFixed(1)}s
                                    </span>
                                )}
                            </span>
                            <span style={styles.summaryHeroLabel}>
                                Assembly speed {assemblyDeltaMs === null ? '(first session)'
                                    : assemblyImproved ? '— faster ✓' : '— slower'}
                            </span>
                        </div>
                    )}

                    {/* Suffix + tonal accuracy chips */}
                    {(suffixRate !== null || tonalRate !== null) && (
                        <div style={styles.accuracyRow}>
                            {suffixRate !== null && (
                                <div style={styles.accuracyChip}>
                                    <span style={{
                                        ...styles.accuracyChipValue,
                                        color: suffixRate >= 0.7 ? '#059669' : '#f59e0b',
                                    }}>
                                        {suffixCorrect}/{clozeResults.length}
                                    </span>
                                    <span style={styles.accuracyChipLabel}>Verb suffixes</span>
                                </div>
                            )}
                            {tonalRate !== null && (
                                <div style={styles.accuracyChip}>
                                    <span style={{
                                        ...styles.accuracyChipValue,
                                        color: tonalRate >= 0.7 ? '#059669' : '#f59e0b',
                                    }}>
                                        {tonalCorrect}/{patternResults.length}
                                    </span>
                                    <span style={styles.accuracyChipLabel}>Tone accuracy</span>
                                </div>
                            )}
                            <div style={styles.accuracyChip}>
                                <span style={styles.accuracyChipValue}>{accuracy}%</span>
                                <span style={styles.accuracyChipLabel}>Overall</span>
                            </div>
                        </div>
                    )}

                    {/* Coach message */}
                    {coachMsg && <div style={styles.coachMsg}>{coachMsg}</div>}

                    {/* Review: next schedule */}
                    {isReview && (
                        <div style={styles.reviewSummaryBox}>
                            <div style={styles.reviewSummaryRow}>
                                <span style={{ color: '#059669', fontWeight: 700 }}>✓ {wordsStrengthened}</span>
                                <span style={{ color: '#6b7280' }}>steps correct</span>
                            </div>
                            <div style={styles.reviewSummaryRow}>
                                <span style={{ color: '#dc2626', fontWeight: 700 }}>✗ {wordsReset}</span>
                                <span style={{ color: '#6b7280' }}>reset (shorter interval)</span>
                            </div>
                            {nextReviewLines.length > 0 && (
                                <div style={styles.nextReviewList}>
                                    <p style={styles.nextReviewTitle}>Next review schedule:</p>
                                    {nextReviewLines.map(({ label, daysUntil }) => (
                                        <div key={label} style={styles.nextReviewItem}>
                                            <span style={styles.nextReviewWord}>{label}</span>
                                            <span style={styles.nextReviewTime}>
                                                {daysUntil === 0 ? 'today' : `in ${daysUntil} day${daysUntil > 1 ? 's' : ''}`}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Spoken accuracy chip — only when ≥ 3 spoken attempts in this session */}
                    {session.spokenAttempts >= 3 && (
                        <div style={styles.accuracyRow}>
                            <div style={styles.accuracyChip}>
                                <span style={{
                                    ...styles.accuracyChipValue,
                                    color: (session.spokenCorrect / session.spokenAttempts) >= 0.7
                                        ? '#059669' : '#f59e0b',
                                }}>
                                    {session.spokenCorrect}/{session.spokenAttempts}
                                </span>
                                <span style={styles.accuracyChipLabel}>🎙 Spoken</span>
                            </div>
                        </div>
                    )}

                    {/* Secondary stats — demoted to footnote */}
                    <div style={styles.summarySecondary}>
                        <span style={styles.summarySecondaryItem}>🔥 Consistency streak: {session.maxStreak}</span>
                        <span style={styles.summarySecondaryItem}>⏱ {duration}s</span>
                        <span style={styles.summarySecondaryItem}>+ {xpEarned} XP</span>
                    </div>

                    {/* Listen next — immersion feed card */}
                    {(() => {
                        const rec = getImmersionRecommendation(
                            lesson.themeId,
                            profile.level,
                        );
                        const sourceBadgeColor: Record<string, string> = {
                            'BBC Igbo':         '#dc2626',
                            'Igbo Daily Drops': '#7c3aed',
                            'Obodo':            '#0369a1',
                            'NKATA':            '#b45309',
                        };
                        return (
                            <div style={styles.immersionCard}>
                                <div style={styles.immersionHeader}>
                                    <span style={{
                                        ...styles.immersionSourceBadge,
                                        background: sourceBadgeColor[rec.source] ?? '#374151',
                                    }}>
                                        {rec.source}
                                    </span>
                                    <span style={styles.immersionTagline}>
                                        Listen next
                                    </span>
                                </div>
                                <p style={styles.immersionTitle}>{rec.title}</p>
                                <p style={styles.immersionDesc}>{rec.description}</p>
                                <div style={styles.immersionChunks}>
                                    {rec.chunkExamples.map(chunk => (
                                        <span key={chunk} style={styles.immersionChunk}>
                                            {chunk}
                                        </span>
                                    ))}
                                </div>
                                <p style={styles.immersionLabel}>
                                    This clip contains chunks you just practiced
                                </p>
                                <a
                                    href={rec.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={styles.immersionBtn}
                                >
                                    Open →
                                </a>
                            </div>
                        );
                    })()}

                    <button onClick={() => setScreen('home')} style={styles.homeButton}>
                        Continue Learning
                    </button>
                </div>
            </div>
        );
    }

    return null;

    // ─── Step Renderers ────────────────────────────────────────

    function renderStep(step: LessonStep) {
        switch (step.type) {
            case 'exposure': return renderExposure(step);
            case 'recognition': return renderRecognition(step);
            case 'cloze': return renderCloze(step);
            case 'assembly': return renderAssembly(step);
            case 'pattern': return renderPattern(step);
        }
    }

    // Exposure: show the word — auto-plays on mount, tap-to-replay
    function renderExposure(step: LessonStep & { type: 'exposure' }) {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const { play, canPlay } = useStepAudio(step.audioUrl);
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const { play: playDialect, canPlay: canPlayDialect } = useStepAudio(
            step.dialectAudioUrl ?? null
        );
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const { play: playSentenceAudio, canPlay: canPlaySentenceAudio } = useStepAudio(
            step.exampleAudioUrl ?? null
        );

        // Auto-play Standard word audio once on mount
        // eslint-disable-next-line react-hooks/rules-of-hooks
        useEffect(() => {
            if (canPlay) play();
        // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [canPlay]);

        // Auto-advance timer driven by step.autoAdvanceMs (5s chunk / 3s fallback)
        // Cancelled automatically when component unmounts (next step renders)
        // eslint-disable-next-line react-hooks/rules-of-hooks
        useEffect(() => {
            const ms = step.autoAdvanceMs ?? 3000;
            const t = setTimeout(() => nextStepRef.current(), ms);
            return () => clearTimeout(t);
        // Re-run only when the word changes — not on every render
        // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [step.wordId]);

        /**
         * Play the example sentence: try sentence audio URL first,
         * then Web Speech API (lang='ig') as a silent fallback.
         */
        function playSentence() {
            if (canPlaySentenceAudio) {
                playSentenceAudio();
                return;
            }
            if (step.exampleSentence && typeof window !== 'undefined' && 'speechSynthesis' in window) {
                try {
                    const utterance = new SpeechSynthesisUtterance(step.exampleSentence);
                    utterance.lang = 'ig';
                    utterance.rate = 0.85;
                    window.speechSynthesis.cancel();
                    window.speechSynthesis.speak(utterance);
                } catch { /* silent */ }
            }
        }

        /** Render sentence with target word bolded inline. */
        function renderHighlighted(): React.ReactNode {
            const sentence = step.exampleSentence;
            const hw = step.highlightWord;
            if (!sentence || !hw) return sentence ?? null;
            const idx = sentence.toLowerCase().indexOf(hw.toLowerCase());
            if (idx === -1) return sentence;
            return (
                <>
                    {sentence.slice(0, idx)}
                    <strong style={styles.sentenceHighlight}>
                        {sentence.slice(idx, idx + hw.length)}
                    </strong>
                    {sentence.slice(idx + hw.length)}
                </>
            );
        }

        return (
            <div style={styles.exposureCard}>
                <p style={styles.exposureLabel}>New Word</p>
                <h2 style={styles.exposureIgbo}>{step.igbo}</h2>
                <p style={styles.exposureEnglish}>{step.english}</p>
                {step.hint && <span style={styles.exposureHint}>{step.hint}</span>}

                {/* Chunk-first: example sentence block */}
                {step.exampleSentence && (
                    <div style={styles.exampleSentenceBlock}>
                        <p style={styles.exampleSentenceIgbo}>{renderHighlighted()}</p>
                        <p style={styles.exampleSentenceEnglish}>{step.exampleTranslation}</p>
                        <button
                            id="exposure-sentence-audio-btn"
                            onClick={playSentence}
                            style={styles.hearSentenceBtn}
                            aria-label="Hear the sentence"
                        >
                            🔊 Hear the sentence
                        </button>
                    </div>
                )}

                {/* Dialect bridge */}
                {step.dialectForm && step.dialectLabel && (
                    <div style={styles.dialectBridge}>
                        <span style={styles.dialectBridgeLabel}>{step.dialectLabel}:</span>
                        <span style={styles.dialectBridgeWord}>{step.dialectForm}</span>
                        {(step.dialectAudioUrl || canPlayDialect) && (
                            <button
                                id="exposure-dialect-audio-btn"
                                onClick={playDialect}
                                disabled={!canPlayDialect}
                                style={{
                                    ...styles.audioBtn,
                                    ...styles.dialectAudioBtn,
                                    ...(!canPlayDialect ? styles.audioBtnDisabled : {}),
                                }}
                                aria-label={`Hear ${step.dialectLabel} pronunciation`}
                            >
                                🔊
                            </button>
                        )}
                    </div>
                )}

                {/* Standard audio */}
                <button
                    id="exposure-audio-btn"
                    onClick={play}
                    disabled={!canPlay}
                    style={{
                        ...styles.audioBtn,
                        ...(!canPlay ? styles.audioBtnDisabled : {}),
                    }}
                    aria-label="Replay pronunciation"
                >
                    🔊 Listen
                </button>

                <button onClick={nextStep} style={styles.gotItBtn}>
                    Got it →
                </button>
            </div>
        );
    }

    // Recognition: multiple choice — plays correct audio after selection
    function renderRecognition(step: LessonStep & { type: 'recognition' }) {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const { play: playCorrect } = useStepAudio(step.audioUrl);

        // After a correct answer is shown, play the word audio
        // eslint-disable-next-line react-hooks/rules-of-hooks
        useEffect(() => {
            if (showResult && isCorrect && step.audioUrl) {
                const t = setTimeout(() => playCorrect(), 350);
                return () => clearTimeout(t);
            }
        // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [showResult, isCorrect]);

        // Visual label for the phase based on distractor type
        const phaseLabel =
            step.distractorType === 'tonal'    ? '🎧 Tone recognition' :
            step.distractorType === 'dialectal' ? '🗺️ Dialect recognition' :
            'Choose the correct answer';

        return (
            <div style={styles.questionCard}>
                <p style={styles.questionLabel}>
                    {step.direction === 'audio-to-igbo' ? '🔊 Listen & choose' : phaseLabel}
                </p>
                {step.direction === 'audio-to-igbo' && (
                    <button
                        id="recognition-audio-btn"
                        onClick={playCorrect}
                        style={styles.bigAudioBtn}
                        aria-label="Play audio"
                    >
                        🔊 Play Sound
                    </button>
                )}
                <h3 style={styles.questionPrompt}>{step.prompt}</h3>
                <div style={styles.optionGrid}>
                    {step.options.map((opt, i) => {
                        let optStyle = { ...styles.optionBtn };
                        if (showResult) {
                            if (opt === step.correctAnswer) {
                                optStyle = { ...optStyle, ...styles.optionCorrect };
                            } else if (opt === selectedAnswer && !isCorrect) {
                                optStyle = { ...optStyle, ...styles.optionWrong };
                            }
                        } else if (opt === selectedAnswer) {
                            optStyle = { ...optStyle, ...styles.optionSelected };
                        }
                        const dialectLabel = step.dialectLabels?.[opt];
                        return (
                            <button
                                key={i}
                                onClick={() => handleAnswer(opt)}
                                style={optStyle}
                                disabled={showResult}
                            >
                                <span style={{ display: 'block', fontWeight: 600 }}>{opt}</span>
                                {dialectLabel && (
                                    <span style={styles.dialectTag}>{dialectLabel}</span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    }

    // Cloze: fill in the blank — tap-to-hear only
    function renderCloze(step: LessonStep & { type: 'cloze' }) {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const { play, canPlay } = useStepAudio(step.audioUrl);

        return (
            <div style={styles.questionCard}>
                <p style={styles.questionLabel}>Fill in the blank</p>
                <h3 style={styles.clozeSentence}>{step.sentenceWithBlank}</h3>
                <p style={styles.clozeTranslation}>{step.translation}</p>
                <button
                    id="cloze-audio-btn"
                    onClick={play}
                    disabled={!canPlay}
                    style={{
                        ...styles.audioBtn,
                        ...(!canPlay ? styles.audioBtnDisabled : {}),
                    }}
                    aria-label="Hear sentence"
                >
                    🔊 Listen
                </button>
                <div style={styles.optionGrid}>
                    {step.options.map((opt, i) => {
                        let optStyle = { ...styles.optionBtn };
                        if (showResult) {
                            // The main correct answer always gets green
                            if (opt === step.correctAnswer) {
                                optStyle = { ...optStyle, ...styles.optionCorrect };
                            } else if (
                                opt === selectedAnswer &&
                                step.alternateAnswers?.includes(opt)
                            ) {
                                // Soft-correct: dialect alternate answer — show in amber
                                optStyle = { ...optStyle, ...styles.optionSoftCorrect };
                            } else if (opt === selectedAnswer && !isCorrect) {
                                optStyle = { ...optStyle, ...styles.optionWrong };
                            }
                        }
                        return (
                            <button
                                key={i}
                                onClick={() => handleAnswer(opt)}
                                style={optStyle}
                                disabled={showResult}
                            >
                                {opt}
                            </button>
                        );
                    })}
                </div>
                {/* Dialect bridge note — shown only after soft-correct selection */}
                {showResult && softCorrectMsg && (
                    <div style={styles.softCorrectNote}>
                        {softCorrectMsg}
                    </div>
                )}
            </div>
        );
    }

    // Assembly: sentence scramble — progress-bar timer + optional speech mode
    function renderAssembly(step: LessonStep & { type: 'assembly' }) {
        const remaining = step.chunks.filter(c => !assemblyOrder.includes(c));
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const { play, canPlay } = useStepAudio(step.audioUrl);

        // Timer bar colour: green > 50%, amber 20-50%, red < 20%
        const barColor = assemblyTimerPct > 0.5
            ? '#22c55e'
            : assemblyTimerPct > 0.20
            ? '#f59e0b'
            : '#ef4444';

        function handleMicTap() {
            if (!micPermGranted) {
                setShowMicModal(true);  // show one-time custom modal
                return;
            }
            if (speechRecording) {
                stopSpeechRecognition();
            } else {
                startSpeechRecognition(step);
            }
        }

        return (
            <div style={{ maxWidth: 500, width: '100%' }}>

                {/* Mic permission modal — one-time, custom (not browser native) */}
                {showMicModal && (
                    <div style={styles.micModalOverlay}>
                        <div style={styles.micModalCard}>
                            <div style={styles.micModalIcon}>🎙</div>
                            <p style={styles.micModalTitle}>Microphone access</p>
                            <p style={styles.micModalBody}>
                                Igboverse wants to use your microphone to check your spoken Igbo.
                                Your audio stays on your device — nothing is sent to a server.
                            </p>
                            <div style={styles.micModalBtns}>
                                <button
                                    style={styles.micModalDeny}
                                    onClick={() => setShowMicModal(false)}
                                >
                                    Not now
                                </button>
                                <button
                                    style={styles.micModalAllow}
                                    onClick={() => {
                                        localStorage.setItem('igboverse_mic_granted', 'true');
                                        setMicPermGranted(true);
                                        setShowMicModal(false);
                                        startSpeechRecognition(step);
                                    }}
                                >
                                    Allow
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Timer progress bar */}
                {step.timerSeconds && !showResult && (
                    <div style={styles.timerBarTrack}>
                        <div style={{
                            ...styles.timerBarFill,
                            width: `${assemblyTimerPct * 100}%`,
                            background: barColor,
                        }} />
                    </div>
                )}

                <div style={{
                    ...styles.questionCard,
                    borderRadius: step.timerSeconds && !showResult ? '0 0 14px 14px' : undefined,
                    paddingTop: step.timerSeconds && !showResult ? 16 : 24,
                }}>
                    <p style={styles.questionLabel}>Build the sentence</p>
                    <p style={styles.clozeTranslation}>{step.translation}</p>

                    {/* Timeout flash */}
                    {assemblyTimedOut && timedOutSentence && (
                        <div style={styles.timeoutFlash}>
                            ⏱ {timedOutSentence}
                        </div>
                    )}

                    {/* Controls row: Listen + optional Mic */}
                    {!assemblyTimedOut && (
                        <div style={styles.assemblyControlRow}>
                            <button
                                id="assembly-audio-btn"
                                onClick={play}
                                disabled={!canPlay}
                                style={{
                                    ...styles.audioBtn,
                                    ...(!canPlay ? styles.audioBtnDisabled : {}),
                                }}
                                aria-label="Hear sentence"
                            >
                                🔊 Listen
                            </button>

                            {/* Mic button — only rendered if Web Speech API is available */}
                            {speechSupported && !showResult && (
                                <button
                                    id="assembly-mic-btn"
                                    onClick={handleMicTap}
                                    style={{
                                        ...styles.micBtn,
                                        ...(speechRecording ? styles.micBtnActive : {}),
                                    }}
                                    aria-label={speechRecording ? 'Stop recording' : 'Speak the sentence'}
                                    title="Speak the sentence instead of tapping"
                                >
                                    {speechRecording ? '⏹ Stop' : '🎙 Speak'}
                                </button>
                            )}
                        </div>
                    )}

                    {/* Speech transcript display */}
                    {speechTranscript && !showResult && (
                        <div style={styles.transcriptBox}>
                            <span style={styles.transcriptLabel}>You said: </span>
                            <span style={styles.transcriptText}>{speechTranscript}</span>
                            {speechMissing.length > 0 && (
                                <div style={styles.missingWords}>
                                    Missing:{' '}
                                    {speechMissing.map(w => (
                                        <span key={w} style={styles.missingWord}>{w}</span>
                                    ))}
                                    <button
                                        onClick={() => handleAnswer('SUBMIT')}
                                        style={styles.tryBlocksBtn}
                                    >
                                        Use blocks instead →
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Answer area */}
                    {!assemblyTimedOut && (
                        <div style={styles.assemblyArea}>
                            {assemblyOrder.length > 0
                                ? assemblyOrder.map((chunk, i) => (
                                    <button
                                        key={`placed-${i}`}
                                        onClick={() => {
                                            if (!showResult) setAssemblyOrder(prev => prev.filter((_, j) => j !== i));
                                        }}
                                        style={styles.assemblyPlaced}
                                    >
                                        {chunk}
                                    </button>
                                ))
                                : <span style={styles.assemblyPlaceholder}>Tap words below to build the sentence</span>
                            }
                        </div>
                    )}

                    {/* Available chunks */}
                    {!assemblyTimedOut && (
                        <div style={styles.assemblyChunks}>
                            {remaining.map((chunk, i) => (
                                <button
                                    key={`chunk-${i}`}
                                    onClick={() => {
                                        if (!showResult) setAssemblyOrder(prev => [...prev, chunk]);
                                    }}
                                    style={styles.assemblyChunk}
                                    disabled={showResult}
                                >
                                    {chunk}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Submit button */}
                    {assemblyOrder.length === step.chunks.length && !showResult && !assemblyTimedOut && (
                        <button onClick={() => handleAnswer('SUBMIT')} style={styles.submitBtn}>
                            Check Answer
                        </button>
                    )}
                </div>
            </div>
        );
    }


    // Pattern: spot the difference — tap-to-hear sentence A and B separately
    // Pattern: minimal pair — tap the word that changed
    function renderPattern(step: LessonStep & { type: 'pattern' }) {
        /**
         * NEW UI: show both sentences side by side.
         * After the user taps a sentence button (A or B), we reveal:
         *  - which word changed (highlighted in the sentences)
         *  - the grammar note (one sentence)
         * "Correct" = user tapped either button (both are valid — the goal is noticing
         *  the difference, not picking the right sentence). So handleAnswer accepts any.
         */

        // Highlight the changedWord within a sentence string
        function highlightChanged(sentence: string, changedWord: string | undefined): React.ReactNode {
            if (!changedWord || !showResult) return sentence;
            const idx = sentence.toLowerCase().indexOf(changedWord.toLowerCase());
            if (idx === -1) return sentence;
            return (
                <>
                    {sentence.slice(0, idx)}
                    <mark style={styles.changedWordHighlight}>
                        {sentence.slice(idx, idx + changedWord.length)}
                    </mark>
                    {sentence.slice(idx + changedWord.length)}
                </>
            );
        }

        const pairLabel =
            step.minimalPairType === 'tonal'  ? '🎧 Tone pair' :
            step.minimalPairType === 'suffix' ? '🔍 Verb suffix pair' :
            'Spot the pattern';

        return (
            <div style={styles.questionCard}>
                <p style={styles.questionLabel}>{pairLabel}</p>
                <h3 style={{ ...styles.questionPrompt, fontSize: 16 }}>{step.question}</h3>

                <button
                    onClick={() => handleAnswer('A')}
                    style={{
                        ...styles.patternOption,
                        ...(showResult ? styles.patternOptionRevealed : {}),
                    }}
                    disabled={showResult}
                >
                    <span style={styles.patternLabel}>A</span>
                    <span style={styles.patternIgbo}>
                        {highlightChanged(step.sentenceA.igbo, step.changedWord)}
                    </span>
                    {showResult && <span style={styles.patternEnglish}>{step.sentenceA.english}</span>}
                </button>

                <button
                    onClick={() => handleAnswer('B')}
                    style={{
                        ...styles.patternOption,
                        ...(showResult ? styles.patternOptionRevealed : {}),
                    }}
                    disabled={showResult}
                >
                    <span style={styles.patternLabel}>B</span>
                    <span style={styles.patternIgbo}>
                        {highlightChanged(step.sentenceB.igbo, step.changedWord)}
                    </span>
                    {showResult && <span style={styles.patternEnglish}>{step.sentenceB.english}</span>}
                </button>

                {showResult && step.grammarNote && (
                    <div style={styles.grammarNote}>
                        <span style={styles.grammarNoteIcon}>💡</span>
                        <span>{step.grammarNote}</span>
                    </div>
                )}
            </div>
        );
    }

    function getCorrectAnswerText(step: LessonStep): string {
        switch (step.type) {
            case 'recognition':
            case 'cloze':
                return `Answer: ${step.correctAnswer}`;
            case 'assembly':
                return `Correct: ${step.correctOrder.join(' ')}`;
            case 'pattern':
                return `Answer: ${step.correctAnswer}`;
            default:
                return '';
        }
    }
}

// ─── Styles ──────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
    // Loading
    loadingScreen: {
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: '100vh',
        background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
    },
    loadingSpinner: {
        width: 40, height: 40, border: '4px solid #d1d5db',
        borderTopColor: '#10b981', borderRadius: '50%',
        animation: 'spin 1s linear infinite',
    },
    loadingText: { marginTop: 16, color: '#6b7280', fontSize: 14 },

    // Home
    homeScreen: {
        minHeight: '100vh',
        background: 'linear-gradient(160deg, #ecfdf5 0%, #f0fdf4 40%, #fefce8 100%)',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    },
    header: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '16px 24px', borderBottom: '1px solid rgba(0,0,0,0.06)',
        background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(8px)',
        position: 'sticky' as const, top: 0, zIndex: 10,
    },
    logo: { fontSize: 24, fontWeight: 800, color: '#059669', margin: 0 },
    headerStats: { display: 'flex', gap: 12 },
    statBadge: {
        fontSize: 13, fontWeight: 600, color: '#374151',
        padding: '4px 10px', borderRadius: 20,
        background: 'rgba(255,255,255,0.9)', border: '1px solid #e5e7eb',
    },

    // Hero
    hero: { textAlign: 'center' as const, padding: '48px 24px 24px' },
    heroTitle: { fontSize: 48, fontWeight: 800, color: '#064e3b', margin: '0 0 8px' },
    heroSubtitle: { fontSize: 16, color: '#6b7280', margin: 0 },
    // Dialect chip — tappable green pill on home screen hero
    dialectChip: {
        display: 'inline-flex', alignItems: 'center', gap: 6,
        marginTop: 12, padding: '6px 14px', borderRadius: 20,
        background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.3)',
        color: '#059669', fontSize: 12, fontWeight: 600,
        cursor: 'pointer', transition: 'background 0.15s',
    },
    // Review buttons (home screen)
    reviewButtonRow: {
        display: 'flex', gap: 10, justifyContent: 'center',
        flexWrap: 'wrap' as const, marginTop: 16,
    },
    reviewDueBtn: {
        padding: '12px 22px', borderRadius: 14, border: 'none',
        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
        color: 'white', fontSize: 15, fontWeight: 700,
        cursor: 'pointer', boxShadow: '0 2px 8px rgba(245,158,11,0.35)',
        transition: 'transform 0.15s, box-shadow 0.15s',
    },
    reviewHardBtn: {
        padding: '12px 18px', borderRadius: 14, border: 'none',
        background: 'linear-gradient(135deg, #ef4444, #dc2626)',
        color: 'white', fontSize: 14, fontWeight: 700,
        cursor: 'pointer', boxShadow: '0 2px 8px rgba(239,68,68,0.3)',
        transition: 'transform 0.15s',
    },
    syncPanel: {
        display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
        gap: 8, marginTop: 16,
    },
    syncStatus: { fontSize: 12, color: '#9ca3af' },
    syncBtn: {
        fontSize: 12, color: '#059669', background: 'none', border: 'none',
        cursor: 'pointer', textDecoration: 'underline', padding: 0,
    },
    claimForm: {
        display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
        gap: 8, padding: '12px 16px', borderRadius: 12,
        background: '#f9fafb', border: '1px solid #e5e7eb',
        width: '100%', maxWidth: 280, marginTop: 4,
    },
    claimHint: { fontSize: 12, color: '#6b7280', margin: 0, textAlign: 'center' as const, lineHeight: 1.5 },
    claimInput: {
        width: '100%', padding: '8px 12px', borderRadius: 8,
        border: '1px solid #d1d5db', fontSize: 14,
        outline: 'none', boxSizing: 'border-box' as const,
    },
    claimSubmit: {
        width: '100%', padding: '10px 16px', borderRadius: 10,
        border: 'none', background: '#059669', color: 'white',
        fontSize: 14, fontWeight: 600, cursor: 'pointer',
    },


    // Theme grid
    themeGrid: {
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 16, padding: '16px 24px 48px', maxWidth: 800, margin: '0 auto',
    },
    themeCard: {
        display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
        padding: 20, borderRadius: 16, border: '2px solid',
        background: 'white', transition: 'all 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        gap: 6, textAlign: 'center' as const,
    },
    themeIcon: { fontSize: 32 },
    themeName: { fontSize: 15, fontWeight: 700, color: '#1f2937' },
    themeDesc: { fontSize: 11, color: '#9ca3af', lineHeight: 1.3 },
    loadingDot: { fontSize: 10, color: '#6b7280', marginTop: 4 },

    // Drill screen
    drillScreen: {
        minHeight: '100vh', display: 'flex', flexDirection: 'column' as const,
        background: 'white',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    },
    progressBarContainer: {
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px', borderBottom: '1px solid #f3f4f6',
    },
    closeBtn: {
        width: 32, height: 32, borderRadius: 16, border: '1px solid #e5e7eb',
        background: 'none', fontSize: 16, color: '#9ca3af', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    progressBarTrack: {
        flex: 1, height: 10, borderRadius: 5, background: '#e5e7eb', overflow: 'hidden' as const,
    },
    progressBarFill: {
        height: '100%', borderRadius: 5,
        background: 'linear-gradient(90deg, #34d399, #10b981)',
        transition: 'width 0.4s ease',
    },
    streakBadge: { fontSize: 14, fontWeight: 700, minWidth: 40, textAlign: 'right' as const },

    stepContainer: {
        flex: 1, display: 'flex', flexDirection: 'column' as const,
        alignItems: 'center', justifyContent: 'center',
        padding: '24px 20px',
    },

    // Exposure
    exposureCard: {
        display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
        gap: 16, padding: 32, maxWidth: 400, width: '100%',
    },
    exposureLabel: { fontSize: 13, fontWeight: 600, color: '#10b981', margin: 0, letterSpacing: 1, textTransform: 'uppercase' as const },
    exposureIgbo: { fontSize: 40, fontWeight: 800, color: '#1f2937', margin: 0, textAlign: 'center' as const },
    exposureEnglish: { fontSize: 20, color: '#6b7280', margin: 0 },
    exposureHint: { fontSize: 12, color: '#9ca3af', padding: '4px 12px', borderRadius: 12, background: '#f9fafb' },
    // Chunk-first: example sentence block
    exampleSentenceBlock: {
        width: '100%', padding: '14px 16px', borderRadius: 14,
        background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)',
        display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 6,
    },
    exampleSentenceIgbo: {
        fontSize: 18, fontWeight: 600, color: '#1f2937',
        margin: 0, textAlign: 'center' as const, lineHeight: 1.5,
    },
    exampleSentenceEnglish: {
        fontSize: 13, color: '#6b7280', margin: 0,
        textAlign: 'center' as const, fontStyle: 'italic',
    },
    hearSentenceBtn: {
        marginTop: 4, padding: '7px 16px', borderRadius: 10,
        border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.08)',
        color: '#059669', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        transition: 'background 0.15s',
    },
    sentenceHighlight: {
        fontWeight: 800, color: '#059669',
        textDecoration: 'underline', textDecorationColor: 'rgba(16,185,129,0.4)',
        textUnderlineOffset: 3,
    },
    audioBtn: {
        padding: '10px 20px', borderRadius: 12, border: '1px solid #e5e7eb',
        background: '#f9fafb', fontSize: 14, cursor: 'pointer', color: '#374151',
        transition: 'opacity 0.2s',
    },
    audioBtnDisabled: {
        opacity: 0.38,
        cursor: 'not-allowed',
        color: '#9ca3af',
    },
    gotItBtn: {
        padding: '14px 36px', borderRadius: 14, border: 'none',
        background: '#10b981', color: 'white', fontSize: 16, fontWeight: 600,
        cursor: 'pointer', marginTop: 12,
    },

    // Questions
    questionCard: {
        display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
        gap: 16, padding: 24, maxWidth: 500, width: '100%',
    },
    questionLabel: { fontSize: 13, fontWeight: 600, color: '#6b7280', margin: 0, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
    questionPrompt: { fontSize: 22, fontWeight: 700, color: '#1f2937', margin: 0, textAlign: 'center' as const },
    bigAudioBtn: {
        padding: '16px 32px', borderRadius: 16, border: '2px solid #e5e7eb',
        background: '#f9fafb', fontSize: 24, cursor: 'pointer', color: '#374151',
    },
    optionGrid: {
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
        width: '100%', marginTop: 8,
    },
    optionBtn: {
        padding: '14px 16px', borderRadius: 14, border: '2px solid #e5e7eb',
        background: 'white', fontSize: 15, fontWeight: 500, cursor: 'pointer',
        color: '#374151', transition: 'all 0.15s', textAlign: 'center' as const,
    },
    optionSelected: { borderColor: '#3b82f6', background: '#eff6ff', color: '#1e40af' },
    optionCorrect: { borderColor: '#22c55e', background: '#dcfce7', color: '#166534' },
    optionWrong: { borderColor: '#ef4444', background: '#fee2e2', color: '#991b1b' },
    // Dialect soft-correct — amber (accepted but "bridged to Standard")
    optionSoftCorrect: { borderColor: '#f59e0b', background: '#fef3c7', color: '#92400e' },
    // Dialect bridge note below Cloze options
    softCorrectNote: {
        marginTop: 10, padding: '10px 14px', borderRadius: 10,
        background: '#fffbeb', border: '1px solid #fed7aa',
        fontSize: 12, color: '#92400e', lineHeight: 1.5,
    },
    // Exposure phase: dialect bridge display
    dialectBridge: {
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 16px', borderRadius: 12,
        background: 'rgba(16,185,129,0.06)', border: '1px dashed rgba(16,185,129,0.3)',
        marginTop: 6, fontSize: 14,
    },
    dialectBridgeLabel: { color: '#6b7280', fontSize: 12, fontWeight: 600, flexShrink: 0 },
    dialectBridgeWord: { color: '#059669', fontWeight: 700, fontSize: 18 },
    dialectAudioBtn: {
        padding: '4px 10px', fontSize: 14, marginLeft: 'auto',
        background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)',
        borderRadius: 8, cursor: 'pointer',
    },

    // Cloze
    clozeSentence: {
        fontSize: 24, fontWeight: 700, color: '#1f2937', margin: 0,
        textAlign: 'center' as const, lineHeight: 1.4,
    },
    clozeTranslation: { fontSize: 14, color: '#9ca3af', margin: 0, textAlign: 'center' as const, fontStyle: 'italic' as const },

    // Assembly
    assemblyArea: {
        display: 'flex', flexWrap: 'wrap' as const, gap: 8,
        minHeight: 56, padding: 16, borderRadius: 14,
        border: '2px dashed #d1d5db', background: '#f9fafb',
        width: '100%', justifyContent: 'center', alignItems: 'center',
    },
    assemblyPlaceholder: { fontSize: 13, color: '#9ca3af' },
    assemblyPlaced: {
        padding: '8px 16px', borderRadius: 10, border: '2px solid #3b82f6',
        background: '#eff6ff', fontSize: 15, fontWeight: 600, color: '#1e40af',
        cursor: 'pointer',
    },
    assemblyChunks: {
        display: 'flex', flexWrap: 'wrap' as const, gap: 8,
        justifyContent: 'center', width: '100%',
    },
    assemblyChunk: {
        padding: '10px 18px', borderRadius: 12, border: '2px solid #e5e7eb',
        background: 'white', fontSize: 15, fontWeight: 500, cursor: 'pointer',
        color: '#374151',
    },
    submitBtn: {
        padding: '14px 36px', borderRadius: 14, border: 'none',
        background: '#3b82f6', color: 'white', fontSize: 16, fontWeight: 600,
        cursor: 'pointer', marginTop: 8,
    },
    timerRingWrap: {
        position: 'relative' as const, width: 52, height: 52,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        alignSelf: 'center',
    },
    timerDigit: {
        position: 'absolute' as const, fontSize: 16, fontWeight: 800,
        lineHeight: 1,
    },
    // Timer progress bar (Assembly)
    timerBarTrack: {
        width: '100%', height: 5,
        background: '#e5e7eb',
        borderRadius: '14px 14px 0 0',
        overflow: 'hidden' as const,
    },
    timerBarFill: {
        height: '100%',
        transition: 'width 0.05s linear, background-color 0.5s',
        borderRadius: 0,
    },
    // Timeout sentence flash
    timeoutFlash: {
        width: '100%', padding: '14px 20px', borderRadius: 10,
        background: '#f3f4f6', color: '#9ca3af',
        fontSize: 17, fontWeight: 500, textAlign: 'center' as const,
        letterSpacing: '0.3px',
    },

    // Pattern
    patternOption: {
        display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-start',
        gap: 4, padding: 16, borderRadius: 14, border: '2px solid #e5e7eb',
        background: 'white', width: '100%', cursor: 'pointer',
        transition: 'all 0.15s', textAlign: 'left' as const,
    },
    patternLabel: { fontSize: 12, fontWeight: 700, color: '#9ca3af' },
    patternIgbo: { fontSize: 17, fontWeight: 600, color: '#1f2937' },
    patternEnglish: { fontSize: 13, color: '#6b7280', fontStyle: 'italic' as const },
    grammarNote: {
        display: 'flex', gap: 8, padding: 16, borderRadius: 12,
        background: '#fef3c7', border: '1px solid #fde68a',
        fontSize: 13, color: '#92400e', width: '100%', lineHeight: 1.5,
    },
    grammarNoteIcon: { fontSize: 18 },
    // Dialect tag shown under recognition options (dialectal distractor mode)
    dialectTag: {
        display: 'block', fontSize: 10, fontWeight: 500, color: '#9ca3af',
        marginTop: 2, letterSpacing: '0.3px',
    },
    // Pattern minimal pair: revealed state (neutral — both choices are valid)
    patternOptionRevealed: {
        borderColor: '#a5b4fc', background: '#eef2ff',
    },
    // Highlighted changed word in pattern sentences
    changedWordHighlight: {
        background: '#fef08a', color: '#713f12',
        borderRadius: 3, padding: '1px 3px',
        fontWeight: 700,
    },

    // Result banner
    resultBanner: {
        padding: '16px 20px', borderTop: '3px solid',
        display: 'flex', flexDirection: 'column' as const, gap: 12,
        alignItems: 'center',
    },
    resultContent: { display: 'flex', alignItems: 'center', gap: 8 },
    resultIcon: { fontSize: 24, fontWeight: 700 },
    resultText: { fontSize: 16, fontWeight: 600 },
    continueBtn: {
        width: '100%', maxWidth: 400, padding: '14px 24px', borderRadius: 14,
        border: 'none', color: 'white', fontSize: 16, fontWeight: 700,
        cursor: 'pointer',
    },

    // Zap overlay
    zapOverlay: {
        position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(251, 191, 36, 0.15)',
        zIndex: 100, pointerEvents: 'none' as const,
        animation: 'fadeOut 0.8s ease-out forwards',
    },
    zapText: {
        fontSize: 48, fontWeight: 800, color: '#f59e0b',
        textShadow: '0 0 20px rgba(245, 158, 11, 0.3)',
    },

    // Summary
    summaryScreen: {
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(160deg, #ecfdf5 0%, #f0fdf4 40%, #fefce8 100%)',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        padding: 24,
    },
    summaryCard: {
        background: 'white', borderRadius: 24, padding: 40,
        boxShadow: '0 8px 30px rgba(0,0,0,0.08)', textAlign: 'center' as const,
        maxWidth: 420, width: '100%',
    },
    summaryEmoji: { fontSize: 64, marginBottom: 16 },
    summaryTitle: { fontSize: 28, fontWeight: 800, color: '#1f2937', margin: '0 0 16px' },
    // Headline assembly speed metric
    summaryHeroMetric: {
        width: '100%', padding: '18px 20px', borderRadius: 16,
        background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
        border: '1px solid #6ee7b7', marginBottom: 16,
        display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 4,
    },
    summaryHeroValue: { fontSize: 36, fontWeight: 800, color: '#059669' },
    summaryHeroLabel: { fontSize: 13, color: '#065f46', fontWeight: 600 },
    // Accuracy chip row
    accuracyRow: {
        display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' as const, justifyContent: 'center',
    },
    accuracyChip: {
        display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
        padding: '10px 16px', borderRadius: 12, background: '#f9fafb',
        border: '1px solid #e5e7eb', minWidth: 72,
    },
    accuracyChipValue: { fontSize: 22, fontWeight: 800, color: '#1f2937' },
    accuracyChipLabel: { fontSize: 11, color: '#9ca3af', fontWeight: 500, marginTop: 2 },
    // Coaching callout
    coachMsg: {
        width: '100%', padding: '12px 16px', borderRadius: 12,
        background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)',
        fontSize: 14, fontWeight: 600, color: '#065f46',
        textAlign: 'center' as const, marginBottom: 16, lineHeight: 1.5,
    },
    // Secondary stats footnote
    summarySecondary: {
        display: 'flex', gap: 12, justifyContent: 'center',
        flexWrap: 'wrap' as const, marginBottom: 20,
    },
    summarySecondaryItem: {
        fontSize: 12, color: '#9ca3af', fontWeight: 500,
    },
    // Old grid stats — kept for review mode compatibility
    summaryStats: {
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32,
    },
    summaryStat: {
        display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
        gap: 4, padding: 12, borderRadius: 12, background: '#f9fafb',
    },
    summaryStatValue: { fontSize: 24, fontWeight: 800, color: '#059669' },
    summaryStatLabel: { fontSize: 12, color: '#9ca3af', fontWeight: 500 },
    homeButton: {
        width: '100%', padding: '16px 24px', borderRadius: 14,
        border: 'none', background: '#10b981', color: 'white',
        fontSize: 17, fontWeight: 700, cursor: 'pointer',
    },
    // Home screen fluency dashboard
    dashRow: {
        display: 'flex', gap: 10, padding: '4px 16px 24px',
        overflowX: 'auto' as const,
    },
    dashCard: {
        flex: '1 1 0', minWidth: 90, padding: '14px 12px', borderRadius: 14,
        background: '#f9fafb', border: '1px solid #e5e7eb',
        display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 4,
    },
    dashLabel: { fontSize: 11, color: '#9ca3af', fontWeight: 600, textAlign: 'center' as const },
    dashValue: { fontSize: 20, fontWeight: 800, color: '#1f2937' },
    dashBaseline: { fontSize: 11, color: '#d1d5db', fontStyle: 'italic' as const, textAlign: 'center' as const },


    // Review summary
    reviewSummaryBox: {
        background: '#f8fafc', border: '1px solid #e2e8f0',
        borderRadius: 14, padding: '16px 20px', marginBottom: 24,
        textAlign: 'left' as const,
    },
    reviewSummaryRow: {
        display: 'flex', gap: 8, alignItems: 'center',
        fontSize: 14, marginBottom: 6,
    },
    nextReviewList: {
        marginTop: 12, paddingTop: 12, borderTop: '1px solid #e5e7eb',
    },
    nextReviewTitle: {
        fontSize: 11, fontWeight: 700, color: '#9ca3af',
        textTransform: 'uppercase' as const, letterSpacing: '0.5px',
        margin: '0 0 8px',
    },
    nextReviewItem: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontSize: 13, padding: '4px 0', borderBottom: '1px solid #f3f4f6',
    },
    nextReviewWord: { fontWeight: 600, color: '#1f2937' },
    nextReviewTime: { color: '#6b7280' },

    // Immersion feed card
    immersionCard: {
        width: '100%', padding: '18px 20px', borderRadius: 16, marginBottom: 20,
        background: 'linear-gradient(135deg, #fafff9 0%, #f0fdf4 100%)',
        border: '1.5px solid #a7f3d0',
        textAlign: 'left' as const,
    },
    immersionHeader: {
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
    },
    immersionSourceBadge: {
        fontSize: 10, fontWeight: 700, color: 'white',
        padding: '3px 8px', borderRadius: 6, letterSpacing: '0.4px',
        textTransform: 'uppercase' as const,
    },
    immersionTagline: {
        fontSize: 11, fontWeight: 600, color: '#6b7280',
        textTransform: 'uppercase' as const, letterSpacing: '0.5px',
    },
    immersionTitle: {
        fontSize: 14, fontWeight: 700, color: '#065f46',
        margin: '0 0 6px', lineHeight: 1.3,
    },
    immersionDesc: {
        fontSize: 12, color: '#6b7280', margin: '0 0 10px', lineHeight: 1.5,
    },
    immersionChunks: {
        display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginBottom: 10,
    },
    immersionChunk: {
        fontSize: 13, fontWeight: 600, color: '#059669',
        padding: '3px 10px', borderRadius: 20,
        background: '#dcfce7', border: '1px solid #bbf7d0',
    },
    immersionLabel: {
        fontSize: 11, color: '#9ca3af', fontStyle: 'italic' as const,
        margin: '0 0 12px', lineHeight: 1.4,
    },
    immersionBtn: {
        display: 'inline-block', padding: '9px 20px', borderRadius: 10,
        background: '#059669', color: 'white',
        fontSize: 13, fontWeight: 700, textDecoration: 'none',
        letterSpacing: '0.2px',
    },

    // Assembly controls
    assemblyControlRow: {
        display: 'flex', gap: 8, alignItems: 'center',
        flexWrap: 'wrap' as const, marginBottom: 8,
    },

    // Mic button states
    micBtn: {
        padding: '9px 16px', borderRadius: 12, border: '2px solid #d1d5db',
        background: 'white', color: '#374151',
        fontSize: 14, fontWeight: 600, cursor: 'pointer',
        transition: 'all 0.15s',
    },
    micBtnActive: {
        borderColor: '#ef4444', background: '#fef2f2', color: '#dc2626',
        animation: 'pulse 1s ease-in-out infinite',
    },

    // Transcript area
    transcriptBox: {
        width: '100%', padding: '10px 14px', borderRadius: 10,
        background: '#f9fafb', border: '1px solid #e5e7eb',
        marginBottom: 8, textAlign: 'left' as const, lineHeight: 1.5,
    },
    transcriptLabel: { fontSize: 11, color: '#9ca3af', fontWeight: 600 },
    transcriptText: { fontSize: 13, color: '#374151' },
    missingWords: {
        marginTop: 6, display: 'flex', flexWrap: 'wrap' as const,
        gap: 4, alignItems: 'center',
        fontSize: 12, color: '#6b7280',
    },
    missingWord: {
        padding: '1px 8px', borderRadius: 6,
        background: '#fee2e2', color: '#dc2626',
        fontWeight: 600, fontSize: 12,
    },
    tryBlocksBtn: {
        marginLeft: 8, padding: '3px 10px', borderRadius: 8,
        border: '1px solid #d1d5db', background: 'white',
        fontSize: 11, color: '#6b7280', cursor: 'pointer',
    },

    // Mic permission modal
    micModalOverlay: {
        position: 'fixed' as const, inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 200,
    },
    micModalCard: {
        background: 'white', borderRadius: 20, padding: '32px 28px',
        maxWidth: 340, width: '90%', textAlign: 'center' as const,
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
    },
    micModalIcon: { fontSize: 48, marginBottom: 12 },
    micModalTitle: {
        fontSize: 18, fontWeight: 800, color: '#1f2937',
        margin: '0 0 8px',
    },
    micModalBody: {
        fontSize: 14, color: '#6b7280', lineHeight: 1.6,
        margin: '0 0 24px',
    },
    micModalBtns: {
        display: 'flex', gap: 10, justifyContent: 'center',
    },
    micModalDeny: {
        flex: 1, padding: '12px 0', borderRadius: 12,
        border: '2px solid #e5e7eb', background: 'white',
        fontSize: 15, fontWeight: 600, color: '#6b7280', cursor: 'pointer',
    },
    micModalAllow: {
        flex: 1, padding: '12px 0', borderRadius: 12,
        border: 'none', background: '#059669',
        fontSize: 15, fontWeight: 700, color: 'white', cursor: 'pointer',
    },
};
