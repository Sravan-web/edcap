'use client';
// ============================================================
// EdCap AI — Student Progress Page
// Assessment history, score trends, topic accuracy
// ============================================================
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import AppShell from '@/components/AppShell';
import Topbar from '@/components/Topbar';
import { studentsApi, coursesApi, type AssessmentHistory, type SupportFlag, type Course } from '@/lib/api';

export default function ProgressPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string>('');
  const [history, setHistory] = useState<AssessmentHistory[]>([]);
  const [flags, setFlags] = useState<SupportFlag[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      coursesApi.list(),
      studentsApi.flags(user.id),
    ])
      .then(([c, f]) => {
        setCourses(c);
        setFlags(f);
        if (c.length > 0) setSelectedCourse(c[0].id);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    if (!user || !selectedCourse) return;
    studentsApi.assessmentHistory(user.id, selectedCourse)
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [user, selectedCourse]);

  const avgPct = history.length
    ? (history.reduce((s, h) => s + h.percentage, 0) / history.length).toFixed(1)
    : null;

  const bestPct = history.length
    ? Math.max(...history.map(h => h.percentage)).toFixed(1)
    : null;

  function trackLabel(track: string) {
    const map: Record<string, string> = {
      A_foundational: '📐 Foundational',
      B_language:     '💬 Language',
      C_engagement:   '⚡ Engagement',
      normal:         '✅ Normal',
    };
    return map[track] ?? track;
  }

  function trackClass(track: string) {
    const map: Record<string, string> = {
      A_foundational: 'badge track-foundational',
      B_language:     'badge track-language',
      C_engagement:   'badge track-engagement',
      normal:         'badge track-normal',
    };
    return map[track] ?? 'badge badge-gray';
  }

  return (
    <AppShell>
      <Topbar
        breadcrumb="Student"
        current="My Progress"
        actions={
          <select
            id="progress-course-select"
            className="form-input"
            aria-label="Select course to view progress"
            style={{ width: 'auto', padding: '6px 12px', fontSize: 13 }}
            value={selectedCourse}
            onChange={e => setSelectedCourse(e.target.value)}
          >
            {courses.map(c => (
              <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
            ))}
          </select>
        }
      />
      <div className="app-content">
        <div className="page-header">
          <h1 className="page-title">📈 My Progress</h1>
          <p className="page-subtitle">Assessment history and support flags</p>
        </div>

        {loading ? (
          <div className="loading-center"><div className="spinner" role="status" aria-label="Loading progress data" /></div>
        ) : (
          <>
            {/* Summary stats */}
            <div className="grid-3 mb-6">
              <div className="card card-padding">
                <div style={{ fontSize: 28, marginBottom: 6 }}>📝</div>
                <div style={{ fontSize: 32, fontWeight: 700 }} className="gradient-text">
                  {history.length}
                </div>
                <div className="text-muted text-sm">Assessments Taken</div>
              </div>
              <div className="card card-padding">
                <div style={{ fontSize: 28, marginBottom: 6 }}>📊</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: avgPct && parseFloat(avgPct) >= 60 ? 'hsl(145,65%,55%)' : 'hsl(35,90%,65%)' }}>
                  {avgPct !== null ? `${avgPct}%` : '—'}
                </div>
                <div className="text-muted text-sm">Average Score</div>
              </div>
              <div className="card card-padding">
                <div style={{ fontSize: 28, marginBottom: 6 }}>🏆</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: 'hsl(35,90%,65%)' }}>
                  {bestPct !== null ? `${bestPct}%` : '—'}
                </div>
                <div className="text-muted text-sm">Best Score</div>
              </div>
            </div>

            <div className="grid-2">
              {/* Assessment history */}
              <div className="card">
                <div className="card-padding" style={{ paddingBottom: 0 }}>
                  <div className="section-title">📋 Assessment History</div>
                </div>
                <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
                  {history.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-state-icon">📝</div>
                      <div className="empty-state-text">No assessments for this course yet</div>
                    </div>
                  ) : (
                    <table>
                      <caption className="sr-only">Assessment history table</caption>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Topic</th>
                          <th>Score</th>
                          <th>%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map(h => (
                          <tr key={h.assessment_id}>
                            <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                              {new Date(h.assessment_date).toLocaleDateString()}
                            </td>
                            <td>
                              <span className="badge badge-gray" style={{ fontSize: 11 }}>{h.topic_tag}</span>
                            </td>
                            <td className="text-sm">
                              {h.score}/{h.max_score}
                            </td>
                            <td>
                              <span
                                style={{
                                  fontWeight: 700,
                                  color: h.percentage >= 70 ? 'hsl(145,65%,55%)' :
                                         h.percentage >= 50 ? 'hsl(35,90%,65%)' : 'hsl(355,75%,65%)',
                                }}
                              >
                                {h.percentage}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Support Flags */}
              <div className="card card-padding">
                <div className="section-header">
                  <div className="section-title">🚩 My Support Flags</div>
                  <span className={`badge ${flags.filter(f => f.status === 'open').length > 0 ? 'badge-red' : 'badge-green'}`}>
                    {flags.filter(f => f.status === 'open').length} open
                  </span>
                </div>

                {flags.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">✅</div>
                    <div className="empty-state-text">You&apos;re on track — no active support flags!</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {flags.map(f => (
                      <div
                        key={f.id}
                        style={{
                          padding: '14px 16px',
                          background: 'var(--bg-overlay)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border)',
                          borderLeft: `3px solid ${
                            f.status === 'open' ? 'var(--danger)' :
                            f.status === 'resolved' ? 'var(--success)' : 'var(--text-disabled)'
                          }`,
                        }}
                      >
                        <div className="flex items-center justify-between mb-4" style={{ marginBottom: 8 }}>
                          <span className={trackClass(f.track)}>{trackLabel(f.track)}</span>
                          <span className={`badge ${f.status === 'open' ? 'badge-red' : f.status === 'resolved' ? 'badge-green' : 'badge-gray'}`}>
                            {f.status}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {(Array.isArray(f.reasons) ? f.reasons : []).map((r, i) => (
                            <span
                              key={i}
                              style={{
                                fontSize: 12, padding: '2px 8px',
                                background: 'var(--bg-surface)',
                                borderRadius: 'var(--radius-full)',
                                border: '1px solid var(--border)',
                                color: 'var(--text-muted)',
                              }}
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-disabled)' }}>
                          {new Date(f.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Score trend visual */}
            {history.length > 1 && (
              <div className="card card-padding mt-6" role="region" aria-label="Score trend analysis">
                <div className="section-title mb-4">📉 Score Trend</div>
                <div
                  role="img"
                  aria-label="Score trend chart showing chronological performance on recent assessments"
                  style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 100 }}
                >
                  {history.slice(0, 10).reverse().map((h, i) => (
                    <div key={h.assessment_id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div
                        role="img"
                        aria-label={`${h.percentage}% on ${h.assessment_date}`}
                        style={{
                          width: '100%',
                          height: `${Math.max(h.percentage, 5)}%`,
                          maxHeight: '100%',
                          background: h.percentage >= 70
                            ? 'linear-gradient(180deg,hsl(145,65%,45%),hsl(145,65%,30%))'
                            : h.percentage >= 50
                            ? 'linear-gradient(180deg,hsl(40,90%,55%),hsl(40,90%,35%))'
                            : 'linear-gradient(180deg,hsl(355,75%,55%),hsl(355,75%,35%))',
                          borderRadius: '4px 4px 0 0',
                          minHeight: 4,
                          transition: 'height 0.5s ease',
                        }}
                        title={`${h.percentage}% on ${h.assessment_date}`}
                      />
                      <span style={{ fontSize: 10, color: 'var(--text-disabled)' }}>
                        {new Date(h.assessment_date).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
