"use client";

import React, { useState, useEffect } from "react";
import { dbUpsert } from "@/lib/supabase";
import { getCachedUserId } from "@/lib/auth";

// ─── Types ────────────────────────────────────────────────────────

export interface DiagnosticAnswers {
  stuckPoint: string;
  translationDependent: string;
  tonalAwareness: string;
  dialect: string;
  idiomaticDepth: string;
  sessionStyle: string;
}

export const DIAGNOSTIC_KEY = "igboverse_diagnostic";
export const ONBOARDING_KEY = "igboverse_onboarding_complete";

export function loadDiagnostic(): DiagnosticAnswers | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DIAGNOSTIC_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ─── Supabase sync ────────────────────────────────────────────────

async function saveDiagnosticToDB(
  userId: string,
  answers: DiagnosticAnswers
): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const { error } = await dbUpsert(
      "user_progress",
      {
        user_id: userId,
        stuck_point: answers.stuckPoint,
        translation_dependent: answers.translationDependent,
        tonal_awareness: answers.tonalAwareness,
        dialect: answers.dialect,
        idiomatic_depth: answers.idiomaticDepth,
        session_style: answers.sessionStyle,
      },
      "user_id"
    );
    if (error)
      console.warn("[OnboardingDiagnostic] DB save error:", error.message);
  } catch (err) {
    console.warn("[OnboardingDiagnostic] DB save exception:", err);
  }
}

// ─── Tonal visual note styles (declared here so they can be used in QUESTIONS) ──

const noteStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 16,
  padding: "16px 20px",
  borderRadius: 14,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const tonePairStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 4,
};

const toneWordStyle: React.CSSProperties = {
  fontSize: 26,
  fontWeight: 800,
  color: "#a5f3fc",
  letterSpacing: "0.5px",
};

const toneMeaningStyle: React.CSSProperties = {
  fontSize: 12,
  color: "rgba(255,255,255,0.45)",
  fontStyle: "italic",
};

const toneVsStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "rgba(255,255,255,0.3)",
  textTransform: "uppercase",
  letterSpacing: 1,
};

// ─── Questions ───────────────────────────────────────────────────

interface Question {
  id: keyof DiagnosticAnswers;
  text: string;
  options: string[];
  note?: React.ReactNode;
}

const QUESTIONS: Question[] = [
  {
    id: "stuckPoint",
    text: "When you try to speak Igbo, where do you usually get stuck?",
    options: [
      "Running out of words",
      "Not sure how to conjugate verbs",
      "Don't know the right word order",
      "All of the above",
    ],
  },
  {
    id: "translationDependent",
    text: "When you try to speak, do you think in English first and then translate?",
    options: ["Yes, always", "Sometimes", "I try to think directly in Igbo"],
  },
  {
    id: "tonalAwareness",
    text: "Can you hear the difference between ákwá and àkwá without any other context?",
    options: ["Yes, easily", "Sometimes", "Honestly no"],
    note: (
      <div style={noteStyle}>
        <div style={tonePairStyle}>
          <span style={toneWordStyle}>ákwá</span>
          <span style={toneMeaningStyle}>cry</span>
        </div>
        <span style={toneVsStyle}>vs</span>
        <div style={tonePairStyle}>
          <span style={toneWordStyle}>àkwá</span>
          <span style={toneMeaningStyle}>egg</span>
        </div>
      </div>
    ),
  },
  {
    id: "dialect",
    text: "Which variety of Igbo did you grow up hearing most?",
    options: [
      "Onitsha / Onicha",
      "Owerri / Owere",
      "Enugu / Waawa",
      "Another dialect",
      "Not sure",
    ],
  },
  {
    id: "idiomaticDepth",
    text: "Can you recognize or use any Igbo proverbs or idioms — phrases where the meaning isn't literal?",
    options: [
      "Yes, a few",
      "I recognize them but can't use them",
      "Not really",
    ],
  },
  {
    id: "sessionStyle",
    text: "How are you most likely to use this app?",
    options: [
      "Several short sessions during the day",
      "One focused session daily",
    ],
  },
];

// ─── Component ───────────────────────────────────────────────────

interface Props {
  onComplete: () => void;
}

export default function OnboardingDiagnostic({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<DiagnosticAnswers>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const question = QUESTIONS[step];
  const isLast = step === QUESTIONS.length - 1;
  const progress = ((step + 1) / QUESTIONS.length) * 100;

  // Reset selection when step advances
  useEffect(() => {
    setSelected(null);
  }, [step]);

  const handleNext = () => {
    if (!selected) return;

    const newAnswers = { ...answers, [question.id]: selected };
    setAnswers(newAnswers);

    if (isLast) {
      const finalAnswers = newAnswers as DiagnosticAnswers;
      localStorage.setItem(DIAGNOSTIC_KEY, JSON.stringify(finalAnswers));
      localStorage.setItem(ONBOARDING_KEY, "true");

      // Fire-and-forget Supabase sync
      const uid = getCachedUserId();
      if (uid) saveDiagnosticToDB(uid, finalAnswers).catch(() => {});

      setLeaving(true);
      setTimeout(() => onComplete(), 400);
    } else {
      setLeaving(true);
      setTimeout(() => {
        setStep((s) => s + 1);
        setLeaving(false);
      }, 220);
    }
  };

  return (
    <div style={shell}>
      <div style={blob1} />
      <div style={blob2} />

      <div style={inner}>
        {/* Header */}
        <div style={headerRow}>
          <div style={logoMark}>Igboverse</div>
          <div style={stepCounter}>
            {step + 1} of {QUESTIONS.length}
          </div>
        </div>

        {/* Progress bar */}
        <div style={progressTrack}>
          <div
            style={{
              ...progressFill,
              width: `${progress}%`,
              transition: "width 0.4s cubic-bezier(0.4,0,0.2,1)",
            }}
          />
        </div>

        {/* Card */}
        <div
          style={{
            ...card,
            opacity: leaving ? 0 : 1,
            transform: leaving ? "translateY(14px)" : "translateY(0)",
            transition: "opacity 0.22s ease, transform 0.22s ease",
          }}
        >
          <span style={phasePill}>Diagnostic</span>

          <h2 style={questionText}>{question.text}</h2>

          {question.note && question.note}

          <div style={optionList}>
            {question.options.map((opt) => {
              const isChosen = selected === opt;
              return (
                <button
                  key={opt}
                  id={`diag-opt-${opt.replace(/\s+/g, "-").toLowerCase().slice(0, 20)}`}
                  onClick={() => setSelected(opt)}
                  style={{
                    ...optionBtn,
                    ...(isChosen ? optionBtnSelected : {}),
                  }}
                  aria-pressed={isChosen}
                >
                  <span
                    style={{
                      ...radioCircle,
                      ...(isChosen ? radioCircleSelected : {}),
                    }}
                  />
                  {opt}
                </button>
              );
            })}
          </div>

          <button
            id="diag-next-btn"
            onClick={handleNext}
            disabled={!selected}
            style={{
              ...nextBtn,
              ...(selected ? {} : nextBtnDisabled),
            }}
          >
            {isLast ? "Start Learning →" : "Next →"}
          </button>
        </div>

        <p style={footer}>
          Your answers personalise your lesson path. You can retake this later.
        </p>
      </div>
    </div>
  );
}

// ─── Remaining styles ─────────────────────────────────────────────

const shell: React.CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(145deg, #0a1628 0%, #0d2137 50%, #0a1f30 100%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  position: "relative",
  overflow: "hidden",
};

const blob1: React.CSSProperties = {
  position: "absolute",
  top: "-120px",
  right: "-80px",
  width: 400,
  height: 400,
  borderRadius: "50%",
  background:
    "radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 70%)",
  pointerEvents: "none",
};

const blob2: React.CSSProperties = {
  position: "absolute",
  bottom: "-100px",
  left: "-60px",
  width: 340,
  height: 340,
  borderRadius: "50%",
  background:
    "radial-gradient(circle, rgba(59,130,246,0.10) 0%, transparent 70%)",
  pointerEvents: "none",
};

const inner: React.CSSProperties = {
  width: "100%",
  maxWidth: 500,
  padding: "24px 20px 40px",
  zIndex: 1,
};

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 16,
};

const logoMark: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
  color: "#10b981",
  letterSpacing: "-0.5px",
};

const stepCounter: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "rgba(255,255,255,0.4)",
};

const progressTrack: React.CSSProperties = {
  height: 4,
  borderRadius: 2,
  background: "rgba(255,255,255,0.08)",
  marginBottom: 32,
  overflow: "hidden",
};

const progressFill: React.CSSProperties = {
  height: "100%",
  borderRadius: 2,
  background: "linear-gradient(90deg, #34d399, #10b981)",
};

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.035)",
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: 24,
  padding: "32px 28px",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  boxShadow:
    "0 24px 64px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
  display: "flex",
  flexDirection: "column",
  gap: 20,
};

const phasePill: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 12px",
  borderRadius: 20,
  background: "rgba(16,185,129,0.15)",
  border: "1px solid rgba(16,185,129,0.3)",
  color: "#34d399",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 1,
  textTransform: "uppercase",
  alignSelf: "flex-start",
};

const questionText: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  color: "#f1f5f9",
  margin: 0,
  lineHeight: 1.35,
};

const optionList: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const optionBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "14px 18px",
  borderRadius: 14,
  border: "1.5px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.03)",
  color: "rgba(255,255,255,0.75)",
  fontSize: 15,
  fontWeight: 500,
  cursor: "pointer",
  textAlign: "left",
  transition: "all 0.15s ease",
  fontFamily: "inherit",
};

const optionBtnSelected: React.CSSProperties = {
  border: "1.5px solid rgba(16,185,129,0.6)",
  background: "rgba(16,185,129,0.1)",
  color: "#f1f5f9",
};

const radioCircle: React.CSSProperties = {
  flexShrink: 0,
  width: 18,
  height: 18,
  borderRadius: "50%",
  border: "2px solid rgba(255,255,255,0.25)",
  transition: "all 0.15s ease",
};

const radioCircleSelected: React.CSSProperties = {
  border: "2px solid #10b981",
  background: "#10b981",
  boxShadow: "0 0 0 3px rgba(16,185,129,0.2)",
};

const nextBtn: React.CSSProperties = {
  marginTop: 4,
  padding: "15px 24px",
  borderRadius: 14,
  border: "none",
  background: "linear-gradient(135deg, #10b981, #059669)",
  color: "#fff",
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
  boxShadow: "0 4px 20px rgba(16,185,129,0.35)",
  transition: "all 0.2s ease",
  fontFamily: "inherit",
};

const nextBtnDisabled: React.CSSProperties = {
  background: "rgba(255,255,255,0.07)",
  color: "rgba(255,255,255,0.25)",
  cursor: "not-allowed",
  boxShadow: "none",
};

const footer: React.CSSProperties = {
  marginTop: 24,
  textAlign: "center",
  fontSize: 12,
  color: "rgba(255,255,255,0.3)",
  lineHeight: 1.5,
};
