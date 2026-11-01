'use client';
// ============================================================
// EdCap — EduTech Platform Main Portal & Course Dashboard (/dashboard)
// Zero emoji · Crisp SVG Icons · High-Contrast SaaS Layout
// ============================================================
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import AppShell from '@/components/AppShell';
import Topbar from '@/components/Topbar';
import StatCard from '@/components/exam/StatCard';
import Icon, { IconTile, type IconName } from '@/components/ui/Icon';
import {
  analyticsApi,
  flagsApi,
  coursesApi,
  type CourseAnalytics,
  type SupportFlag,
  type Course,
} from '@/lib/api';

/* ── Shared Helpers ────────────────────────────────────────── */
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

/* ── SVG Subject Mastery Radar Chart Component ─────────────── */
function SubjectMasteryRadar({
  metrics,
}: {
  metrics: { label: string; pct: number }[];
}) {
  const size = 240;
  const center = size / 2;
  const radius = 82;
  const count = metrics.length;

  const pointFor = (idx: number, ratio: number) => {
    const angle = (Math.PI * 2 * idx) / count - Math.PI / 2;
    const x = center + radius * ratio * Math.cos(angle);
    const y = center + radius * ratio * Math.sin(angle);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };

  const dataPolygon = metrics.map((m, i) => pointFor(i, Math.max(0.15, m.pct / 100))).join(' ');

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label="Subject mastery radar chart"
        style={{ margin: '0 auto', overflow: 'visible' }}
      >
        {[0.25, 0.5, 0.75, 1].map(level => (
          <polygon
            key={level}
            points={metrics.map((_, i) => pointFor(i, level)).join(' ')}
            fill="none"
            stroke="var(--border)"
            strokeWidth="1"
            strokeDasharray={level < 1 ? '3 3' : undefined}
          />
        ))}

        {metrics.map((m, i) => {
          const [x, y] = pointFor(i, 1).split(',');
          const [lx, ly] = pointFor(i, 1.22).split(',');
          return (
            <g key={m.label}>
              <line x1={center} y1={center} x2={x} y2={y} stroke="var(--border)" strokeWidth="1" />
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="10.5"
                fontWeight="700"
                fill="var(--text-secondary)"
              >
                {m.label}
              </text>
            </g>
          );
        })}

        <polygon
          points={dataPolygon}
          fill="rgba(79, 70, 229, 0.24)"
          stroke="#6366F1"
          strokeWidth="2.5"
        />

        {metrics.map((m, i) => {
          const [vx, vy] = pointFor(i, Math.max(0.15, m.pct / 100)).split(',');
          return (
            <circle
              key={m.label}
              cx={vx}
              cy={vy}
              r="4"
              fill="#10B981"
              stroke="var(--bg-surface)"
              strokeWidth="1.5"
            />
          );
        })}
      </svg>

      {/* Progress Bars Legend */}
      <div style={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {metrics.map(m => (
          <div key={m.label}>
            <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{m.label}</span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  color: m.pct >= 75 ? 'var(--success)' : m.pct >= 55 ? 'var(--warning)' : 'var(--danger)',
                }}
              >
                {m.pct}%
              </span>
            </div>
            <div className="progress-bar" style={{ height: 6 }}>
              <div
                className="progress-fill"
                style={{
                  width: `${m.pct}%`,
                  background: m.pct >= 75 ? '#10B981' : m.pct >= 55 ? '#6366F1' : '#F43F5E',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Course & Exam Directory Data ──────────────────────────── */
const EXAM_DIRECTORY = [
  {
    code: 'CS101',
    title: 'Data Structures & Algorithms',
    examTitle: 'Mid-Term Competency Diagnostic #4',
    questions: 10,
    duration: '20 Mins',
    syllabusPct: 78,
    deadline: 'Due Today, 11:59 PM',
    status: 'Live Now',
  },
  {
    code: 'CS204',
    title: 'Operating Systems & Concurrency',
    examTitle: 'Memory Management & Paging Test',
    questions: 10,
    duration: '20 Mins',
    syllabusPct: 64,
    deadline: 'Tomorrow, 5:00 PM',
    status: 'Open',
  },
  {
    code: 'CS302',
    title: 'Database Management Systems',
    examTitle: 'Indexing, B-Trees & ACID Transactions',
    questions: 10,
    duration: '20 Mins',
    syllabusPct: 85,
    deadline: 'Fri, 6:00 PM',
    status: 'Scheduled',
  },
];

const MASTERY_METRICS = [
  { label: 'Arrays',    pct: 84 },
  { label: 'Pointers',  pct: 68 },
  { label: 'Recursion', pct: 62 },
  { label: 'Sorting',   pct: 79 },
  { label: 'Trees/BST', pct: 74 },
  { label: 'Hashing',   pct: 88 },
];

/* ── Student EduTech Dashboard ─────────────────────────────── */
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

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" role="status" aria-label="Loading student portal" />
      </div>
    );
  }

  return (
    <>
      <Topbar current="Dashboard" breadcrumb="Student Portal" />
      <div className="app-content">
        {/* Hero Banner */}
        <div className="hero mb-6">
          <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
                <span className="badge badge-blue">EduTech Learning Hub</span>
                <span className="badge badge-teal badge-dot">Semester IV Active</span>
              </div>
              <h1 className="page-title">
                Welcome back, {user?.first_name}
              </h1>
              <p className="page-subtitle" style={{ marginTop: 6 }}>
                Track your syllabus progression, complete timed assessments, and master flagged concepts.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {profile && profile.current_streak > 0 && (
                <div className="streak-widget">
                  <Icon name="flame" size={16} />
                  <span>{profile.current_streak} Day Streak</span>
                </div>
              )}
              <a href="/quiz" className="btn btn-primary">
                <Icon name="exam" size={16} />
                <span>Enter Exam Room</span>
                <Icon name="arrowRight" size={15} />
              </a>
            </div>
          </div>
        </div>

        {/* 1. Overview Metrics (<StatCard />) */}
        <div className="grid-4 mb-6">
          <StatCard
            label="Tests Completed"
            value="14"
            subtext="100% on-time submission"
            trend="+2 this week"
            trendPositive
            icon="assessments"
            accentColor="indigo"
          />
          <StatCard
            label="Score Percentile / GPA"
            value="8.6 GPA"
            subtext="Top 18% of cohort (76.4%)"
            trend="+4.2%"
            trendPositive
            icon="award"
            accentColor="emerald"
          />
          <StatCard
            label="Study Hours & Streak"
            value={`${profile?.current_streak ?? 5}d / 28.5h`}
            subtext={`${profile?.retention_points ?? 340} mastery points earned`}
            trend="Consistent"
            trendPositive
            icon="clock"
            accentColor="blue"
          />
          <StatCard
            label="Upcoming Deadlines"
            value="2 Tests"
            subtext={`${profile?.open_support_flags ?? 0} remedial topics queued`}
            trend="Due Today"
            trendPositive={false}
            icon="calendar"
            accentColor="rose"
          />
        </div>

        {/* 2. Course & Exam Directory */}
        <div className="card card-padding mb-6">
          <div className="section-header">
            <div>
              <h2 className="section-title">
                <Icon name="courses" size={18} style={{ color: 'var(--tint-indigo-fg)' }} />
                <span>Active Course & Online Exam Directory</span>
              </h2>
              <p className="section-subtitle">
                Syllabus completion progress and scheduled proctored assessments
              </p>
            </div>
            <a href="/quiz" className="btn btn-secondary btn-sm">
              <span>All Exams</span>
              <Icon name="arrowRight" size={14} />
            </a>
          </div>

          <div className="grid-3">
            {EXAM_DIRECTORY.map(course => (
              <div
                key={course.code}
                className="subcard card-interactive"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 16,
                  padding: 20,
                }}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="badge badge-blue">{course.code}</span>
                    <span
                      className={`badge badge-dot ${
                        course.status === 'Live Now' ? 'badge-green' : 'badge-orange'
                      }`}
                    >
                      {course.status}
                    </span>
                  </div>

                  <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
                    {course.title}
                  </h3>
                  <p className="flex items-center gap-2" style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
                    <Icon name="exam" size={14} style={{ color: 'var(--tint-indigo-fg)' }} />
                    <span>{course.examTitle}</span>
                  </p>

                  <div
                    style={{
                      display: 'flex',
                      gap: 14,
                      fontSize: 12,
                      color: 'var(--text-muted)',
                      marginTop: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <Icon name="file" size={13} />
                      <span>{course.questions} Qs</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Icon name="clock" size={13} />
                      <span>{course.duration}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Icon name="calendar" size={13} />
                      <span>{course.deadline}</span>
                    </span>
                  </div>

                  {/* Syllabus Completion Meter */}
                  <div style={{ marginTop: 14 }}>
                    <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                        Syllabus Progress
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                        {course.syllabusPct}%
                      </span>
                    </div>
                    <div className="progress-bar" style={{ height: 6 }}>
                      <div className="progress-fill" style={{ width: `${course.syllabusPct}%` }} />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <a href={`/quiz?exam=${course.code}`} className="btn btn-primary btn-sm btn-full">
                    <span>Enter Exam Room</span>
                    <Icon name="arrowRight" size={14} />
                  </a>
                  <a href="/remedial" className="btn btn-secondary btn-sm">
                    Study Plan
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Performance Analytics (Radar + Remedial Action Queue) */}
        <div className="grid-2">
          <div className="card card-padding">
            <div className="section-header">
              <div>
                <h2 className="section-title">
                  <Icon name="radar" size={18} style={{ color: 'var(--tint-indigo-fg)' }} />
                  <span>Subject Mastery Radar</span>
                </h2>
                <p className="section-subtitle">Topic-level accuracy across recent assessments</p>
              </div>
              <a href="/progress" className="btn btn-secondary btn-sm">
                <span>Full History</span>
                <Icon name="arrowRight" size={14} />
              </a>
            </div>
            <SubjectMasteryRadar metrics={MASTERY_METRICS} />
          </div>

          <div className="card card-padding">
            <div className="section-header">
              <div>
                <h2 className="section-title">
                  <Icon name="repeat" size={18} style={{ color: 'var(--tint-emerald-fg)' }} />
                  <span>Adaptive Remedial Study Queue</span>
                </h2>
                <p className="section-subtitle">Personalized interventions based on exam diagnostics</p>
              </div>
              <a href="/remedial" className="btn btn-secondary btn-sm">
                <span>Open Queue</span>
                <Icon name="arrowRight" size={14} />
              </a>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                {
                  topic: 'Recursion & Call Stack Frames',
                  course: 'CS101',
                  accuracy: '62%',
                  action: 'Review Step-by-Step Guide + 5 Practice Questions',
                  badge: 'badge-orange',
                },
                {
                  topic: 'Pointer Arithmetic & Memory Offsets',
                  course: 'CS101',
                  accuracy: '68%',
                  action: 'Complete Spaced-Repetition Review (Interval: 3d)',
                  badge: 'badge-blue',
                },
                {
                  topic: 'Balanced Binary Search Trees (AVL)',
                  course: 'CS204',
                  accuracy: '74%',
                  action: 'Ready for Timed Mastery Verification Quiz',
                  badge: 'badge-green',
                },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="subcard flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
                      <span className={`badge ${item.badge}`}>{item.course}</span>
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                        {item.topic}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {item.action} · Accuracy: <strong>{item.accuracy}</strong>
                    </div>
                  </div>
                  <a href="/remedial" className="btn btn-secondary btn-sm">
                    <span>Practice</span>
                    <Icon name="arrowRight" size={13} />
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Faculty EduTech & Assessment Dashboard ────────────────── */
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

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" role="status" aria-label="Loading faculty dashboard" />
      </div>
    );
  }

  const totalStudents = analytics.reduce((s, c) => s + c.student_count, 0);
  const totalFlags = analytics.reduce((s, c) => s + c.open_support_flags, 0);
  const avgScore = analytics.length
    ? analytics.filter(c => c.last_assessment_avg_pct !== null)
        .reduce((s, c) => s + (c.last_assessment_avg_pct ?? 0), 0) /
      Math.max(analytics.filter(c => c.last_assessment_avg_pct !== null).length, 1)
    : null;

  return (
    <>
      <Topbar current="Dashboard" breadcrumb="Faculty Portal" />
      <div className="app-content">
        {/* Hero Welcome Banner */}
        <div className="hero mb-6">
          <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
                <span className="badge badge-blue">Faculty Command Center</span>
                <span className="badge badge-teal badge-dot">Live Exam & Intervention Suite</span>
              </div>
              <h1 className="page-title">
                Good {getTimeOfDay()}, Prof. {user?.last_name}
              </h1>
              <p className="page-subtitle" style={{ marginTop: 6 }}>
                Monitor cohort mastery, launch proctored online examinations, and review early-warning remedial flags.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <a href="/quiz" className="btn btn-secondary btn-sm">
                <Icon name="exam" size={15} />
                <span>Exam Room</span>
              </a>
              <a href="/assessments" className="btn btn-secondary btn-sm">
                <Icon name="assessments" size={15} />
                <span>Record Scores</span>
              </a>
              <a href="/flags" className="btn btn-primary btn-sm">
                <Icon name="flag" size={15} />
                <span>Review Flags ({totalFlags})</span>
              </a>
            </div>
          </div>
        </div>

        {/* 1. Overview Metrics (<StatCard />) */}
        <div className="grid-4 mb-6">
          <StatCard
            label="Enrolled Students"
            value={totalStudents}
            subtext={`Across ${courses.length} active courses`}
            trend="100% synced"
            trendPositive
            icon="users"
            accentColor="indigo"
          />
          <StatCard
            label="Class Score Average"
            value={avgScore !== null ? `${avgScore.toFixed(1)}%` : '71.4%'}
            subtext="Latest assessment cohort mean"
            trend="+3.1% vs last test"
            trendPositive
            icon="analytics"
            accentColor="emerald"
          />
          <StatCard
            label="Students Needing Support"
            value={totalFlags}
            subtext="Identified by diagnostic engine"
            trend={totalFlags > 0 ? 'Action Required' : 'All Clear'}
            trendPositive={totalFlags === 0}
            icon="flag"
            accentColor="rose"
          />
          <StatCard
            label="Active Online Exams"
            value={`${EXAM_DIRECTORY.length} Live`}
            subtext="Proctored timed assessments"
            trend="20m Timed"
            trendPositive
            icon="exam"
            accentColor="blue"
          />
        </div>

        {/* 2. Course & Online Exam Directory */}
        <div className="card card-padding mb-6">
          <div className="section-header">
            <div>
              <h2 className="section-title">
                <Icon name="courses" size={18} style={{ color: 'var(--tint-indigo-fg)' }} />
                <span>Course & Online Examination Directory</span>
              </h2>
              <p className="section-subtitle">
                Manage syllabus modules, inspect live exams, or enter the examination room
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a href="/modules" className="btn btn-secondary btn-sm">
                <Icon name="modules" size={14} />
                <span>Lecture Modules</span>
              </a>
              <a href="/quiz" className="btn btn-primary btn-sm">
                <span>Launch Exam Room</span>
                <Icon name="arrowRight" size={14} />
              </a>
            </div>
          </div>

          <div className="grid-3">
            {EXAM_DIRECTORY.map(item => (
              <div
                key={item.code}
                className="subcard card-interactive"
                style={{
                  padding: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 14,
                }}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="badge badge-blue">{item.code}</span>
                    <span className="badge badge-green badge-dot">{item.status}</span>
                  </div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
                    {item.title}
                  </h3>
                  <p className="flex items-center gap-2" style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
                    <Icon name="exam" size={14} style={{ color: 'var(--tint-indigo-fg)' }} />
                    <span>{item.examTitle}</span>
                  </p>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                    {item.questions} Questions · {item.duration} · {item.deadline}
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                        Syllabus Coverage
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{item.syllabusPct}%</span>
                    </div>
                    <div className="progress-bar" style={{ height: 6 }}>
                      <div className="progress-fill" style={{ width: `${item.syllabusPct}%` }} />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <a href={`/quiz?exam=${item.code}`} className="btn btn-primary btn-sm btn-full">
                    <span>Enter Exam Room</span>
                    <Icon name="arrowRight" size={14} />
                  </a>
                  <a href="/analytics" className="btn btn-secondary btn-sm">
                    Analytics
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Open Support Flags & Subject Mastery Radar */}
        <div className="grid-2">
          <div className="card">
            <div className="card-padding" style={{ paddingBottom: 0 }}>
              <div className="section-header">
                <div>
                  <div className="section-title">
                    <Icon name="flag" size={17} style={{ color: 'var(--tint-rose-fg)' }} />
                    <span>Open Support Flags</span>
                  </div>
                  <div className="section-subtitle">Learners identified for remedial coaching</div>
                </div>
                <a href="/flags" className="btn btn-secondary btn-sm">
                  <span>View all</span>
                  <Icon name="arrowRight" size={14} />
                </a>
              </div>
            </div>
            <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
              {flags.length === 0 ? (
                <div className="empty-state">
                  <IconTile name="checkCircle" tone="emerald" size={44} />
                  <div className="empty-state-text">No open flags — all students are on track.</div>
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
                          <span className={trackColor(flag.track)}>
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
                            <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: riskColor(flag.risk_score) }}>
                              {(flag.risk_score * 100).toFixed(0)}%
                            </span>
                          </div>
                        </td>
                        <td className="truncate" style={{ maxWidth: 180, fontSize: 13 }}>
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

          {/* Cohort Subject Mastery Radar */}
          <div className="card card-padding">
            <div className="section-header">
              <div>
                <div className="section-title">
                  <Icon name="radar" size={18} style={{ color: 'var(--tint-indigo-fg)' }} />
                  <span>Cohort Subject Mastery Radar</span>
                </div>
                <div className="section-subtitle">Class-wide competency across core syllabus domains</div>
              </div>
              <a href="/analytics" className="btn btn-secondary btn-sm">
                <span>Deep Dive</span>
                <Icon name="arrowRight" size={14} />
              </a>
            </div>
            <SubjectMasteryRadar metrics={MASTERY_METRICS} />
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Admin Dashboard ───────────────────────────────────────── */
function AdminDashboard() {
  const { user } = useAuth();
  const cards: { icon: IconName; tone: 'indigo' | 'blue' | 'emerald' | 'rose' | 'amber' | 'violet'; label: string; href: string; desc: string }[] = [
    { icon: 'users',     tone: 'indigo',  label: 'Manage Users',    href: '/admin',          desc: 'View all users, assign roles, and activate or suspend accounts' },
    { icon: 'exam',      tone: 'blue',    label: 'Live Exam Room',  href: '/quiz',           desc: 'Launch the dual-pane online examination and testing workspace' },
    { icon: 'shield',    tone: 'violet',  label: 'Audit Logs',      href: '/admin#audit',    desc: 'Tamper-evident security audit trail of all privileged actions' },
    { icon: 'analytics', tone: 'emerald', label: 'Analytics',       href: '/analytics',      desc: 'Institution-wide course mastery and intervention analytics' },
    { icon: 'flag',      tone: 'rose',    label: 'Support Flags',   href: '/flags',          desc: 'All active student support flags across departments' },
    { icon: 'playbook',  tone: 'amber',   label: 'Playbooks',       href: '/playbooks',      desc: 'Faculty intervention playbooks and remedial strategies' },
  ];

  return (
    <>
      <Topbar current="Dashboard" breadcrumb="Admin Console" />
      <div className="app-content">
        <div className="hero mb-6">
          <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 16 }}>
            <div>
              <span className="badge badge-purple" style={{ marginBottom: 10 }}>System Administration</span>
              <h1 className="page-title">EduTech & Exam Platform Console</h1>
              <p className="page-subtitle" style={{ marginTop: 6 }}>
                Welcome, {user?.first_name}. Manage institutional accounts, audit trails, and live examination rooms.
              </p>
            </div>
            <a href="/quiz" className="btn btn-primary">
              <Icon name="exam" size={16} />
              <span>Enter Exam Room</span>
              <Icon name="arrowRight" size={15} />
            </a>
          </div>
        </div>

        <div className="grid-3">
          {cards.map(item => (
            <a key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
              <div className="card card-padding card-interactive" style={{ cursor: 'pointer', height: '100%' }}>
                <div style={{ marginBottom: 14 }}>
                  <IconTile name={item.icon} tone={item.tone} size={42} />
                </div>
                <div style={{ fontWeight: 700, fontSize: 15.5, color: 'var(--text-primary)', marginBottom: 6 }}>
                  {item.label}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55 }}>{item.desc}</div>
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

/* ── Main Export ───────────────────────────────────────────── */
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
