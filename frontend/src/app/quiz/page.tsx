'use client';
// ============================================================
// EdCap — Daily Quiz Page (Students)
// ============================================================
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import AppShell from '@/components/AppShell';
import Topbar from '@/components/Topbar';
import { quizzesApi, attemptsApi, type QuizSet, type QuizAttempt } from '@/lib/api';

const OPTIONS = ['A', 'B', 'C', 'D'] as const;

export default function QuizPage() {
  const { user } = useAuth();
  const [quiz, setQuiz] = useState<QuizSet | null>(null);
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [score, setScore] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    quizzesApi.today()
      .then(setQuiz)
      .catch(() => setError('No quiz available for today. Check back later!'))
      .finally(() => setLoading(false));
  }, []);

  const startQuiz = async () => {
    if (!quiz) return;
    setStarting(true);
    try {
      const a = await attemptsApi.start(quiz.id);
      setAttempt(a);
    } catch {
      setError('Failed to start quiz. Please try again.');
    } finally {
      setStarting(false);
    }
  };

  const selectOption = async (questionId: string, option: string) => {
    if (!attempt || submitted[questionId]) return;
    setAnswers(prev => ({ ...prev, [questionId]: option }));

    // Submit answer immediately
    try {
      await attemptsApi.submitAnswer(attempt.id, {
        question_id: questionId,
        chosen_option: option,
      });
      setSubmitted(prev => ({ ...prev, [questionId]: true }));
    } catch {
      // soft fail
    }
  };

  const finishQuiz = async () => {
    if (!attempt) return;
    setCompleting(true);
    try {
      const result = await attemptsApi.complete(attempt.id);
      // Calculate local score from quiz data
      if (quiz) {
        let correct = 0;
        quiz.questions.forEach(q => {
          if (answers[q.id] === q.correct_option) correct++;
        });
        setScore(correct);
      }
      setCompleted(true);
    } catch {
      setError('Failed to submit quiz.');
    } finally {
      setCompleting(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <Topbar breadcrumb="Student" current="Daily Quiz" />
        <div className="app-content loading-center"><div className="spinner" /></div>
      </AppShell>
    );
  }

  // Completed screen
  if (completed && quiz) {
    const total = quiz.questions.length;
    const pct = Math.round((score / total) * 100);
    return (
      <AppShell>
        <Topbar breadcrumb="Student" current="Quiz Results" />
        <div className="app-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '70vh' }}>
          <div className="card card-padding" style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>
              {pct >= 80 ? '🎉' : pct >= 60 ? '👍' : '📚'}
            </div>
            <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
              {pct >= 80 ? 'Excellent!' : pct >= 60 ? 'Good Job!' : 'Keep Practicing!'}
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
              You answered {score} out of {total} questions correctly.
            </p>

            <div style={{
              fontSize: 56, fontWeight: 800, marginBottom: 8,
              color: pct >= 80 ? 'hsl(145,65%,55%)' : pct >= 60 ? 'hsl(35,90%,65%)' : 'hsl(355,75%,65%)',
            }}>
              {pct}%
            </div>

            <div className="progress-bar" style={{ marginBottom: 24 }}>
              <div
                className="progress-fill"
                style={{
                  width: `${pct}%`,
                  background: pct >= 80
                    ? 'linear-gradient(90deg,hsl(145,65%,45%),var(--accent-400))'
                    : pct >= 60
                    ? 'linear-gradient(90deg,hsl(40,90%,55%),hsl(145,65%,45%))'
                    : 'linear-gradient(90deg,hsl(355,75%,55%),hsl(35,90%,55%))',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <a href="/dashboard" className="btn btn-secondary btn-full">Back to Dashboard</a>
              <a href="/progress" className="btn btn-primary btn-full">View Progress →</a>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // Error / no quiz screen
  if (error || !quiz) {
    return (
      <AppShell>
        <Topbar breadcrumb="Student" current="Daily Quiz" />
        <div className="app-content">
          <div className="card card-padding" style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🧪</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>No Quiz Today</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              {error || 'Your faculty hasn\'t published today\'s quiz yet. Check back later!'}
            </p>
            <a href="/dashboard" className="btn btn-secondary" style={{ marginTop: 20, display: 'inline-flex' }}>
              ← Back to Dashboard
            </a>
          </div>
        </div>
      </AppShell>
    );
  }

  // Pre-start screen
  if (!attempt) {
    return (
      <AppShell>
        <Topbar breadcrumb="Student" current="Daily Quiz" />
        <div className="app-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '70vh' }}>
          <div className="card card-padding" style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🧪</div>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Today&apos;s Quiz</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
              {quiz.questions.length} questions · {quiz.date}
            </p>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
              <div className="badge badge-blue">📝 {quiz.questions.length} Questions</div>
              <div className="badge badge-teal">⏱️ ~15 minutes</div>
              <div className={`badge ${quiz.status === 'live' ? 'badge-green' : 'badge-orange'}`}>
                {quiz.status.toUpperCase()}
              </div>
            </div>

            <ul style={{ textAlign: 'left', color: 'var(--text-secondary)', fontSize: 13, marginBottom: 24, paddingLeft: 20, lineHeight: 2 }}>
              <li>Answer each question to the best of your ability</li>
              <li>Your answers are saved automatically</li>
              <li>Review explanations after submitting</li>
            </ul>

            <button
              id="btn-start-quiz"
              className="btn btn-primary btn-lg btn-full"
              onClick={startQuiz}
              disabled={starting}
            >
              {starting
                ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Starting…</>
                : '🚀 Start Quiz'}
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  // Quiz in progress
  const q = quiz.questions[currentQ];
  const total = quiz.questions.length;
  const answeredCount = Object.keys(answers).length;
  const isAnswered = !!answers[q.id];

  const optionText = (opt: string) => {
    const map: Record<string, string> = {
      A: q.option_a,
      B: q.option_b,
      C: q.option_c,
      D: q.option_d,
    };
    return map[opt] ?? '';
  };

  const optionClass = (opt: string) => {
    if (!isAnswered) return answers[q.id] === opt ? 'quiz-option selected' : 'quiz-option';
    if (submitted[q.id]) {
      if (opt === q.correct_option) return 'quiz-option correct';
      if (opt === answers[q.id] && opt !== q.correct_option) return 'quiz-option incorrect';
    }
    return 'quiz-option';
  };

  return (
    <AppShell>
      <Topbar breadcrumb="Student" current="Daily Quiz" />
      <div className="app-content">
        {/* Progress bar */}
        <div style={{ marginBottom: 24 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Question {currentQ + 1} of {total}
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {answeredCount} answered
            </span>
          </div>
          <div
            className="progress-bar"
            role="progressbar"
            aria-valuenow={Math.round(((currentQ) / total) * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Quiz progress: question ${currentQ + 1} of ${total}`}
          >
            <div className="progress-fill" style={{ width: `${((currentQ) / total) * 100}%` }} />
          </div>
        </div>

        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          {/* Question card */}
          <div className="card card-padding mb-6">
            <div className="flex items-center justify-between mb-4" style={{ marginBottom: 16 }}>
              <span className="badge badge-blue">{q.difficulty || 'medium'}</span>
              <span className="text-muted text-sm">Q{currentQ + 1}</span>
            </div>
            <p style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.6, marginBottom: 20 }}>
              {q.question_text}
            </p>

            {/* Options */}
            <div role="radiogroup" aria-label="Answer options" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {OPTIONS.map(opt => (
                <button
                  key={opt}
                  role="radio"
                  aria-checked={answers[q.id] === opt}
                  aria-label={`Option ${opt}: ${optionText(opt)}`}
                  className={optionClass(opt)}
                  onClick={() => selectOption(q.id, opt)}
                  disabled={!!submitted[q.id]}
                >
                  <div className="quiz-option-marker">{opt}</div>
                  <span style={{ flex: 1, textAlign: 'left' }}>{optionText(opt)}</span>
                  {submitted[q.id] && opt === q.correct_option && <span aria-hidden="true">✅</span>}
                  {submitted[q.id] && opt === answers[q.id] && opt !== q.correct_option && <span aria-hidden="true">❌</span>}
                </button>
              ))}
            </div>

            {/* Explanation */}
            {submitted[q.id] && q.explanation && (
              <div style={{
                marginTop: 16, padding: '12px 16px',
                background: 'rgba(45,200,170,0.08)',
                border: '1px solid rgba(45,200,170,0.20)',
                borderRadius: 'var(--radius-md)',
                fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6,
              }}>
                💡 <strong>Explanation:</strong> {q.explanation}
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              className="btn btn-secondary"
              onClick={() => setCurrentQ(v => Math.max(0, v - 1))}
              disabled={currentQ === 0}
              aria-label="Previous question"
            >
              ← Previous
            </button>

            {currentQ < total - 1 ? (
              <button
                className="btn btn-primary"
                onClick={() => setCurrentQ(v => v + 1)}
                aria-label="Next question"
              >
                Next →
              </button>
            ) : (
              <button
                id="btn-finish-quiz"
                className="btn btn-primary"
                onClick={finishQuiz}
                disabled={completing}
                aria-busy={completing}
              >
                {completing
                  ? <><span className="spinner" role="status" aria-label="Submitting quiz" style={{ width: 16, height: 16 }} /> Submitting…</>
                  : '🏁 Finish Quiz'}
              </button>
            )}
          </div>

          {/* Question dots navigation */}
          <div
            role="group"
            aria-label="Question selector"
            style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 20, justifyContent: 'center' }}
          >
            {quiz.questions.map((question, i) => (
              <button
                key={question.id}
                onClick={() => setCurrentQ(i)}
                aria-label={`Jump to question ${i + 1}${answers[question.id] ? ' (answered)' : ''}`}
                aria-current={i === currentQ ? 'true' : undefined}
                style={{
                  width: 30, height: 30,
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: i === currentQ
                    ? 'var(--brand-500)'
                    : answers[question.id]
                    ? 'rgba(60,180,100,0.20)'
                    : 'var(--bg-overlay)',
                  color: i === currentQ ? '#fff' : answers[question.id] ? 'hsl(145,65%,55%)' : 'var(--text-muted)',
                  fontSize: 12, fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
