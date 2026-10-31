'use client';
// ============================================================
// EdCap — Accessible Analytics & Student Dashboard (WCAG 2.2)
// Role-aware: Faculty, Student, and Admin views
// ============================================================
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import AppShell from '@/components/AppShell';
import Topbar from '@/components/Topbar';
import { analyticsApi, flagsApi, coursesApi, type CourseAnalytics, type SupportFlag, type Course } from '@/lib/api';

/* ── Shared helpers ────────────────────────────────────────── */
function trackColor(track: string) {
  const map: Record<string, string> = {
    A_foundational: 'badge track-foundational',
    B_language:     'badge track-language',
    C_engagement:   'badge track-engagement',
    normal:         'badge track-normal',
  };
  return map[track] ?? 'badge badge-gray';
}

function trackLabel(track: string) {
  const map: Record<string, string> = {
    A_foundational: 'Core Concepts',
    B_language:     'Reading & Notes',
    C_engagement:   'Daily Practice',
    normal:         'On Track',
  };
  return map[track] ?? track;
}

function riskColor(score: number) {
  if (score >= 0.75) return 'var(--danger)';
  if (score >= 0.45) return 'var(--warning)';
  return 'var(--success)';
}

/* ── Faculty Dashboard ─────────────────────────────────────── */
function FacultyDashboard() {
  const [analytics, setAnalytics] = useState<CourseAnalytics[]>([]);
  const [flags, setFlags] = useState<SupportFlag[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    Promise.all([
      analyticsApi.class().then(r => setAnalytics(r.courses)),
      flagsApi.list({ status: 'open' }).then(setFlags),
      coursesApi.list().then(setCourses),
    ])
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-center"><div className="spinner" role="status" aria-label="Loading faculty dashboard" /></div>;

  const totalStudents = analytics.reduce((s, c) => s + c.student_count, 0);
  const totalFlags = analytics.reduce((s, c) => s + c.open_support_flags, 0);
  const avgScore = analytics.length
    ? analytics.filter(c => c.last_assessment_avg_pct !== null)
        .reduce((s, c) => s + (c.last_assessment_avg_pct ?? 0), 0) /
      Math.max(analytics.filter(c => c.last_assessment_avg_pct !== null).length, 1)
    : null;

  const trackSums: Record<string, number> = {};
  analytics.forEach(c => {
    Object.entries(c.flag_by_track).forEach(([t, n]) => {
      trackSums[t] = (trackSums[t] ?? 0) + n;
    });
  });

  return (
    <>
      <Topbar current="Dashboard" breadcrumb="Faculty" />
      <div className="app-content">
        {/* Hero Welcome Banner */}
        <div
          className="card card-padding mb-6"
          style={{
            borderLeft: '4px solid var(--brand-500)',
          }}
        >
          <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 16 }}>
            <div>
              <span className="badge badge-blue" style={{ marginBottom: 8 }}>Academic Intervention Overview</span>
              <h1 className="page-title">
                Good {getTimeOfDay()}, Prof. {user?.last_name}
              </h1>
              <p className="page-subtitle" style={{ marginTop: 6 }}>
                Monitor student mastery, identify learners needing remedial support, and launch targeted study modules.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <a href="/assessments" className="btn btn-secondary btn-sm">📋 Record Scores</a>
              <a href="/flags" className="btn btn-primary btn-sm">🚩 Review Flags ({totalFlags})</a>
            </div>
          </div>
        </div>

        {/* High-Contrast KPI Stat Cards */}
        <div className="grid-4 mb-6">
          <div className="stat-card" style={{ '--gradient': 'var(--brand-500)' } as React.CSSProperties}>
            <div className="stat-icon">👥</div>
            <div className="stat-value">{totalStudents}</div>
            <div className="stat-label">Enrolled Students</div>
          </div>
          <div className="stat-card" style={{ '--gradient': 'var(--danger)' } as React.CSSProperties}>
            <div className="stat-icon">🚩</div>
            <div className="stat-value" style={{ color: 'var(--danger)' }}>{totalFlags}</div>
            <div className="stat-label">Students Needing Support</div>
          </div>
          <div className="stat-card" style={{ '--gradient': 'var(--warning)' } as React.CSSProperties}>
            <div className="stat-icon">📚</div>
            <div className="stat-value">{courses.length}</div>
            <div className="stat-label">Active Courses</div>
          </div>
          <div className="stat-card" style={{ '--gradient': 'var(--accent-500)' } as React.CSSProperties}>
            <div className="stat-icon">📈</div>
            <div className="stat-value" style={{ color: 'var(--success)' }}>
              {avgScore !== null ? `${avgScore.toFixed(1)}%` : '–'}
            </div>
            <div className="stat-label">Class Assessment Average</div>
          </div>
        </div>

        <div className="grid-2">
          {/* Open Flags Table */}
          <div className="card">
            <div className="card-padding" style={{ paddingBottom: 0 }}>
              <div className="section-header">
                <div>
                  <div className="section-title">🚩 Open Support Flags</div>
                  <div className="section-subtitle">Learners identified for remedial coaching</div>
                </div>
                <a href="/flags" className="btn btn-secondary btn-sm">View all →</a>
              </div>
            </div>
            <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
              {flags.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">✅</div>
                  <div className="empty-state-text">No open flags — all students are on track!</div>
                </div>
              ) : (
                <table>
                  <caption className="sr-only">Open support flags requiring immediate attention</caption>
                  <thead>
                    <tr>
                      <th>Support Area</th>
                      <th>Attention Level</th>
                      <th>Primary Observation</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flags.slice(0, 6).map(flag => (
                      <tr key={flag.id}>
                        <td>
                          <span className={`badge ${trackColor(flag.track)}`}>
                            {trackLabel(flag.track)}
                          </span>
                        </td>
                        <td>
                          <div
                            className="risk-bar"
                            role="progressbar"
                            aria-valuenow={Math.round(flag.risk_score * 100)}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`Support priority: ${Math.round(flag.risk_score * 100)}%`}
                          >
                            <div className="risk-bar-track" style={{ minWidth: 64 }}>
                              <div
                                className="risk-bar-fill"
                                style={{
                                  width: `${(flag.risk_score * 100).toFixed(0)}%`,
                                  background: riskColor(flag.risk_score),
                                }}
                              />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, color: riskColor(flag.risk_score) }}>
                              {(flag.risk_score * 100).toFixed(0)}%
                            </span>
                          </div>
                        </td>
                        <td className="truncate" style={{ maxWidth: 160, fontSize: 13 }}>
                          {Array.isArray(flag.reasons) ? (flag.reasons[0] ?? '—') : '—'}
                        </td>
                        <td style={{ fontSize: 12 }}>{new Date(flag.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Course Summaries */}
          <div className="card card-padding">
            <div className="section-header">
              <div>
                <div className="section-title">🎓 Course Mastery Overview</div>
                <div className="section-subtitle">Class averages and support distribution</div>
              </div>
              <a href="/analytics" className="btn btn-secondary btn-sm">Analytics →</a>
            </div>

            {analytics.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📚</div>
                <div className="empty-state-text">No courses found</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {analytics.map(c => {
                  const course = courses.find(x => x.id === c.course_id);
                  return (
                    <div
                      key={c.course_id}
                      style={{
                        padding: '16px',
                        background: 'var(--bg-overlay)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--glass-border)',
                      }}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                            {course?.name ?? `Course ${c.course_id.slice(0, 8)}`}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                            {c.student_count} students · {c.open_support_flags} open support flags
                          </div>
                        </div>
                        {c.last_assessment_avg_pct !== null && (
                          <span className="badge badge-blue">Avg: {c.last_assessment_avg_pct}%</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {Object.entries(c.flag_by_track).map(([t, n]) => (
                          <span key={t} className={`badge ${trackColor(t)}`}>{n} {trackLabel(t)}</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Support Track Breakdown */}
        {Object.keys(trackSums).length > 0 && (
          <div className="card card-padding mt-6">
            <div className="section-title mb-4">📊 Remedial Support Categories</div>
            <div className="grid-4">
              {['A_foundational', 'B_language', 'C_engagement', 'normal'].map(track => (
                <div
                  key={track}
                  style={{
                    padding: '20px',
                    background: 'var(--bg-overlay)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--glass-border)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 28, marginBottom: 8 }}>
                    {track === 'A_foundational' ? '📐' :
                     track === 'B_language'     ? '💬' :
                     track === 'C_engagement'   ? '⚡' : '✅'}
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>
                    {trackSums[track] ?? 0}
                  </div>
                  <span className={`badge ${trackColor(track)}`}>{trackLabel(track)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* ── Student Dashboard ─────────────────────────────────────── */
function StudentDashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<{
    current_streak: number;
    retention_points: number;
    open_support_flags: number;
    enrolled_courses: string[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    import('@/lib/api')
      .then(api => api.studentsApi.profile(user.id))
      .then(setProfile)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) return <div className="loading-center"><div className="spinner" role="status" aria-label="Loading student dashboard" /></div>;

  return (
    <>
      <Topbar current="Dashboard" breadcrumb="Student" />
      <div className="app-content">
        {/* Welcome Banner */}
        <div
          className="card card-padding mb-6"
          style={{
            borderLeft: '4px solid var(--accent-500)',
          }}
        >
          <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 16 }}>
            <div>
              <span className="badge badge-teal" style={{ marginBottom: 8 }}>Personal Learning Hub</span>
              <h1 className="page-title">
                Welcome back, {user?.first_name}!
              </h1>
              <p className="page-subtitle" style={{ marginTop: 6 }}>
                Complete your daily 5-minute concept quiz and review your step-by-step remedial guides.
              </p>
            </div>
            {profile && profile.current_streak > 0 && (
              <div className="streak-widget">
                🔥 {profile.current_streak} Day Study Streak
              </div>
            )}
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid-4 mb-6">
          <div className="stat-card" style={{ '--gradient': 'var(--warning)' } as React.CSSProperties}>
            <div className="stat-icon">🔥</div>
            <div className="stat-value" style={{ color: 'var(--warning)' }}>{profile?.current_streak ?? 0}</div>
            <div className="stat-label">Day Study Streak</div>
          </div>
          <div className="stat-card" style={{ '--gradient': 'var(--brand-500)' } as React.CSSProperties}>
            <div className="stat-icon">⭐</div>
            <div className="stat-value" style={{ color: 'var(--brand-500)' }}>{profile?.retention_points ?? 0}</div>
            <div className="stat-label">Mastery Points</div>
          </div>
          <div className="stat-card" style={{ '--gradient': 'var(--accent-500)' } as React.CSSProperties}>
            <div className="stat-icon">📚</div>
            <div className="stat-value" style={{ color: 'var(--success)' }}>
              {profile?.enrolled_courses?.length ?? 0}
            </div>
            <div className="stat-label">Enrolled Courses</div>
          </div>
          <div className="stat-card" style={{ '--gradient': 'var(--danger)' } as React.CSSProperties}>
            <div className="stat-icon">🎯</div>
            <div className="stat-value" style={{ color: profile?.open_support_flags ? 'var(--warning)' : 'var(--success)' }}>
              {profile?.open_support_flags ?? 0}
            </div>
            <div className="stat-label">Active Focus Areas</div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid-2 mb-6">
          <a href="/quiz" style={{ textDecoration: 'none' }}>
            <div className="card card-padding" style={{ height: '100%' }}>
              <span className="badge badge-blue" style={{ marginBottom: 12 }}>Daily Check-in</span>
              <div className="section-title">🧪 Take Today&apos;s Micro-Quiz</div>
              <p className="section-subtitle" style={{ marginTop: 6, lineHeight: 1.5 }}>
                Reinforce your latest class lecture with adaptive practice questions and instant explanations.
              </p>
              <div className="btn btn-primary btn-sm" style={{ marginTop: 18 }}>
                Start Quiz →
              </div>
            </div>
          </a>

          <a href="/remedial" style={{ textDecoration: 'none' }}>
            <div className="card card-padding" style={{ height: '100%' }}>
              <span className="badge badge-teal" style={{ marginBottom: 12 }}>Step-by-Step Support</span>
              <div className="section-title">🔁 Open My Remedial Study Plan</div>
              <p className="section-subtitle" style={{ marginTop: 6, lineHeight: 1.5 }}>
                Access simplified concept breakdowns, visual examples, and guided practice tailored to you.
              </p>
              <div className="btn btn-secondary btn-sm" style={{ marginTop: 18 }}>
                Open Study Plan →
              </div>
            </div>
          </a>
        </div>

        {/* Study Habits */}
        <div className="card card-padding">
          <div className="section-title mb-4">🎯 Recommended Study Routine</div>
          <div className="grid-3">
            {[
              { icon: '🔥', title: '1. Daily 5-Minute Quiz', tip: 'Complete today\'s micro-quiz to lock in lecture concepts before they fade.' },
              { icon: '🔁', title: '2. Guided Remedial Steps', tip: 'Work through your personalized remedial cards for any topic below 65%.' },
              { icon: '📈', title: '3. Track Weekly Growth', tip: 'Check your Progress page to see your topic accuracy climb week over week.' },
            ].map((t, i) => (
              <div
                key={i}
                style={{
                  padding: 18,
                  background: 'var(--bg-overlay)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--glass-border)',
                }}
              >
                <div style={{ fontSize: 24, marginBottom: 8 }}>{t.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 }}>{t.title}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{t.tip}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Admin Dashboard ───────────────────────────────────────── */
function AdminDashboard() {
  const { user } = useAuth();
  return (
    <>
      <Topbar current="Dashboard" breadcrumb="Admin" />
      <div className="app-content">
        <div
          className="card card-padding mb-6"
          style={{ borderLeft: '4px solid var(--brand-600)' }}
        >
          <div className="flex items-center justify-between">
            <div>
              <span className="badge badge-purple" style={{ marginBottom: 8 }}>System Administration</span>
              <h1 className="page-title">Admin Console</h1>
              <p className="page-subtitle" style={{ marginTop: 6 }}>
                Welcome, {user?.first_name}. Manage institutional accounts, audit trails, and detection rules.
              </p>
            </div>
            <div style={{ fontSize: 40 }}>⚙️</div>
          </div>
        </div>

        <div className="grid-3">
          {[
            { icon: '👥', label: 'Manage Users',  href: '/admin',          desc: 'View all users, assign roles, and activate or suspend accounts' },
            { icon: '📋', label: 'Audit Logs',    href: '/admin#audit',    desc: 'Tamper-evident security audit trail of all privileged actions' },
            { icon: '⚙️', label: 'System Rules',  href: '/admin#settings', desc: 'Configure early-warning thresholds, quiz timing, and parameters' },
            { icon: '📊', label: 'Analytics',     href: '/analytics',      desc: 'Institution-wide course mastery and intervention analytics' },
            { icon: '🚩', label: 'Support Flags', href: '/flags',          desc: 'All active student support flags across departments' },
            { icon: '📖', label: 'Playbooks',     href: '/playbooks',      desc: 'Faculty intervention playbooks and remedial strategies' },
          ].map(item => (
            <a key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
              <div className="card card-padding" style={{ cursor: 'pointer', height: '100%' }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>{item.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 6 }}>{item.label}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{item.desc}</div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </>
  );
}

/* ── Helper ────────────────────────────────────────────────── */
function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

/* ── Main export ───────────────────────────────────────────── */
export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <AppShell>
      {user?.role === 'student' && <StudentDashboard />}
      {user?.role === 'faculty' && <FacultyDashboard />}
      {user?.role === 'admin'   && <AdminDashboard />}
    </AppShell>
  );
}
