'use client';
// ============================================================
// EdCap AI — Dashboard Page
// Role-aware: shows different content for faculty/student/admin
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
    A_foundational: 'Foundational',
    B_language:     'Language',
    C_engagement:   'Engagement',
    normal:         'Normal',
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
        {/* Welcome banner */}
        <div
          className="card card-padding mb-6"
          style={{
            background: 'linear-gradient(135deg, rgba(99,135,255,0.12) 0%, rgba(45,200,170,0.07) 100%)',
            borderColor: 'rgba(99,135,255,0.20)',
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="page-title">
                Good {getTimeOfDay()}, {user?.first_name}! 👋
              </h1>
              <p className="page-subtitle" style={{ marginTop: 6 }}>
                Here&apos;s your class overview for today.
              </p>
            </div>
            <div style={{ fontSize: 48 }}>📊</div>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid-4 mb-6">
          <div className="stat-card" style={{ '--gradient': 'linear-gradient(90deg,var(--brand-500),var(--accent-400))' } as React.CSSProperties}>
            <div className="stat-icon" style={{ background: 'rgba(99,135,255,0.15)' }}>👥</div>
            <div className="stat-value gradient-text">{totalStudents}</div>
            <div className="stat-label">Total Students</div>
          </div>
          <div className="stat-card" style={{ '--gradient': 'linear-gradient(90deg,hsl(355,75%,55%),hsl(35,90%,55%))' } as React.CSSProperties}>
            <div className="stat-icon" style={{ background: 'rgba(220,60,80,0.15)' }}>🚩</div>
            <div className="stat-value" style={{ color: 'hsl(355,75%,65%)' }}>{totalFlags}</div>
            <div className="stat-label">Open Support Flags</div>
          </div>
          <div className="stat-card" style={{ '--gradient': 'linear-gradient(90deg,hsl(40,90%,55%),hsl(145,65%,45%))' } as React.CSSProperties}>
            <div className="stat-icon" style={{ background: 'rgba(240,130,40,0.15)' }}>📚</div>
            <div className="stat-value" style={{ color: 'hsl(35,90%,65%)' }}>{courses.length}</div>
            <div className="stat-label">Active Courses</div>
          </div>
          <div className="stat-card" style={{ '--gradient': 'linear-gradient(90deg,hsl(145,65%,45%),var(--accent-400))' } as React.CSSProperties}>
            <div className="stat-icon" style={{ background: 'rgba(60,180,100,0.15)' }}>📈</div>
            <div className="stat-value" style={{ color: 'hsl(145,65%,55%)' }}>
              {avgScore !== null ? `${avgScore.toFixed(1)}%` : '–'}
            </div>
            <div className="stat-label">Avg. Assessment Score</div>
          </div>
        </div>

        <div className="grid-2">
          {/* Open Flags Table */}
          <div className="card">
            <div className="card-padding" style={{ paddingBottom: 0 }}>
              <div className="section-header">
                <div>
                  <div className="section-title">🚩 Open Support Flags</div>
                  <div className="section-subtitle">Students needing immediate attention</div>
                </div>
                <a href="/flags" className="btn btn-ghost btn-sm">View all →</a>
              </div>
            </div>
            <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
              {flags.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">✅</div>
                  <div className="empty-state-text">No open flags — great work!</div>
                </div>
              ) : (
                <table>
                  <caption className="sr-only">Open support flags requiring immediate attention</caption>
                  <thead>
                    <tr>
                      <th>Track</th>
                      <th>Risk</th>
                      <th>Reason</th>
                      <th>Created</th>
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
                            aria-label={`Risk score: ${Math.round(flag.risk_score * 100)}%`}
                          >
                            <div className="risk-bar-track" style={{ minWidth: 60 }}>
                              <div
                                className="risk-bar-fill"
                                style={{
                                  width: `${(flag.risk_score * 100).toFixed(0)}%`,
                                  background: riskColor(flag.risk_score),
                                }}
                              />
                            </div>
                            <span style={{ fontSize: 12, color: riskColor(flag.risk_score) }}>
                              {(flag.risk_score * 100).toFixed(0)}%
                            </span>
                          </div>
                        </td>
                        <td className="truncate" style={{ maxWidth: 120, fontSize: 12 }}>
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

          {/* Course summaries */}
          <div className="card card-padding">
            <div className="section-header">
              <div>
                <div className="section-title">🎓 Course Summaries</div>
                <div className="section-subtitle">Flag distribution by track</div>
              </div>
              <a href="/analytics" className="btn btn-ghost btn-sm">Analytics →</a>
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
                        padding: '14px 16px',
                        background: 'var(--bg-overlay)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>
                            {course?.name ?? `Course ${c.course_id.slice(0, 8)}`}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                            {c.student_count} students · {c.open_support_flags} flags
                          </div>
                        </div>
                        {c.last_assessment_avg_pct !== null && (
                          <span className="badge badge-blue">{c.last_assessment_avg_pct}%</span>
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

        {/* Track breakdown */}
        {Object.keys(trackSums).length > 0 && (
          <div className="card card-padding mt-6">
            <div className="section-title mb-4">📊 Risk Track Breakdown</div>
            <div className="grid-4">
              {['A_foundational', 'B_language', 'C_engagement', 'normal'].map(track => (
                <div
                  key={track}
                  style={{
                    padding: '20px',
                    background: 'var(--bg-overlay)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 32, marginBottom: 8 }}>
                    {track === 'A_foundational' ? '📐' :
                     track === 'B_language'     ? '💬' :
                     track === 'C_engagement'   ? '⚡' : '✅'}
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>
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
        {/* Welcome banner */}
        <div
          className="card card-padding mb-6"
          style={{
            background: 'linear-gradient(135deg, rgba(45,200,170,0.10) 0%, rgba(99,135,255,0.08) 100%)',
            borderColor: 'rgba(45,200,170,0.20)',
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="page-title">
                Hey {user?.first_name}! 👋
              </h1>
              <p className="page-subtitle" style={{ marginTop: 6 }}>
                Keep up the momentum — consistency is key.
              </p>
            </div>
            {profile && profile.current_streak > 0 && (
              <div className="streak-widget">
                🔥 {profile.current_streak} day streak
              </div>
            )}
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid-4 mb-6">
          <div className="stat-card" style={{ '--gradient': 'linear-gradient(90deg,hsl(35,90%,55%),hsl(355,75%,55%))' } as React.CSSProperties}>
            <div className="stat-icon" style={{ background: 'rgba(240,130,40,0.15)' }}>🔥</div>
            <div className="stat-value" style={{ color: 'hsl(35,90%,65%)' }}>{profile?.current_streak ?? 0}</div>
            <div className="stat-label">Day Streak</div>
          </div>
          <div className="stat-card" style={{ '--gradient': 'linear-gradient(90deg,var(--brand-500),var(--accent-400))' } as React.CSSProperties}>
            <div className="stat-icon" style={{ background: 'rgba(99,135,255,0.15)' }}>⭐</div>
            <div className="stat-value gradient-text">{profile?.retention_points ?? 0}</div>
            <div className="stat-label">Retention Points</div>
          </div>
          <div className="stat-card" style={{ '--gradient': 'linear-gradient(90deg,hsl(145,65%,45%),var(--accent-400))' } as React.CSSProperties}>
            <div className="stat-icon" style={{ background: 'rgba(60,180,100,0.15)' }}>📚</div>
            <div className="stat-value" style={{ color: 'hsl(145,65%,55%)' }}>
              {profile?.enrolled_courses?.length ?? 0}
            </div>
            <div className="stat-label">Enrolled Courses</div>
          </div>
          <div className="stat-card" style={{ '--gradient': 'linear-gradient(90deg,hsl(355,75%,55%),hsl(35,90%,55%))' } as React.CSSProperties}>
            <div className="stat-icon" style={{ background: 'rgba(220,60,80,0.15)' }}>🚩</div>
            <div className="stat-value" style={{ color: profile?.open_support_flags ? 'hsl(355,75%,65%)' : 'hsl(145,65%,55%)' }}>
              {profile?.open_support_flags ?? 0}
            </div>
            <div className="stat-label">Support Flags</div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid-2 mb-6">
          <a href="/quiz" style={{ textDecoration: 'none' }}>
            <div
              className="card card-padding"
              style={{
                cursor: 'pointer',
                background: 'linear-gradient(135deg, rgba(99,135,255,0.12), rgba(45,200,170,0.07))',
                borderColor: 'rgba(99,135,255,0.20)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)';
                (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-lg)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.transform = '';
                (e.currentTarget as HTMLElement).style.boxShadow = '';
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 12 }}>🧪</div>
              <div className="section-title">Take Today&apos;s Quiz</div>
              <div className="section-subtitle" style={{ marginTop: 6 }}>
                20 micro-questions from your latest modules
              </div>
              <div className="btn btn-primary btn-sm" style={{ marginTop: 16, width: 'fit-content' }}>
                Start Quiz →
              </div>
            </div>
          </a>

          <a href="/progress" style={{ textDecoration: 'none' }}>
            <div
              className="card card-padding"
              style={{
                cursor: 'pointer',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)';
                (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-lg)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.transform = '';
                (e.currentTarget as HTMLElement).style.boxShadow = '';
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 12 }}>📈</div>
              <div className="section-title">View My Progress</div>
              <div className="section-subtitle" style={{ marginTop: 6 }}>
                Assessment history, topic accuracy, and trends
              </div>
              <div className="btn btn-secondary btn-sm" style={{ marginTop: 16, width: 'fit-content' }}>
                View Progress →
              </div>
            </div>
          </a>
        </div>

        <div className="card card-padding">
          <div className="section-title mb-4">🎯 Learning Tips</div>
          <div className="grid-3">
            {[
              { icon: '🔥', tip: 'Keep your streak alive by answering today\'s quiz!' },
              { icon: '🔁', tip: 'Review your remedial queue to reinforce weak topics.' },
              { icon: '📖', tip: 'Re-read modules where your topic accuracy is below 60%.' },
            ].map((t, i) => (
              <div
                key={i}
                style={{
                  padding: 16, background: 'var(--bg-overlay)',
                  borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
                }}
              >
                <div style={{ fontSize: 24, marginBottom: 8 }}>{t.icon}</div>
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
          style={{
            background: 'linear-gradient(135deg, rgba(150,90,240,0.12) 0%, rgba(99,135,255,0.08) 100%)',
            borderColor: 'rgba(150,90,240,0.20)',
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="page-title">Admin Console 🔑</h1>
              <p className="page-subtitle" style={{ marginTop: 6 }}>
                Welcome, {user?.first_name}. Full system access enabled.
              </p>
            </div>
            <div style={{ fontSize: 48 }}>⚙️</div>
          </div>
        </div>

        <div className="grid-3">
          {[
            { icon: '👥', label: 'Manage Users', href: '/admin', desc: 'View all users, change roles, activate/deactivate accounts' },
            { icon: '📋', label: 'Audit Logs',   href: '/admin#audit', desc: 'Immutable audit trail of all privileged actions' },
            { icon: '⚙️',  label: 'Settings',     href: '/admin#settings', desc: 'Configure thresholds, rate limits, and system parameters' },
            { icon: '📊', label: 'Analytics',    href: '/analytics', desc: 'Platform-wide course and student analytics' },
            { icon: '🚩', label: 'Support Flags',href: '/flags', desc: 'All open intervention flags across all courses' },
            { icon: '📖', label: 'Playbooks',    href: '/playbooks', desc: 'AI-generated intervention plans and strategies' },
          ].map(item => (
            <a key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
              <div
                className="card card-padding"
                style={{ cursor: 'pointer', height: '100%', transition: 'transform 0.2s' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = ''}
              >
                <div style={{ fontSize: 32, marginBottom: 12 }}>{item.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{item.label}</div>
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
