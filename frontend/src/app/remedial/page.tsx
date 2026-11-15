'use client';
// ============================================================
// EdCap — Adaptive Remedial Study Plan & Spaced Repetition (/remedial)
// ============================================================
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import Topbar from '@/components/Topbar';
import StatCard from '@/components/exam/StatCard';
import { Icon, IconTile } from '@/components/ui/Icon';
import { remedialApi, quizzesApi, type RemedialItem, type AssignedRemedialResponse } from '@/lib/api';

export default function RemedialPage() {
  const [items, setItems] = useState<RemedialItem[]>([]);
  const [remedialQuiz, setRemedialQuiz] = useState<AssignedRemedialResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    Promise.all([
      remedialApi.list().then(setItems).catch(console.error),
      quizzesApi.getAssignedRemedial().then(setRemedialQuiz).catch(console.error),
    ]).finally(() => setLoading(false));
  }, []);

  const complete = async (id: string) => {
    setCompleting(id);
    try {
      await remedialApi.complete(id);
      setItems(prev => prev.filter(i => i.id !== id));
      showToast('Review marked as complete — scheduled for next mastery interval!');
    } catch {
      showToast('Failed to update. Try again.');
    } finally {
      setCompleting(null);
    }
  };

  const now = new Date();
  const dueItems = items.filter(i => new Date(i.next_review_at) <= now);
  const upcomingItems = items.filter(i => new Date(i.next_review_at) > now);

  return (
    <AppShell>
      <Topbar breadcrumb="Learner Support" current="Remedial Study Plan" />
      <div className="app-content">
        <div className="page-header">
          <div>
            <div className="page-eyebrow">
              <Icon name="repeat" size={13} /> Spaced-Repetition Scheduler
            </div>
            <h1 className="page-title">Adaptive Remedial Study Plan</h1>
            <p className="page-subtitle">
              Personalized spaced-repetition concept cards & guided walkthroughs (1, 3, 7, 14 day intervals)
            </p>
          </div>
          <a href="/quiz" className="btn btn-primary btn-sm">
            <Icon name="exam" size={14} /> Verify Mastery in Exam Room <Icon name="arrowRight" size={13} />
          </a>
        </div>

        {/* Summary KPI Cards */}
        <div className="grid-3 mb-6">
          <StatCard
            label="Topics Due Right Now"
            value={dueItems.length}
            subtext="Priority remedial reviews"
            icon="alert"
            accentColor={dueItems.length > 0 ? 'rose' : 'emerald'}
          />
          <StatCard
            label="20-Question Remedial Quiz"
            value={remedialQuiz?.has_remedial ? (remedialQuiz.is_completed ? `${remedialQuiz.score_pct?.toFixed(0)}% Done` : 'Assigned') : 'Ready'}
            subtext={remedialQuiz?.diagnostic ? `Tier: ${remedialQuiz.diagnostic.tier} (${remedialQuiz.diagnostic.learner_score}/100)` : 'Targeted concept verification'}
            icon="exam"
            accentColor="indigo"
          />
          <StatCard
            label="Retention Target"
            value="85%+"
            subtext="4-stage interval mastery"
            icon="target"
            accentColor="emerald"
          />
        </div>

        {remedialQuiz?.has_remedial && remedialQuiz.quiz && (
          <div
            className="card card-padding mb-6"
            style={{
              border: '1.5px solid rgba(244, 63, 94, 0.45)',
              background: 'linear-gradient(135deg, rgba(244, 63, 94, 0.08) 0%, rgba(99, 102, 241, 0.06) 100%)',
            }}
          >
            <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 16 }}>
              <div>
                <div className="flex items-center gap-2 mb-2" style={{ flexWrap: 'wrap' }}>
                  <span className="badge badge-red badge-dot">Assigned Remedial Assessment</span>
                  <span className="badge badge-purple">Tier: {remedialQuiz.diagnostic?.tier}</span>
                  <span className="badge badge-blue">{remedialQuiz.quiz.questions.length} Questions · 25 Mins</span>
                </div>
                <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
                  {remedialQuiz.quiz.title}
                </h2>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Complete this 20-question remedial quiz to verify mastery across your weak dimensions ({remedialQuiz.diagnostic?.weak_dimensions?.join(', ') || 'Foundational Programming'}).
                </p>
              </div>
              <a href="/quiz" className="btn btn-primary">
                <Icon name="zap" size={15} />
                <span>{remedialQuiz.is_completed ? 'Retake 20-Q Remedial Quiz' : 'Start 20-Q Remedial Quiz'}</span>
                <Icon name="arrowRight" size={14} />
              </a>
            </div>
          </div>
        )}

        {loading ? (
          <div className="loading-center">
            <div className="spinner" role="status" aria-label="Loading remedial queue" />
          </div>
        ) : items.length === 0 ? (
          <div className="card card-padding" style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
              <IconTile name="checkCircle" tone="emerald" size="lg" />
            </div>
            <h2 style={{ fontWeight: 800, fontSize: 20, marginBottom: 8 }}>
              All Remedial Topics Completed!
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
              You have cleared your current spaced-repetition queue. Take a timed diagnostic quiz to test new topics!
            </p>
            <a href="/quiz" className="btn btn-primary">
              <Icon name="exam" size={15} /> Enter Exam Room <Icon name="arrowRight" size={14} />
            </a>
          </div>
        ) : (
          <>
            {/* Due Now */}
            {dueItems.length > 0 && (
              <>
                <div className="section-title mb-4">
                  <Icon name="alert" size={16} /> Priority Topics Due Today
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
                  {dueItems.map(item => {
                    const isOpen = expandedId === item.id;
                    return (
                      <div
                        key={item.id}
                        className="card card-padding"
                        style={{ borderLeft: '4px solid var(--danger)' }}
                      >
                        <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 12 }}>
                          <div>
                            <div className="flex items-center gap-2" style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', marginBottom: 6 }}>
                              <Icon name="ruler" size={16} />
                              <span>
                                {item.topic_name || 'Core Syllabus Concept Review'}
                                {item.course_code ? ` · ${item.course_code}` : ''}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                              <span className="badge badge-orange">
                                Step #{item.repetition_count + 1}
                              </span>
                              <span className="badge badge-blue">
                                Interval: {item.interval_days} day{item.interval_days !== 1 ? 's' : ''}
                              </span>
                              {item.last_result && (
                                <span className={`badge ${item.last_result === 'pass' ? 'badge-green' : 'badge-red'}`}>
                                  Last check: {item.last_result === 'pass' ? 'Passed' : 'Needs practice'}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                              Scheduled for: {new Date(item.next_review_at).toLocaleString()}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => setExpandedId(isOpen ? null : item.id)}
                              aria-expanded={isOpen}
                            >
                              <Icon name="playbook" size={14} />
                              {isOpen ? 'Hide Study Guide' : 'Open Study Guide'}
                            </button>
                            <button
                              id={`btn-complete-${item.id}`}
                              type="button"
                              className="btn btn-success btn-sm"
                              disabled={completing === item.id}
                              onClick={() => complete(item.id)}
                            >
                              <Icon name="check" size={14} />
                              {completing === item.id ? 'Saving…' : 'Mark Complete'}
                            </button>
                          </div>
                        </div>

                        {isOpen && (
                          <div
                            style={{
                              marginTop: 16,
                              padding: 16,
                              background: 'var(--bg-overlay)',
                              borderRadius: 'var(--radius-md)',
                              border: '1px solid var(--border)',
                            }}
                          >
                            <div className="flex items-center gap-2" style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', marginBottom: 6 }}>
                              <Icon name="lightbulb" size={15} />
                              <span>Step-by-Step Remedial Breakdown: {item.topic_name || 'Core Concept'}</span>
                            </div>
                            <ol style={{ paddingLeft: 18, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.75 }}>
                              <li>
                                <strong>Visual Mental Model:</strong> Trace the state variables on a small 4-element input before writing code.
                              </li>
                              <li>
                                <strong>Boundary Check:</strong> Always test empty input (<code>n = 0</code>), single-element input (<code>n = 1</code>), and duplicate values.
                              </li>
                              <li>
                                <strong>Self-Verification:</strong> Once comfortable, click <em>&ldquo;Mark Complete&rdquo;</em> or test yourself in the Exam Room.
                              </li>
                            </ol>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Upcoming */}
            {upcomingItems.length > 0 && (
              <>
                <div className="section-title mb-4">
                  <Icon name="calendar" size={16} /> Upcoming Spaced-Repetition Reviews
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {upcomingItems.map(item => {
                    const dueDate = new Date(item.next_review_at);
                    const daysUntil = Math.max(1, Math.ceil((dueDate.getTime() - now.getTime()) / 86400000));
                    return (
                      <div key={item.id} className="card card-padding">
                        <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 12 }}>
                          <div>
                            <div className="flex items-center gap-2" style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 4 }}>
                              <Icon name="ruler" size={15} />
                              <span>
                                {item.topic_name || 'Topic Review'}
                                {item.course_code ? ` · ${item.course_code}` : ''}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <span className="badge badge-blue">
                                Due in {daysUntil} day{daysUntil !== 1 ? 's' : ''}
                              </span>
                              <span className="badge badge-gray">
                                Interval: {item.interval_days}d
                              </span>
                            </div>
                          </div>

                          <div
                            className="progress-bar"
                            style={{ width: 120 }}
                            role="progressbar"
                            aria-valuenow={Math.round(
                              Math.min(((item.interval_days - daysUntil) / Math.max(item.interval_days, 1)) * 100, 100)
                            )}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`Review interval progress for ${item.topic_name}`}
                          >
                            <div
                              className="progress-fill"
                              style={{
                                width: `${Math.max(
                                  15,
                                  Math.min(((item.interval_days - daysUntil) / Math.max(item.interval_days, 1)) * 100, 100)
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {toast && (
        <div className={`toast ${toast.includes('Failed') ? 'error' : 'success'}`} role="alert" aria-live="polite">
          <Icon name={toast.includes('Failed') ? 'xCircle' : 'checkCircle'} size={15} />
          <span>{toast}</span>
        </div>
      )}
    </AppShell>
  );
}
