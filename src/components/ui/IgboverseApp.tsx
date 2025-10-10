"use client";
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Home, BookOpen, Zap, Trophy, User, Volume2, Check, X, RotateCw, ChevronRight } from 'lucide-react';

// Type Definitions
type User = {
  email: string;
  id: number;
} | null;

type Verb = {
  id: number;
  infinitive: string;
  english: string;
  conjugations: {
    present: { m: string; f: string; we: string; they: string };
    past: { m: string; f: string; we: string; they: string };
    future: { m: string; f: string; we: string; they: string };
  };
};

type Flashcard = {
  id: number;
  igbo: string;
  english: string;
  type: string;
};

type Feedback = {
  correct: boolean;
  correctAnswer: string;
} | null;

type TenseKey = 'present' | 'past' | 'future';
type PronounKey = 'm' | 'f' | 'we' | 'they';

// Mock Data - In production, this comes from Supabase
const MOCK_VERBS: Verb[] = [
  {
    id: 1,
    infinitive: 'iri',
    english: 'to eat',
    conjugations: {
      present: { m: 'ana m eri', f: 'ana m eri', we: 'anyi na-eri', they: 'ha na-eri' },
      past: { m: 'e riri m', f: 'e riri m', we: 'anyi riri', they: 'ha riri' },
      future: { m: 'ga m eri', f: 'ga m eri', we: 'anyi ga-eri', they: 'ha ga-eri' }
    }
  },
  {
    id: 2,
    infinitive: 'ịgụ',
    english: 'to read',
    conjugations: {
      present: { m: 'ana m agụ', f: 'ana m agụ', we: 'anyi na-agụ', they: 'ha na-agụ' },
      past: { m: 'e gụrụ m', f: 'e gụrụ m', we: 'anyi gụrụ', they: 'ha gụrụ' },
      future: { m: 'ga m agụ', f: 'ga m agụ', we: 'anyi ga-agụ', they: 'ha ga-agụ' }
    }
  },
  {
    id: 3,
    infinitive: 'ịbịa',
    english: 'to come',
    conjugations: {
      present: { m: 'ana m abịa', f: 'ana m abịa', we: 'anyi na-abịa', they: 'ha na-abịa' },
      past: { m: 'abịara m', f: 'abịara m', we: 'anyi bịara', they: 'ha bịara' },
      future: { m: 'ga m abịa', f: 'ga m abịa', we: 'anyi ga-abịa', they: 'ha ga-abịa' }
    }
  }
];

const MOCK_FLASHCARDS: Flashcard[] = [
  { id: 1, igbo: 'nri', english: 'food', type: 'noun' },
  { id: 2, igbo: 'akwụkwọ', english: 'book', type: 'noun' },
  { id: 3, igbo: 'ụlọ', english: 'house', type: 'noun' },
  { id: 4, igbo: 'ọma', english: 'good', type: 'adjective' },
  { id: 5, igbo: 'ukwu', english: 'big', type: 'adjective' }
];

const PRONOUNS = [
  { key: 'm' as PronounKey, label: 'I (m)', igbo: 'M/Mụ' },
  { key: 'f' as PronounKey, label: 'I (f)', igbo: 'M/Mụ' },
  { key: 'we' as PronounKey, label: 'We', igbo: 'Anyị' },
  { key: 'they' as PronounKey, label: 'They', igbo: 'Ha' }
];

const TENSES = [
  { key: 'present' as TenseKey, label: 'Present' },
  { key: 'past' as TenseKey, label: 'Past' },
  { key: 'future' as TenseKey, label: 'Future' }
];

export default function IgboverseApp() {
  const [currentView, setCurrentView] = useState('home');
  const [user, setUser] = useState<User>(null);
  const [userStats, setUserStats] = useState({ xp: 0, streak: 0, accuracy: 0 });
  
  // Login/Auth State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);

  // Conjugation Drill State
  const [currentVerb, setCurrentVerb] = useState<Verb | null>(null);
  const [selectedTense, setSelectedTense] = useState<TenseKey>('present');
  const [selectedPronoun, setSelectedPronoun] = useState<PronounKey>('m');
  const [userAnswer, setUserAnswer] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [score, setScore] = useState(0);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);

  // Flashcard State
  const [currentCard, setCurrentCard] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [cardStats, setCardStats] = useState({ correct: 0, total: 0 });

  useEffect(() => {
    // Check for existing session (in production, check Supabase)
    const savedUser = localStorage.getItem('igboverse_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
      loadUserStats();
    }
  }, []);

  const loadUserStats = () => {
    const stats = localStorage.getItem('igboverse_stats');
    if (stats) {
      setUserStats(JSON.parse(stats));
    }
  };

  const saveUserStats = (newStats: typeof userStats) => {
    setUserStats(newStats);
    localStorage.setItem('igboverse_stats', JSON.stringify(newStats));
  };

  const handleAuth = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!email || !password) return;
    // In production: call Supabase Auth
    const mockUser = { email, id: Date.now() };
    setUser(mockUser);
    localStorage.setItem('igboverse_user', JSON.stringify(mockUser));
    setCurrentView('home');
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('igboverse_user');
    setCurrentView('home');
  };

  const startDrill = () => {
    setCurrentView('drill');
    loadNewQuestion();
    setScore(0);
    setQuestionsAnswered(0);
  };

  const loadNewQuestion = () => {
    const randomVerb = MOCK_VERBS[Math.floor(Math.random() * MOCK_VERBS.length)];
    const randomTense = TENSES[Math.floor(Math.random() * TENSES.length)].key;
    const randomPronoun = PRONOUNS[Math.floor(Math.random() * PRONOUNS.length)].key;
    
    setCurrentVerb(randomVerb);
    setSelectedTense(randomTense);
    setSelectedPronoun(randomPronoun);
    setUserAnswer('');
    setFeedback(null);
  };

  const checkAnswer = () => {
    if (!currentVerb || !userAnswer.trim()) return;

    const correctAnswer = currentVerb.conjugations[selectedTense][selectedPronoun];
    const isCorrect = userAnswer.trim().toLowerCase() === correctAnswer.toLowerCase();

    setFeedback({
      correct: isCorrect,
      correctAnswer: correctAnswer
    });

    if (isCorrect) {
      setScore(score + 1);
      const newXP = userStats.xp + 10;
      saveUserStats({ ...userStats, xp: newXP });
    }

    setQuestionsAnswered(questionsAnswered + 1);

    setTimeout(() => {
      loadNewQuestion();
    }, 2000);
  };

  const playAudio = (text: string) => {
    // Stub for TTS - in production, integrate Google Cloud TTS
    console.log('Playing audio for:', text);
    alert(`Audio playback for: "${text}"\n(TTS integration needed)`);
  };

  const startFlashcards = () => {
    setCurrentView('flashcards');
    setCurrentCard(0);
    setShowAnswer(false);
    setCardStats({ correct: 0, total: 0 });
  };

  const nextCard = (wasCorrect?: boolean) => {
    if (wasCorrect !== undefined) {
      setCardStats({
        correct: cardStats.correct + (wasCorrect ? 1 : 0),
        total: cardStats.total + 1
      });
    }
    
    setShowAnswer(false);
    setCurrentCard((currentCard + 1) % MOCK_FLASHCARDS.length);
  };

  // VIEWS
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
                className="w-full px-3 py-2 border rounded-md"
                onKeyPress={(e) => e.key === 'Enter' && email && password && handleAuth()}
              />
            </div>
            <Button 
              onClick={handleAuth} 
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              disabled={!email || !password}
            >
              {isLogin ? 'Login' : 'Sign Up'}
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
          <div className="flex items-center gap-2 text-sm">
            <Trophy className="w-4 h-4 text-yellow-500" />
            <span className="font-semibold">{userStats.xp} XP</span>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>Logout</Button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="text-center py-8">
          <h2 className="text-4xl font-bold text-gray-800 mb-2">Nnọọ! Welcome back</h2>
          <p className="text-gray-600">Continue your Igbo learning journey</p>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={startDrill}>
            <CardHeader>
              <Zap className="w-8 h-8 text-emerald-600 mb-2" />
              <CardTitle>Conjugation Drill</CardTitle>
              <CardDescription>Practice verb conjugations</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700">
                Start Drill <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={startFlashcards}>
            <CardHeader>
              <BookOpen className="w-8 h-8 text-blue-600 mb-2" />
              <CardTitle>Flashcards</CardTitle>
              <CardDescription>Review vocabulary</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full bg-blue-600 hover:bg-blue-700">
                Study Cards <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Trophy className="w-8 h-8 text-yellow-600 mb-2" />
              <CardTitle>Progress</CardTitle>
              <CardDescription>Your learning stats</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Total XP:</span>
                  <span className="font-bold">{userStats.xp}</span>
                </div>
                <div className="flex justify-between">
                  <span>Streak:</span>
                  <span className="font-bold">{userStats.streak} days</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );

  const renderDrill = () => (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100">
      <nav className="bg-white shadow-sm p-4 flex justify-between items-center">
        <Button variant="ghost" onClick={() => setCurrentView('home')}>
          ← Back
        </Button>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">Score: {score}/{questionsAnswered}</span>
          <span className="text-sm text-gray-600">XP: {userStats.xp}</span>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto p-6">
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Conjugation Practice</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {currentVerb && (
              <>
                <div className="text-center p-6 bg-emerald-50 rounded-lg">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <h3 className="text-3xl font-bold text-emerald-700">{currentVerb.infinitive}</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => playAudio(currentVerb.infinitive)}
                    >
                      <Volume2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-gray-600">({currentVerb.english})</p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-600">Conjugate in:</p>
                  <div className="flex gap-2 flex-wrap">
                    <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                      {TENSES.find(t => t.key === selectedTense)?.label}
                    </span>
                    <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
                      {PRONOUNS.find(p => p.key === selectedPronoun)?.label}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Your answer:</label>
                  <input
                    type="text"
                    value={userAnswer}
                    onChange={(e) => setUserAnswer(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && checkAnswer()}
                    className="w-full px-4 py-3 border-2 rounded-lg text-lg"
                    placeholder="Type the conjugated form..."
                    disabled={feedback !== null}
                  />
                </div>

                {feedback && (
                  <Alert className={feedback.correct ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'}>
                    <div className="flex items-center gap-2">
                      {feedback.correct ? (
                        <Check className="w-5 h-5 text-green-600" />
                      ) : (
                        <X className="w-5 h-5 text-red-600" />
                      )}
                      <AlertDescription>
                        {feedback.correct ? (
                          <span className="text-green-700 font-medium">Correct! +10 XP</span>
                        ) : (
                          <span className="text-red-700">
                            Incorrect. The correct answer is: <strong>{feedback.correctAnswer}</strong>
                          </span>
                        )}
                      </AlertDescription>
                    </div>
                  </Alert>
                )}

                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  onClick={checkAnswer}
                  disabled={!userAnswer.trim() || feedback !== null}
                >
                  Check Answer
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderFlashcards = () => {
    const card = MOCK_FLASHCARDS[currentCard];
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <nav className="bg-white shadow-sm p-4 flex justify-between items-center">
          <Button variant="ghost" onClick={() => setCurrentView('home')}>
            ← Back
          </Button>
          <div className="text-sm">
            Card {currentCard + 1} / {MOCK_FLASHCARDS.length}
          </div>
          <div className="text-sm text-gray-600">
            {cardStats.correct}/{cardStats.total} correct
          </div>
        </nav>

        <div className="max-w-2xl mx-auto p-6 flex items-center justify-center" style={{ minHeight: 'calc(100vh - 80px)' }}>
          <Card className="w-full">
            <CardContent className="p-8">
              <div
                className="text-center cursor-pointer p-12 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-lg min-h-[300px] flex flex-col items-center justify-center"
                onClick={() => setShowAnswer(!showAnswer)}
              >
                {!showAnswer ? (
                  <>
                    <div className="flex items-center justify-center gap-2 mb-4">
                      <h3 className="text-4xl font-bold text-indigo-700">{card.igbo}</h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          playAudio(card.igbo);
                        }}
                      >
                        <Volume2 className="w-5 h-5" />
                      </Button>
                    </div>
                    <p className="text-gray-500 text-sm uppercase tracking-wide">{card.type}</p>
                    <p className="text-gray-400 text-sm mt-4">Click to reveal</p>
                  </>
                ) : (
                  <>
                    <h3 className="text-4xl font-bold text-gray-800 mb-2">{card.english}</h3>
                    <p className="text-gray-500 text-lg">{card.igbo}</p>
                  </>
                )}
              </div>

              {showAnswer && (
                <div className="mt-6 flex gap-4">
                  <Button
                    className="flex-1 bg-red-500 hover:bg-red-600"
                    onClick={() => nextCard(false)}
                  >
                    <X className="w-4 h-4 mr-2" />
                    Need Practice
                  </Button>
                  <Button
                    className="flex-1 bg-green-500 hover:bg-green-600"
                    onClick={() => nextCard(true)}
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Got It!
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  // Main Router
  if (!user) return renderAuth();
  
  switch (currentView) {
    case 'drill':
      return renderDrill();
    case 'flashcards':
      return renderFlashcards();
    default:
      return renderHome();
  }
}