'use client';
// ============================================================
// EdCap — Analytics Page (Faculty/Admin)
// ============================================================
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import Topbar from '@/components/Topbar';
import { analyticsApi, coursesApi, type CourseDetailAnalytics, type Course } from '@/lib/api';

export default function AnalyticsPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [detail, setDetail] = useState<CourseDetailAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(true);

  useEffect(() => {
    coursesApi.list()
      .then(list => {
        setCourses(list);
        if (list.length > 0) setSelected(list[0].id);
      })
      .catch(console.error)
      .finally(() => setInitLoading(false));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    analyticsApi.course(selected)
      .then(setDetail)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selected]);

  const selectedCourse = courses.find(c => c.id === selected);

  return (
    <AppShell>
      <Topbar
        breadcrumb="Faculty"
        current="Analytics"
        actions={
          <select
            id="analytics-course-select"
            className="form-input"
            aria-label="Select course for analytics"
            style={{ width: 'auto', padding: '6px 12px', fontSize: 13 }}
            value={selected}
            onChange={e => setSelected(e.target.value)}
          >
            {courses.map(c => (
              <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
            ))}
          </select>
        }
      />
      <div className="app-content">
        <div className="page-header">
          <h1 className="page-title">📊 Course Analytics</h1>
          <p className="page-subtitle">{selectedCourse?.name ?? 'Select a course'}</p>
        </div>

        {initLoading || loading ? (
          <div className="loading-center"><div className="spinner" role="status" aria-label="Loading analytics data" /></div>
        ) : detail ? (
          <>
            {/* Summary cards */}
            <div className="grid-3 mb-6">
              <div className="card card-padding">
                <div style={{ fontSize: 28, marginBottom: 4 }}>👥</div>
                <div style={{ fontSize: 32, fontWeight: 700 }} className="gradient-text">{detail.total_students}</div>
                <div className="text-muted text-sm">Enrolled Students</div>
              </div>
              <div className="card card-padding">
                <div style={{ fontSize: 28, marginBottom: 4 }}>📐</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: 'hsl(145,65%,55%)' }}>
                  {detail.topic_accuracy.length}
                </div>
                <div className="text-muted text-sm">Topics Assessed</div>
              </div>
              <div className="card card-padding">
                <div style={{ fontSize: 28, marginBottom: 4 }}>📉</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: 'hsl(355,75%,65%)' }}>
                  {detail.topic_accuracy.filter(t => t.avg_accuracy_pct < 50).length}
                </div>
                <div className="text-muted text-sm">Topics Below 50% Accuracy</div>
              </div>
            </div>

            <div className="grid-2">
              {/* Topic accuracy */}
              <div className="card card-padding">
                <div className="section-header">
                  <div className="section-title">📐 Topic Accuracy</div>
                  <span className="badge badge-gray">{detail.topic_accuracy.length} topics</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {detail.topic_accuracy.length === 0 ? (
                    <div className="empty-state"><div className="empty-state-icon">📊</div><div className="empty-state-text">No data yet</div></div>
                  ) : detail.topic_accuracy.map(t => (
                    <div key={t.topic_id}>
                      <div className="flex items-center justify-between mb-4" style={{ marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{t.topic_name}</span>
                        <span
                          style={{
                            fontSize: 13, fontWeight: 700,
                            color: t.avg_accuracy_pct < 50 ? 'hsl(355,75%,65%)' :
                                   t.avg_accuracy_pct < 70 ? 'hsl(35,90%,65%)' : 'hsl(145,65%,55%)',
                          }}
                        >
                          {t.avg_accuracy_pct.toFixed(1)}%
                        </span>
                      </div>
                      <div
                        className="progress-bar"
                        role="progressbar"
                        aria-valuenow={Math.round(t.avg_accuracy_pct)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Average accuracy for topic ${t.topic_name}: ${t.avg_accuracy_pct.toFixed(1)}%`}
                      >
                        <div
                          className="progress-fill"
                          style={{
                            width: `${t.avg_accuracy_pct}%`,
                            background: t.avg_accuracy_pct < 50
                              ? 'linear-gradient(90deg,hsl(355,75%,55%),hsl(35,90%,55%))'
                              : t.avg_accuracy_pct < 70
                              ? 'linear-gradient(90deg,hsl(40,90%,55%),hsl(145,65%,45%))'
                              : 'linear-gradient(90deg,var(--brand-500),var(--accent-400))',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Student breakdown */}
              <div className="card">
                <div className="card-padding" style={{ paddingBottom: 0 }}>
                  <div className="section-header">
                    <div className="section-title">🧑‍🎓 Student Breakdown</div>
                  </div>
                </div>
                <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
                  {detail.student_profiles.length === 0 ? (
                    <div className="empty-state"><div className="empty-state-icon" aria-hidden="true">👥</div><div className="empty-state-text">No students enrolled</div></div>
                  ) : (
                    <table>
                      <caption className="sr-only">Student performance and engagement breakdown</caption>
                      <thead>
                        <tr>
                          <th>Student</th>
                          <th>Streak</th>
                          <th>Flags</th>
                          <th>Last Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.student_profiles.map(s => {
                          const lastScore = s.recent_scores?.[0];
                          return (
                            <tr key={s.student_id}>
                              <td className="td-primary">
                                <div className="flex items-center gap-2">
                                  <div className="avatar avatar-sm">
                                    {s.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                  </div>
                                  {s.name}
                                </div>
                              </td>
                              <td>
                                {s.current_streak > 0
                                  ? <span style={{ color: 'hsl(35,90%,65%)', fontWeight: 600 }}>🔥 {s.current_streak}</span>
                                  : <span className="text-muted">—</span>}
                              </td>
                              <td>
                                {s.open_flags > 0
                                  ? <span className="badge badge-red">{s.open_flags}</span>
                                  : <span className="badge badge-green">0</span>}
                              </td>
                              <td>
                                {lastScore
                                  ? <span style={{ fontWeight: 600, color: lastScore.pct < 50 ? 'hsl(355,75%,65%)' : 'var(--text-primary)' }}>
                                      {lastScore.pct}%
                                    </span>
                                  : <span className="text-muted">—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">📊</div>
            <div className="empty-state-text">Select a course to view analytics</div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
