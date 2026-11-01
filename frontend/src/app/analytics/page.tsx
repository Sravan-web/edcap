'use client';
// ============================================================
// EdCap — Analytics Page (Faculty/Admin)
// ============================================================
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import Topbar from '@/components/Topbar';
import StatCard from '@/components/exam/StatCard';
import { Icon, IconTile } from '@/components/ui/Icon';
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
            style={{ width: 'auto', padding: '7px 12px', fontSize: 13 }}
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
          <div>
            <div className="page-eyebrow">
              <Icon name="analytics" size={13} /> Cohort Intelligence
            </div>
            <h1 className="page-title">Course Analytics</h1>
            <p className="page-subtitle">{selectedCourse ? `${selectedCourse.code} — ${selectedCourse.name}` : 'Select a course'}</p>
          </div>
        </div>

        {initLoading || loading ? (
          <div className="loading-center"><div className="spinner" role="status" aria-label="Loading analytics data" /></div>
        ) : detail ? (
          <>
            {/* Summary cards */}
            <div className="grid-3 mb-6">
              <StatCard
                label="Enrolled Students"
                value={detail.total_students}
                subtext="Active roster in this cohort"
                icon="users"
                accentColor="indigo"
              />
              <StatCard
                label="Topics Assessed"
                value={detail.topic_accuracy.length}
                subtext="Syllabus units measured"
                icon="ruler"
                accentColor="emerald"
              />
              <StatCard
                label="Topics Below 50% Mastery"
                value={detail.topic_accuracy.filter(t => t.avg_accuracy_pct < 50).length}
                subtext="Require targeted remedial intervention"
                icon="trendingDown"
                accentColor="rose"
              />
            </div>

            <div className="grid-2">
              {/* Topic accuracy */}
              <div className="card card-padding">
                <div className="section-header">
                  <div>
                    <div className="section-title">
                      <Icon name="ruler" size={16} /> Syllabus Topic Mastery
                    </div>
                    <div className="section-subtitle">Class-wide accuracy distribution by unit</div>
                  </div>
                  <span className="badge badge-gray">{detail.topic_accuracy.length} topics</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {detail.topic_accuracy.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-state-icon"><Icon name="analytics" size={22} /></div>
                      <div className="empty-state-text">No topic mastery data recorded yet</div>
                    </div>
                  ) : detail.topic_accuracy.map(t => (
                    <div key={t.topic_id}>
                      <div className="flex items-center justify-between mb-4" style={{ marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{t.topic_name}</span>
                        <span
                          className="font-mono"
                          style={{
                            fontSize: 13, fontWeight: 700,
                            color: t.avg_accuracy_pct < 50 ? 'var(--danger)' :
                                   t.avg_accuracy_pct < 70 ? 'var(--warning)' : 'var(--success)',
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
                              ? 'var(--danger)'
                              : t.avg_accuracy_pct < 70
                              ? 'var(--warning)'
                              : 'var(--success)',
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
                    <div>
                      <div className="section-title">
                        <Icon name="users" size={16} /> Student Roster & Scores
                      </div>
                      <div className="section-subtitle">Individual streak, open flags, and latest exam performance</div>
                    </div>
                  </div>
                </div>
                <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
                  {detail.student_profiles.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-state-icon" aria-hidden="true"><Icon name="users" size={22} /></div>
                      <div className="empty-state-text">No students enrolled</div>
                    </div>
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
                                {s.current_streak > 0 ? (
                                  <span className="badge badge-orange">
                                    <Icon name="flame" size={12} /> {s.current_streak}d
                                  </span>
                                ) : (
                                  <span className="text-muted">—</span>
                                )}
                              </td>
                              <td>
                                {s.open_flags > 0
                                  ? <span className="badge badge-red">{s.open_flags}</span>
                                  : <span className="badge badge-green">0</span>}
                              </td>
                              <td>
                                {lastScore
                                  ? <span className="font-mono" style={{ fontWeight: 700, color: lastScore.pct < 50 ? 'var(--danger)' : 'var(--text-primary)' }}>
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
            <div className="empty-state-icon"><IconTile name="analytics" tone="indigo" /></div>
            <div className="empty-state-text">Select a course to view analytics</div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
