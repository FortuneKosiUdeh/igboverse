"use client";
import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Home, BookOpen, Zap, Trophy, User as UserIcon, Check, X, RotateCw, ChevronRight, Lock, Book, Globe, Volume2, Settings } from 'lucide-react';
import { getUserLevel, updateStreak, getStreak, XP_PER_CORRECT_ANSWER } from '@/lib/rewards';
import { getVerbs, getStructureQuestions } from '@/lib/igbo-api';
import { progressStore } from '@/lib/persistence';
import { Verb } from '@/lib/drills/VerbDrillEngine';
import { ConjugationEngine, ConjugationState } from '@/lib/drills/ConjugationEngine';
import { StructureDrillEngine, StructureState } from '@/lib/drills/StructureDrillEngine';
import { getUser, saveUser, type User } from '@/lib/persistence/userStore';
import { addXP } from '@/lib/progressTracker';
import DialectMap from '@/components/ui/DialectMap';
import '@/components/ui/DialectMap.css';
import {
  DialectGroup,
  getSelectedDialect,
  setSelectedDialect,
  resolveDialectVariant,
  getDialectGroupLabel
} from '@/lib/dialect';


export default function IgboverseApp() {
  const [currentView, setCurrentView] = useState('home');
  const [user, setUser] = useState<User>(null);

  // XP-SYSTEM
  const [xp, setXp] = useState(0);
  const [level, setLevel] = useState(1);

  // STREAK-SYSTEM
  const [streak, setStreak] = useState(0);

  // Gating
  const [isConjugationUnlocked, setIsConjugationUnlocked] = useState(false);

  // Login/Auth State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);

  // Dialect State
  const [selectedDialectGroup, setSelectedDialectGroup] = useState<DialectGroup>('standard');

  // Drill Engines
  const drillEngine = useRef(new ConjugationEngine([]));
  const [drillState, setDrillState] = useState<ConjugationState>(drillEngine.current.getState());

  const structureEngine = useRef(new StructureDrillEngine());
  const [structureState, setStructureState] = useState<StructureState>(structureEngine.current.getState());

  const [userAnswer, setUserAnswer] = useState('');
  // For Structure Drill (Building sentence)
  const [selectedSegments, setSelectedSegments] = useState<string[]>([]);

  useEffect(() => {
    // Auth logic abstraction
    const savedUser = getUser();
    if (savedUser) {
      setUser(savedUser);
    }

    // Load dialect preference
    setSelectedDialectGroup(getSelectedDialect());

    // Load Progress (XP & Streak) via Store
    const progress = progressStore.getProgress();
    setXp(progress.xp);
    setLevel(getUserLevel(progress.xp).level);
    setStreak(progress.streak);

    // Check unlock status (Simple local storage check for prototype)
    const unlocked = localStorage.getItem('igboverse_conjugation_unlocked') === 'true';
    setIsConjugationUnlocked(unlocked);


    const fetchApiData = async () => {
      try {
        const verbsData = await getVerbs();
        drillEngine.current.updateVerbs(verbsData);
        setDrillState(drillEngine.current.getState());

        const structureData = await getStructureQuestions();
        structureEngine.current.updateQuestions(structureData);
        setStructureState(structureEngine.current.getState());
      } catch (error) {
        console.error("Failed to fetch API data:", error);
      }
    };

    fetchApiData();
    // Init structure engine
    structureEngine.current.init();
    setStructureState(structureEngine.current.getState());
  }, []);

  // --- Dialect Selection Handler ---
  const handleDialectChange = (group: DialectGroup) => {
    setSelectedDialectGroup(group);
    setSelectedDialect(group);
  };

  // --- Audio Playback ---
  const playAudio = (url: string | null | undefined) => {
    if (!url) return;
    try {
      const audio = new Audio(url);
      audio.play().catch(e => console.warn('Audio playback failed:', e));
    } catch (e) {
      console.warn('Audio error:', e);
    }
  };

  // --- Dialect-Aware Word Resolution ---
  // Returns { word, audio, label } based on the user's dialect selection
  const getDialectWord = (verb: Verb): { word: string; audio: string | null; label: string } => {
    if (selectedDialectGroup === 'standard') {
      return {
        word: verb.infinitive,
        audio: verb.audioUrl,
        label: 'Standard Igbo'
      };
    }

    const variant = resolveDialectVariant(verb.dialectVariants, selectedDialectGroup);
    if (variant) {
      return {
        word: variant.word,
        audio: variant.pronunciation || verb.audioUrl, // Fallback to standard audio
        label: `${getDialectGroupLabel(selectedDialectGroup)} — ${variant.communities.join(', ')}`
      };
    }

    // No dialect variant exists → fallback to standard (silent fallback)
    return {
      word: verb.infinitive,
      audio: verb.audioUrl,
      label: 'Standard Igbo (no dialect variant)'
    };
  };

  const handleAuth = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!email || !password) return;
    const mockUser: User = { email, id: Date.now() };
    setUser(mockUser);
    saveUser(mockUser);
    setCurrentView('home');
  };

  const handleLogout = () => {
    setUser(null);
    saveUser(null);
    setCurrentView('home');
  };

  const handleGuestLogin = () => {
    const guestUser: User = { email: 'guest@igboverse.com', id: 0 };
    setUser(guestUser);
    setCurrentView('home');
  };

  // --- CONJUGATION DRILL ---
  // Conjugation remains Standard Igbo only (verified API limitation)

  const startDrill = () => {
    if (!isConjugationUnlocked) return;
    setCurrentView('drill');
    if (!drillState.currentPrompt) {
      drillEngine.current.nextPrompt();
      setDrillState(drillEngine.current.getState());
    }
    setUserAnswer('');
  };

  const checkDrillAnswer = () => {
    if (!drillState.currentPrompt || !userAnswer.trim()) return;

    const feedback = drillEngine.current.submitAnswer(userAnswer);
    setDrillState(drillEngine.current.getState());

    if (feedback?.correct) {
      addXP(XP_PER_CORRECT_ANSWER);
      updateStreak();
      const progress = progressStore.getProgress();
      setXp(progress.xp);
      setLevel(getUserLevel(progress.xp).level);
      setStreak(progress.streak);
    }

    setTimeout(() => {
      drillEngine.current.nextPrompt();
      setDrillState(drillEngine.current.getState());
      setUserAnswer('');
    }, 2000);
  };

  // --- STRUCTURE DRILL ---
  // Structure exercises remain Standard Igbo only (verified API limitation)

  const startStructureDrill = () => {
    setCurrentView('structure');
    setSelectedSegments([]);
    setStructureState(structureEngine.current.getState());
  };

  const handleSegmentClick = (seg: string) => {
    if (selectedSegments.includes(seg)) {
      setSelectedSegments(selectedSegments.filter(s => s !== seg));
    } else {
      setSelectedSegments([...selectedSegments, seg]);
    }
  };

  const checkStructureAnswer = (answerOverride?: string) => {
    const currentQ = structureState.currentQuestion;
    if (!currentQ) return;

    let answer: string | string[] = userAnswer;
    if (currentQ.type === 'sentence-builder') {
      answer = selectedSegments;
    } else if (answerOverride) {
      answer = answerOverride;
    }

    const isCorrect = structureEngine.current.submitAnswer(answer);
    setStructureState(structureEngine.current.getState());

    if (isCorrect) {
      addXP(15);
      updateStreak();
      const progress = progressStore.getProgress();
      setXp(progress.xp);
    }

    // Unlock check
    if (structureEngine.current.getState().isComplete || structureEngine.current.getState().score >= 3) {
      if (!isConjugationUnlocked && isCorrect) {
        if (structureEngine.current.getState().score >= 3) {
          setIsConjugationUnlocked(true);
          localStorage.setItem('igboverse_conjugation_unlocked', 'true');
        }
      }
    }

    setTimeout(() => {
      structureEngine.current.nextQuestion();
      setStructureState(structureEngine.current.getState());
      setUserAnswer('');
      setSelectedSegments([]);
    }, 2000);
  };


  // ===================== VIEWS =====================

  const renderAuth = () => (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-3xl text-center text-emerald-700">Igboverse</CardTitle>
          <CardDescription className="text-center">Learn Igbo through interactive practice</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && email && password && handleAuth()}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <Button
              onClick={handleAuth}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              disabled={!email || !password}
            >
              {isLogin ? 'Login' : 'Sign Up'}
            </Button>
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-gray-500">Or continue with</span>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleGuestLogin}
            >
              <UserIcon className="mr-2 h-4 w-4" />
              Sign in as Guest
            </Button>
            <p className="text-center text-sm">
              {isLogin ? "Don't have an account? " : 'Already have an account? '}
              <Button
                variant="link"
                onClick={() => setIsLogin(!isLogin)}
                className="text-emerald-600 font-medium p-0 h-auto"
              >
                {isLogin ? 'Sign Up' : 'Login'}
              </Button>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderHome = () => (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100">
      <nav className="bg-white shadow-sm p-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-emerald-700">Igboverse</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 text-xs px-2 py-1 bg-purple-50 rounded-full text-purple-700 font-medium">
            <Globe className="w-3 h-3" />
            {getDialectGroupLabel(selectedDialectGroup)}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-orange-500">🔥</span>
            <span className="font-semibold">{streak} Days</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Trophy className="w-4 h-4 text-yellow-500" />
            <span className="font-semibold">{xp} XP (Level {level})</span>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>Logout</Button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="text-center py-8">
          <h2 className="text-4xl font-bold text-gray-800 mb-2">Nnọọ! Welcome back</h2>
          <p className="text-gray-600">Master Igbo Verb Conjugations</p>
        </div>

        {/* Dialect Map Selector */}
        <DialectMap
          selectedDialect={selectedDialectGroup}
          onSelect={handleDialectChange}
        />

        <div className="grid md:grid-cols-3 gap-4">
          {/* Structure Drill Card */}
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-l-blue-500" onClick={startStructureDrill}>
            <CardHeader>
              <Book className="w-8 h-8 text-blue-600 mb-2" />
              <CardTitle>Structure Basics</CardTitle>
              <CardDescription>Master sentence order first</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full bg-blue-600 hover:bg-blue-700">
                Start Basics <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>

          {/* Conjugation Drill Card (Gated) */}
          <Card className={`transition-shadow ${isConjugationUnlocked ? 'hover:shadow-lg cursor-pointer border-l-4 border-l-emerald-500' : 'opacity-75 bg-gray-50'}`} onClick={startDrill}>
            <CardHeader>
              <Zap className={`w-8 h-8 mb-2 ${isConjugationUnlocked ? 'text-emerald-600' : 'text-gray-400'}`} />
              <div className="flex justify-between items-center">
                <CardTitle>Conjugation</CardTitle>
                {!isConjugationUnlocked && <Lock className="w-4 h-4 text-gray-400" />}
              </div>
              <CardDescription>{isConjugationUnlocked ? "Rapid-fire drills" : "Unlock by completing Basics"}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className={`w-full ${isConjugationUnlocked ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-gray-300 cursor-not-allowed'}`} disabled={!isConjugationUnlocked}>
                {isConjugationUnlocked ? "Start Training" : "Locked"}
                {isConjugationUnlocked && <ChevronRight className="w-4 h-4 ml-2" />}
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Trophy className="w-8 h-8 text-yellow-600 mb-2" />
              <CardTitle>Progress</CardTitle>
              <CardDescription>Your stats</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Level:</span>
                  <span className="font-bold">{level}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total XP:</span>
                  <span className="font-bold">{xp}</span>
                </div>
                <div className="flex justify-between">
                  <span>Streak:</span>
                  <span className="font-bold">{streak} days</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );

  const renderDrill = () => {
    // Get dialect-aware word for display (vocabulary only — conjugation stays Standard)
    const currentVerb = drillState.currentPrompt?.verb;
    const dialectInfo = currentVerb ? getDialectWord(currentVerb) : null;

    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100">
        <nav className="bg-white shadow-sm p-4 flex justify-between items-center">
          <Button variant="ghost" onClick={() => setCurrentView('home')}>
            ← Back
          </Button>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">Score: {drillState.score}/{drillState.questionsAnswered}</span>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-orange-500">🔥</span>
              <span className="font-semibold">{drillState.streak}</span>
            </div>
            <span className="text-sm text-gray-600">XP: {xp}</span>
          </div>
        </nav>

        <div className="max-w-2xl mx-auto p-6">
          <Card className="mt-8">
            <CardHeader>
              <CardTitle className="text-2xl text-center">Conjugation Practice</CardTitle>
              <CardDescription className="text-center text-xs text-gray-400">
                Conjugation always uses Standard Igbo
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {drillState.currentPrompt && (
                <>
                  <div className="text-center p-6 bg-emerald-50 rounded-lg">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <h3 className="text-3xl font-bold text-emerald-700">{drillState.currentPrompt.promptText}</h3>
                    </div>
                    <p className="text-xl font-medium text-gray-700 mt-4">{drillState.currentPrompt.contextText}</p>

                    {/* Dialect-aware vocabulary display */}
                    {dialectInfo && selectedDialectGroup !== 'standard' && currentVerb && (
                      <div className="mt-3 pt-3 border-t border-emerald-200">
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                            {dialectInfo.label}
                          </span>
                          <span className="text-sm font-semibold text-purple-700">{dialectInfo.word}</span>
                          {dialectInfo.audio && (
                            <button
                              onClick={(e) => { e.stopPropagation(); playAudio(dialectInfo.audio); }}
                              className="p-1 rounded-full hover:bg-purple-100 transition"
                              title="Play dialect pronunciation"
                            >
                              <Volume2 className="w-4 h-4 text-purple-500" />
                            </button>
                          )}
                        </div>
                        {/* Also show standard form for comparison */}
                        <div className="flex items-center justify-center gap-2 mt-1">
                          <span className="text-xs text-gray-400">Standard:</span>
                          <span className="text-sm text-gray-500">{currentVerb.infinitive}</span>
                          {currentVerb.audioUrl && (
                            <button
                              onClick={(e) => { e.stopPropagation(); playAudio(currentVerb.audioUrl); }}
                              className="p-1 rounded-full hover:bg-gray-100 transition"
                              title="Play standard pronunciation"
                            >
                              <Volume2 className="w-3 h-3 text-gray-400" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Standard mode audio button */}
                    {selectedDialectGroup === 'standard' && currentVerb?.audioUrl && (
                      <div className="mt-3 pt-3 border-t border-emerald-200">
                        <button
                          onClick={() => playAudio(currentVerb.audioUrl)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full hover:bg-emerald-100 transition text-sm text-emerald-600"
                          title="Play pronunciation"
                        >
                          <Volume2 className="w-4 h-4" />
                          Listen
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Your answer:</label>
                    <input
                      type="text"
                      value={userAnswer}
                      onChange={(e) => setUserAnswer(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && checkDrillAnswer()}
                      className="w-full px-4 py-3 border-2 rounded-lg text-lg"
                      placeholder="Type the conjugated form (e.g. Ana m eri)"
                      disabled={drillState.feedback !== null}
                      autoFocus
                    />
                  </div>

                  {drillState.feedback && (
                    <Alert className={drillState.feedback.correct ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'}>
                      <div className="flex items-center gap-2">
                        {drillState.feedback.correct ? (
                          <Check className="w-5 h-5 text-green-600" />
                        ) : (
                          <X className="w-5 h-5 text-red-600" />
                        )}
                        <AlertDescription>
                          {drillState.feedback.correct ? (
                            <span className="text-green-700 font-medium">Correct! +{XP_PER_CORRECT_ANSWER} XP</span>
                          ) : (
                            <span className="text-red-700">
                              Incorrect. The correct answer is: <strong>{drillState.feedback.correctAnswer}</strong>
                            </span>
                          )}
                        </AlertDescription>
                      </div>
                    </Alert>
                  )}

                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                    onClick={checkDrillAnswer}
                    disabled={!userAnswer.trim() || drillState.feedback !== null}
                  >
                    Check Answer
                  </Button>
                </>
              )}
              {!drillState.currentPrompt && (
                <div className="text-center p-12">Loading drills...</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  const renderStructureDrill = () => {
    const q = structureState.currentQuestion;
    const isCorrect = structureState.feedback?.correct;

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <nav className="bg-white shadow-sm p-4 flex justify-between items-center">
          <Button variant="ghost" onClick={() => setCurrentView('home')}>← Back</Button>
          <div className="text-sm">Score: {structureState.score}</div>
        </nav>
        <div className="max-w-2xl mx-auto p-6 mt-8">
          {structureState.isComplete ? (
            <Card className="text-center p-8">
              <CardTitle className="text-2xl mb-4">Training Complete!</CardTitle>
              <p className="mb-6">You have mastered the basics.</p>
              <Button onClick={() => setCurrentView('home')}>Back to Home</Button>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Structure Training</CardTitle>
                <CardDescription>
                  {q?.type === 'sentence-builder' ? 'Arrange the words in correct order' :
                    q?.type === 'translation' ? 'Choose the correct translation' : 'Match the pronoun'}
                  <span className="block text-xs text-gray-400 mt-1">Standard Igbo</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {q && (
                  <div className="space-y-6">
                    <div className="p-4 bg-gray-100 rounded-lg text-lg font-medium text-center">
                      {q.prompt}
                    </div>

                    {q.type === 'sentence-builder' && q.segments && (
                      <div className="space-y-4">
                        <div className="flex flex-wrap gap-2 min-h-[60px] p-4 border-2 border-dashed rounded-lg bg-white items-center">
                          {selectedSegments.map((seg, i) => (
                            <Button key={i} variant="secondary" onClick={() => handleSegmentClick(seg)}>
                              {seg}
                            </Button>
                          ))}
                          {selectedSegments.length === 0 && <span className="text-gray-400 text-sm">Tap words below to build sentence...</span>}
                        </div>
                        <div className="flex flex-wrap gap-2 justify-center">
                          {q.segments.filter(s => !selectedSegments.includes(s)).map((seg, i) => (
                            <Button key={i} variant="outline" onClick={() => handleSegmentClick(seg)}>
                              {seg}
                            </Button>
                          ))}
                        </div>
                        <Button className="w-full mt-4" onClick={() => checkStructureAnswer()} disabled={structureState.feedback !== null}>
                          Check Order
                        </Button>
                      </div>
                    )}

                    {(q.type === 'translation' || q.type === 'pronoun-match') && q.options && (
                      <div className="grid grid-cols-1 gap-3">
                        {q.options.map((opt, i) => (
                          <Button
                            key={i}
                            variant="outline"
                            className="justify-start h-auto py-3 px-4 text-left"
                            onClick={() => checkStructureAnswer(opt)}
                            disabled={structureState.feedback !== null}
                          >
                            {opt}
                          </Button>
                        ))}
                      </div>
                    )}

                    {structureState.feedback && (
                      <Alert className={isCorrect ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'}>
                        <AlertDescription className={isCorrect ? 'text-green-700' : 'text-red-700'}>
                          {structureState.feedback.message}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  };

  // Main Router
  if (!user) return renderAuth();

  switch (currentView) {
    case 'drill':
      return renderDrill();
    case 'structure':
      return renderStructureDrill();
    default:
      return renderHome();
  }
}