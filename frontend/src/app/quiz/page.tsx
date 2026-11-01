'use client';
// ============================================================
// EdCap — Online Examination & Testing System (/quiz)
// Dual-Pane Live Assessment Workspace (Zero Emoji, Pure SVG Icons)
// ============================================================
import { useEffect, useState, useCallback, useRef } from 'react';
import AppShell from '@/components/AppShell';
import Topbar from '@/components/Topbar';
import TimerHeader, { formatCountdown } from '@/components/exam/TimerHeader';
import ChoiceOption from '@/components/exam/ChoiceOption';
import QuestionPalette, { type PaletteQuestionItem, type QuestionVisitStatus } from '@/components/exam/QuestionPalette';
import ExamModal from '@/components/exam/ExamModal';
import StatCard from '@/components/exam/StatCard';
import Icon, { IconTile } from '@/components/ui/Icon';
import { quizzesApi, attemptsApi, type QuizSet, type QuizAttempt } from '@/lib/api';

const OPTIONS = ['A', 'B', 'C', 'D'] as const;

interface ExamQuestion {
  id: string;
  question_text: string;
  code_snippet?: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  explanation?: string;
  difficulty?: string;
  topic_tag?: string;
}

const BUILTIN_EXAM_QUESTIONS: ExamQuestion[] = [
  {
    id: 'q-1',
    topic_tag: 'Arrays & Memory',
    difficulty: 'Easy',
    question_text: 'What is the time complexity of accessing an element by index in a contiguous 1D array of size n?',
    code_snippet: 'int val = arr[k]; // 0 <= k < n',
    option_a: 'O(1) — Constant time via base address + offset arithmetic',
    option_b: 'O(log n) — Binary offset lookup',
    option_c: 'O(n) — Linear traversal from index 0',
    option_d: 'O(n log n) — Cache-line scan',
    correct_option: 'A',
    explanation: 'Arrays occupy contiguous memory. The address of arr[k] is computed directly as base_addr + k * sizeof(element) in O(1) time.',
  },
  {
    id: 'q-2',
    topic_tag: 'Pointers & Memory',
    difficulty: 'Medium',
    question_text: 'Consider the following C snippet on a system where sizeof(int) == 4 bytes. What does the expression *(p + 2) evaluate to?',
    code_snippet: 'int nums[5] = {10, 20, 30, 40, 50};\nint *p = &nums[1];\nint result = *(p + 2);',
    option_a: '20',
    option_b: '30',
    option_c: '40',
    option_d: '50',
    correct_option: 'C',
    explanation: 'Pointer p points to nums[1] (value 20). Adding 2 advances p by two int elements to nums[3], which stores 40.',
  },
  {
    id: 'q-3',
    topic_tag: 'Recursion & Call Stack',
    difficulty: 'Medium',
    question_text: 'What happens when a recursive function is invoked without a reachable base case?',
    code_snippet: 'int mystery(int n) {\n    return n + mystery(n - 1);\n}',
    option_a: 'The compiler automatically converts it into a while loop',
    option_b: 'Stack frames accumulate until the call stack overflows (Segmentation Fault / StackOverflowError)',
    option_c: 'It returns 0 when integer underflow occurs',
    option_d: 'Memory is allocated exclusively on the heap without limit',
    correct_option: 'B',
    explanation: 'Each recursive call pushes a new activation record onto the call stack. Without a terminating base case, stack memory is exhausted.',
  },
  {
    id: 'q-4',
    topic_tag: 'Searching & Sorting',
    difficulty: 'Easy',
    question_text: 'Which precondition MUST be satisfied before applying Binary Search on an array?',
    option_a: 'All elements must be strictly positive integers',
    option_b: 'The array length must be a power of 2',
    option_c: 'The array must be sorted in monotonic order',
    option_d: 'The array must contain no duplicate values',
    correct_option: 'C',
    explanation: 'Binary search relies on order comparison at the midpoint to discard half of the remaining search space at each step.',
  },
  {
    id: 'q-5',
    topic_tag: 'Searching & Sorting',
    difficulty: 'Medium',
    question_text: 'What is the worst-case time complexity of Merge Sort on an array of n elements, and how much auxiliary space does standard Merge Sort require?',
    option_a: 'O(n log n) time, O(n) auxiliary space',
    option_b: 'O(n²) time, O(1) auxiliary space',
    option_c: 'O(n log n) time, O(1) auxiliary space',
    option_d: 'O(n) time, O(log n) auxiliary space',
    correct_option: 'A',
    explanation: 'Merge Sort divides the array in log₂(n) levels and merges in O(n) per level using an O(n) temporary buffer.',
  },
  {
    id: 'q-6',
    topic_tag: 'Linked Lists',
    difficulty: 'Medium',
    question_text: 'Which sequence of pointer updates safely inserts a new node `newNode` immediately after node `prev` in a singly linked list?',
    code_snippet: 'struct Node { int data; struct Node *next; };',
    option_a: 'prev->next = newNode; newNode->next = prev->next;',
    option_b: 'newNode->next = prev->next; prev->next = newNode;',
    option_c: 'newNode->next = prev; prev->next = NULL;',
    option_d: 'prev = newNode->next; newNode->next = prev;',
    correct_option: 'B',
    explanation: 'You must first preserve the link to the rest of the list (newNode->next = prev->next) before overwriting prev->next.',
  },
  {
    id: 'q-7',
    topic_tag: 'Stacks & Queues',
    difficulty: 'Easy',
    question_text: 'Which data structure is used by Breadth-First Search (BFS) to traverse a graph level by level?',
    option_a: 'LIFO Stack',
    option_b: 'FIFO Queue',
    option_c: 'Binary Search Tree',
    option_d: 'Disjoint Set Union',
    correct_option: 'B',
    explanation: 'A First-In-First-Out (FIFO) queue ensures vertices at distance d are processed before vertices at distance d + 1.',
  },
  {
    id: 'q-8',
    topic_tag: 'Trees & Graphs',
    difficulty: 'Medium',
    question_text: 'Which traversal of a Binary Search Tree (BST) visits the keys in non-decreasing sorted order?',
    option_a: 'Pre-order traversal (Root, Left, Right)',
    option_b: 'Post-order traversal (Left, Right, Root)',
    option_c: 'In-order traversal (Left, Root, Right)',
    option_d: 'Level-order traversal',
    correct_option: 'C',
    explanation: 'In a BST, all keys in the left subtree are <= root, and all keys in the right subtree are >= root, so Left -> Root -> Right yields sorted order.',
  },
  {
    id: 'q-9',
    topic_tag: 'Hashing',
    difficulty: 'Medium',
    question_text: 'If two distinct keys k1 != k2 produce the same hash bucket index h(k1) == h(k2), what is this phenomenon called?',
    option_a: 'Hash Collision',
    option_b: 'Stack Underflow',
    option_c: 'Deadlock',
    option_d: 'Page Fault',
    correct_option: 'A',
    explanation: 'When a hash function maps two distinct keys to the same bucket index, it causes a collision resolved via chaining or open addressing.',
  },
  {
    id: 'q-10',
    topic_tag: 'Dynamic Programming',
    difficulty: 'Hard',
    question_text: 'What are the two fundamental properties a problem must exhibit for Dynamic Programming to be effective?',
    option_a: 'Greedy Choice Property and Amortized Constant Time',
    option_b: 'Optimal Substructure and Overlapping Subproblems',
    option_c: 'Tail Recursion and Contiguous Allocation',
    option_d: 'Bipartite Graph Structure and Topological Ordering',
    correct_option: 'B',
    explanation: 'Dynamic Programming caches solutions to overlapping subproblems and combines optimal sub-solutions via optimal substructure.',
  },
];

export default function QuizPage() {
  const [quiz, setQuiz] = useState<QuizSet | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[]>(BUILTIN_EXAM_QUESTIONS);
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [examStarted, setExamStarted] = useState(false);

  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, 'A' | 'B' | 'C' | 'D'>>({});
  const [visitedIds, setVisitedIds] = useState<Set<string>>(new Set());
  const [reviewIds, setReviewIds] = useState<Set<string>>(new Set());

  const EXAM_DURATION_SECONDS = 20 * 60;
  const [secondsLeft, setSecondsLeft] = useState<number>(EXAM_DURATION_SECONDS);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [score, setScore] = useState(0);
  const [timeTakenSec, setTimeTakenSec] = useState(0);

  const autoSubmittedRef = useRef(false);

  useEffect(() => {
    quizzesApi
      .today()
      .then(data => {
        setQuiz(data);
        if (data?.questions && data.questions.length > 0) {
          setQuestions(
            data.questions.map((q, idx) => ({
              id: q.id,
              question_text: q.question_text,
              option_a: q.option_a,
              option_b: q.option_b,
              option_c: q.option_c,
              option_d: q.option_d,
              correct_option: (q.correct_option || 'A').toUpperCase(),
              explanation: q.explanation || 'Review the corresponding lecture module for a step-by-step derivation.',
              difficulty: q.difficulty || (idx % 3 === 0 ? 'Easy' : idx % 3 === 1 ? 'Medium' : 'Hard'),
              topic_tag: 'Core Syllabus',
            }))
          );
        }
      })
      .catch(() => {
        // Fallback to BUILTIN_EXAM_QUESTIONS
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (examStarted && questions[currentQ]) {
      const qId = questions[currentQ].id;
      setVisitedIds(prev => {
        if (prev.has(qId)) return prev;
        const next = new Set(prev);
        next.add(qId);
        return next;
      });
    }
  }, [currentQ, examStarted, questions]);

  const finalizeExam = useCallback(async () => {
    setCompleting(true);
    setShowSubmitModal(false);

    if (attempt) {
      try {
        await attemptsApi.complete(attempt.id);
      } catch {
        // Continue to client diagnostic summary
      }
    }

    let correct = 0;
    questions.forEach(q => {
      const chosen = answers[q.id];
      const expected = (q.correct_option || 'A').toUpperCase();
      if (chosen && chosen === expected) {
        correct++;
      }
    });

    setScore(correct);
    setTimeTakenSec(EXAM_DURATION_SECONDS - secondsLeft);
    setCompleted(true);
    setCompleting(false);
  }, [attempt, questions, answers, secondsLeft, EXAM_DURATION_SECONDS]);

  useEffect(() => {
    if (!examStarted || completed) return;

    const interval = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          if (!autoSubmittedRef.current) {
            autoSubmittedRef.current = true;
            finalizeExam();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [examStarted, completed, finalizeExam]);

  const handleStartExam = async () => {
    setStarting(true);
    if (quiz?.id) {
      try {
        const startedAttempt = await attemptsApi.start(quiz.id);
        setAttempt(startedAttempt);
      } catch {
        // Proceed in local interactive mode
      }
    }
    setVisitedIds(new Set([questions[0]?.id].filter(Boolean)));
    setSecondsLeft(EXAM_DURATION_SECONDS);
    autoSubmittedRef.current = false;
    setExamStarted(true);
    setStarting(false);
  };

  const handleSelectOption = async (questionId: string, optionKey: 'A' | 'B' | 'C' | 'D') => {
    setAnswers(prev => ({ ...prev, [questionId]: optionKey }));

    if (attempt?.id) {
      try {
        await attemptsApi.submitAnswer(attempt.id, {
          question_id: questionId,
          chosen_option: optionKey,
        });
      } catch {
        // Non-blocking sync
      }
    }
  };

  const handleClearResponse = (questionId: string) => {
    setAnswers(prev => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  };

  const handleToggleFlag = (questionId: string) => {
    setReviewIds(prev => {
      const next = new Set(prev);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });
  };

  const handleSaveAndNext = () => {
    if (currentQ < questions.length - 1) {
      setCurrentQ(v => v + 1);
    } else {
      setShowSubmitModal(true);
    }
  };

  const paletteItems: PaletteQuestionItem[] = questions.map((q, index) => {
    const isAnswered = !!answers[q.id];
    const isFlagged = reviewIds.has(q.id);
    const isVisited = visitedIds.has(q.id);

    let status: QuestionVisitStatus = 'not_visited';
    if (isFlagged) {
      status = 'review';
    } else if (isAnswered) {
      status = 'answered';
    } else if (isVisited) {
      status = 'visited_unanswered';
    }

    return { id: q.id, index, status };
  });

  const answeredCount = Object.keys(answers).length;
  const reviewCount = reviewIds.size;
  const visitedUnansweredCount = paletteItems.filter(i => i.status === 'visited_unanswered').length;
  const notVisitedCount = paletteItems.filter(i => i.status === 'not_visited').length;

  if (loading) {
    return (
      <AppShell>
        <Topbar breadcrumb="Assessment" current="Online Exam Room" />
        <div className="app-content loading-center">
          <div className="spinner" role="status" aria-label="Loading examination workspace" />
        </div>
      </AppShell>
    );
  }

  // ── 1. POST-SUBMISSION DIAGNOSTIC REPORT VIEW ─────────────────────────────
  if (completed) {
    const total = questions.length;
    const pct = total > 0 ? Math.round((score / total) * 100) : 0;

    return (
      <AppShell>
        <Topbar breadcrumb="Assessment" current="Examination Diagnostic Report" />
        <div className="app-content">
          <div className="hero mb-6">
            <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 16 }}>
              <div>
                <span className={`badge ${pct >= 75 ? 'badge-green' : pct >= 50 ? 'badge-orange' : 'badge-red'}`}>
                  <Icon name={pct >= 75 ? 'checkCircle' : 'alert'} size={13} />
                  <span>{pct >= 75 ? 'Mastery Achieved' : pct >= 50 ? 'Developing Competency' : 'Remedial Support Recommended'}</span>
                </span>
                <h1 className="page-title" style={{ marginTop: 10 }}>
                  Examination Completed — {pct}% Score
                </h1>
                <p className="page-subtitle">
                  You answered {score} of {total} questions correctly in {formatCountdown(timeTakenSec)}.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setCompleted(false);
                    setExamStarted(false);
                    setAnswers({});
                    setReviewIds(new Set());
                    setVisitedIds(new Set());
                    setCurrentQ(0);
                  }}
                >
                  <Icon name="refresh" size={15} />
                  <span>Retake Practice Exam</span>
                </button>
                <a href="/dashboard" className="btn btn-primary">
                  <span>Back to Portal</span>
                  <Icon name="arrowRight" size={15} />
                </a>
              </div>
            </div>
          </div>

          <div className="grid-4 mb-6">
            <StatCard
              label="Final Score Percentage"
              value={`${pct}%`}
              subtext={`${score} / ${total} Correct`}
              icon="target"
              accentColor={pct >= 75 ? 'emerald' : pct >= 50 ? 'amber' : 'rose'}
            />
            <StatCard
              label="Questions Answered"
              value={`${answeredCount} / ${total}`}
              subtext={`${total - answeredCount} Skipped`}
              icon="assessments"
              accentColor="indigo"
            />
            <StatCard
              label="Time Elapsed"
              value={formatCountdown(timeTakenSec)}
              subtext="Out of 20:00 allotted"
              icon="clock"
              accentColor="blue"
            />
            <StatCard
              label="Flagged for Review"
              value={reviewCount}
              subtext="Bookmarked during test"
              icon="flag"
              accentColor="amber"
            />
          </div>

          <div className="card card-padding">
            <div className="section-header">
              <div>
                <h2 className="section-title">
                  <Icon name="assessments" size={18} style={{ color: 'var(--tint-indigo-fg)' }} />
                  <span>Detailed Question Review & Concept Explanations</span>
                </h2>
                <p className="section-subtitle">
                  Review your selected answers alongside the verified solution key
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {questions.map((q, idx) => {
                const chosen = answers[q.id];
                const expected = (q.correct_option || 'A').toUpperCase() as 'A' | 'B' | 'C' | 'D';
                const isCorrect = chosen === expected;

                const optMap: Record<'A' | 'B' | 'C' | 'D', string> = {
                  A: q.option_a,
                  B: q.option_b,
                  C: q.option_c,
                  D: q.option_d,
                };

                return (
                  <div
                    key={q.id}
                    className="subcard"
                    style={{
                      padding: 20,
                      borderLeft: `3px solid ${isCorrect ? 'var(--emerald)' : 'var(--rose)'}`,
                    }}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <span className="badge badge-gray">Q{idx + 1}</span>
                        {q.topic_tag && <span className="badge badge-blue">{q.topic_tag}</span>}
                      </div>
                      <span className={`badge ${isCorrect ? 'badge-green' : 'badge-red'}`}>
                        <Icon name={isCorrect ? 'check' : 'x'} size={12} />
                        <span>{isCorrect ? 'Correct (+1)' : chosen ? `Incorrect (Chose ${chosen})` : 'Unanswered'}</span>
                      </span>
                    </div>

                    <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
                      {q.question_text}
                    </p>

                    {q.code_snippet && (
                      <pre className="exam-code-block">
                        <code>{q.code_snippet}</code>
                      </pre>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 12 }}>
                      {OPTIONS.map(opt => {
                        const isRight = opt === expected;
                        const isWrongChoice = opt === chosen && !isRight;
                        return (
                          <div
                            key={opt}
                            style={{
                              padding: '10px 12px',
                              borderRadius: 8,
                              fontSize: 13,
                              fontWeight: isRight || isWrongChoice ? 700 : 500,
                              border: '1px solid',
                              borderColor: isRight ? 'var(--emerald)' : isWrongChoice ? 'var(--rose)' : 'var(--border)',
                              background: isRight
                                ? 'var(--tint-emerald-bg)'
                                : isWrongChoice
                                ? 'var(--tint-rose-bg)'
                                : 'var(--bg-surface)',
                              color: 'var(--text-primary)',
                            }}
                          >
                            <strong>{opt}.</strong> {optMap[opt]}
                          </div>
                        );
                      })}
                    </div>

                    {q.explanation && (
                      <div className="callout callout-info">
                        <Icon name="lightbulb" size={16} />
                        <div>
                          <strong>Explanation:</strong> {q.explanation}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // ── 2. PRE-EXAM LOBBY / INSTRUCTIONS SCREEN ───────────────────────────────
  if (!examStarted) {
    return (
      <AppShell>
        <Topbar breadcrumb="Assessment" current="Online Examination Lobby" />
        <div className="app-content">
          <div style={{ maxWidth: 840, margin: '12px auto' }}>
            <div className="card card-padding">
              <div className="flex items-center justify-between mb-4" style={{ flexWrap: 'wrap', gap: 12 }}>
                <div className="flex items-center gap-2">
                  <span className="badge badge-blue">CS101 / CS204</span>
                  <span className="badge badge-teal badge-dot">Proctored Diagnostic Mode</span>
                </div>
                <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  Session ID: EXAM-{new Date().toISOString().slice(0, 10)}
                </span>
              </div>

              <div className="flex items-center gap-3 mb-4">
                <IconTile name="exam" tone="indigo" size={46} />
                <div>
                  <h1 className="page-title" style={{ fontSize: 22 }}>
                    Data Structures, Algorithms & Core Computing Assessment
                  </h1>
                  <p className="page-subtitle">
                    Adaptive competency evaluation used to measure syllabus mastery and personalize your study plan.
                  </p>
                </div>
              </div>

              <div className="grid-4 mb-6">
                <div className="subcard">
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>
                    {questions.length}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                    Total Questions
                  </div>
                </div>

                <div className="subcard">
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--success)' }}>20 Mins</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                    Time Allotted
                  </div>
                </div>

                <div className="subcard">
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--tint-indigo-fg)' }}>+1 / 0</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                    Marking Scheme
                  </div>
                </div>

                <div className="subcard">
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--warning)' }}>65%</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                    Mastery Benchmark
                  </div>
                </div>
              </div>

              <div className="subcard mb-6" style={{ padding: 20 }}>
                <h2 className="flex items-center gap-2" style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 10 }}>
                  <Icon name="shield" size={16} style={{ color: 'var(--tint-indigo-fg)' }} />
                  <span>Examination Workspace Instructions</span>
                </h2>
                <ul style={{ paddingLeft: 20, fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.85 }}>
                  <li>
                    <strong>Question Palette (Right Sidebar):</strong> Tracks real-time status for every question —{' '}
                    <span style={{ color: 'var(--success)', fontWeight: 700 }}>Answered</span>,{' '}
                    <span style={{ color: 'var(--tint-violet-fg)', fontWeight: 700 }}>Marked for Review</span>,{' '}
                    <span style={{ color: 'var(--danger)', fontWeight: 700 }}>Visited / Unanswered</span>, and{' '}
                    <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>Not Visited</span>.
                  </li>
                  <li>
                    <strong>Sticky Countdown Timer:</strong> Transitions from Emerald to Amber under 10 minutes and pulses Rose under 5 minutes. Auto-submits at <code>00:00</code>.
                  </li>
                  <li>
                    <strong>Review Flags:</strong> Use <em>Mark for Review</em> to bookmark any question you want to revisit before final submission.
                  </li>
                </ul>
              </div>

              <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 12 }}>
                <a href="/dashboard" className="btn btn-secondary">
                  <Icon name="arrowLeft" size={15} />
                  <span>Return to Dashboard</span>
                </a>
                <button
                  id="btn-start-quiz"
                  type="button"
                  onClick={handleStartExam}
                  disabled={starting}
                  className="btn btn-primary btn-lg"
                >
                  <Icon name="rocket" size={17} />
                  <span>{starting ? 'Initializing Workspace…' : 'Enter Exam Room & Start Timer'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // ── 3. ACTIVE DUAL-PANE EXAMINATION WORKSPACE ─────────────────────────────
  const q = questions[currentQ];
  const total = questions.length;
  const selectedOpt = answers[q.id];
  const isCurrentFlagged = reviewIds.has(q.id);

  const optionMap: Record<'A' | 'B' | 'C' | 'D', string> = {
    A: q.option_a,
    B: q.option_b,
    C: q.option_c,
    D: q.option_d,
  };

  return (
    <AppShell>
      <TimerHeader
        title="Data Structures & Algorithms — Live Competency Assessment"
        subjectCode="CS101"
        subjectName={q.topic_tag || 'Core Computer Science'}
        secondsRemaining={secondsLeft}
        totalQuestions={total}
        answeredCount={answeredCount}
        isCurrentFlagged={isCurrentFlagged}
        onToggleFlagCurrent={() => handleToggleFlag(q.id)}
        onOpenSubmitModal={() => setShowSubmitModal(true)}
        onExitExam={() => setExamStarted(false)}
      />

      <div className="app-content">
        <div className="exam-workspace-grid">
          {/* LEFT / CENTRAL PANE: Question Arena */}
          <section
            className="card card-padding"
            aria-labelledby="active-question-title"
            style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
          >
            <div
              className="flex items-center justify-between"
              style={{
                paddingBottom: 14,
                borderBottom: '1px solid var(--glass-border)',
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 800,
                    color: 'var(--tint-indigo-fg)',
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '0.04em',
                  }}
                >
                  QUESTION {currentQ + 1} OF {total}
                </span>
                {q.topic_tag && <span className="badge badge-blue">{q.topic_tag}</span>}
                <span
                  className={`badge ${
                    q.difficulty?.toLowerCase() === 'hard'
                      ? 'badge-red'
                      : q.difficulty?.toLowerCase() === 'easy'
                      ? 'badge-green'
                      : 'badge-orange'
                  }`}
                >
                  {q.difficulty || 'Medium'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="badge badge-gray">+1.0 Mark</span>
                {isCurrentFlagged && (
                  <span className="badge badge-purple">
                    <Icon name="flag" size={11} />
                    <span>Marked for Review</span>
                  </span>
                )}
              </div>
            </div>

            <div>
              <h2
                id="active-question-title"
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  lineHeight: 1.55,
                  marginBottom: q.code_snippet ? 16 : 4,
                }}
              >
                {q.question_text}
              </h2>

              {q.code_snippet && (
                <pre className="exam-code-block" aria-label="Code snippet for question">
                  <code>{q.code_snippet}</code>
                </pre>
              )}
            </div>

            <div
              role="radiogroup"
              aria-labelledby="active-question-title"
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              {OPTIONS.map(optKey => (
                <ChoiceOption
                  key={optKey}
                  optionKey={optKey}
                  label={optionMap[optKey]}
                  selected={selectedOpt === optKey}
                  onSelect={chosen => handleSelectOption(q.id, chosen)}
                />
              ))}
            </div>

            <div
              className="flex items-center justify-between"
              style={{
                paddingTop: 18,
                marginTop: 6,
                borderTop: '1px solid var(--glass-border)',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={currentQ === 0}
                  onClick={() => setCurrentQ(v => Math.max(0, v - 1))}
                >
                  <Icon name="arrowLeft" size={15} />
                  <span>Previous</span>
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => handleToggleFlag(q.id)}
                  aria-pressed={isCurrentFlagged}
                >
                  <Icon name="flag" size={15} />
                  <span>{isCurrentFlagged ? 'Unmark Review' : 'Mark for Review'}</span>
                </button>

                {selectedOpt && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleClearResponse(q.id)}
                  >
                    Clear Response
                  </button>
                )}
              </div>

              <button
                id="btn-save-and-next"
                type="button"
                className="btn btn-primary"
                onClick={handleSaveAndNext}
              >
                <span>{currentQ < total - 1 ? 'Save & Next' : 'Review & Submit'}</span>
                <Icon name="arrowRight" size={15} />
              </button>
            </div>
          </section>

          {/* RIGHT SIDEBAR: Question Palette & Status Matrix */}
          <QuestionPalette
            items={paletteItems}
            currentIndex={currentQ}
            onJumpToQuestion={idx => setCurrentQ(idx)}
            onOpenSubmitModal={() => setShowSubmitModal(true)}
          />
        </div>
      </div>

      <ExamModal
        isOpen={showSubmitModal}
        totalQuestions={total}
        answeredCount={answeredCount}
        reviewCount={reviewCount}
        unansweredCount={visitedUnansweredCount}
        notVisitedCount={notVisitedCount}
        secondsRemaining={secondsLeft}
        submitting={completing}
        onCancel={() => setShowSubmitModal(false)}
        onConfirmSubmit={finalizeExam}
      />
    </AppShell>
  );
}
