'use client';
// ============================================================
// EdCap — Courses & Exam Directory Page (/courses)
// ============================================================
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import Topbar from '@/components/Topbar';
import { Icon } from '@/components/ui/Icon';
import { coursesApi, type Course } from '@/lib/api';

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    coursesApi.list().then(setCourses).catch(console.error).finally(() => setLoading(false));
  }, []);

  const createCourse = async () => {
    if (!form.code || !form.name) return;
    setSubmitting(true);
    try {
      const c = await coursesApi.create(form);
      setCourses(prev => [...prev, c]);
      setShowForm(false);
      setForm({ code: '', name: '', description: '' });
      showToast('Course created successfully');
    } catch {
      showToast('Failed to create course');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell>
      <Topbar
        breadcrumb="Courses & Assessments"
        current="Courses"
        actions={
          <button
            id="btn-create-course"
            className="btn btn-primary btn-sm"
            onClick={() => setShowForm(v => !v)}
          >
            <Icon name="plus" size={14} /> New Course
          </button>
        }
      />
      <div className="app-content">
        <div className="page-header">
          <div>
            <div className="page-eyebrow">
              <Icon name="courses" size={13} /> Academic Curriculum
            </div>
            <h1 className="page-title">Course & Examination Catalogue</h1>
            <p className="page-subtitle">Manage academic courses, syllabus modules, and online examinations</p>
          </div>
          <span className="badge badge-blue">{courses.length} active courses</span>
        </div>

        {/* Create form */}
        {showForm && (
          <div className="card card-padding mb-6" role="region" aria-label="Create new course form">
            <div className="section-title mb-4">
              <Icon name="edit" size={16} /> Create New Course
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: '0 0 130px' }}>
                <label className="form-label" htmlFor="course-code">Course Code</label>
                <input
                  id="course-code"
                  className="form-input"
                  placeholder="CS101"
                  value={form.code}
                  onChange={e => setForm(v => ({ ...v, code: e.target.value }))}
                  required
                />
              </div>
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label className="form-label" htmlFor="course-name">Name</label>
                <input
                  id="course-name"
                  className="form-input"
                  placeholder="Introduction to Computer Science"
                  value={form.name}
                  onChange={e => setForm(v => ({ ...v, name: e.target.value }))}
                  required
                />
              </div>
              <div className="form-group" style={{ flex: '2 1 300px' }}>
                <label className="form-label" htmlFor="course-description">Description</label>
                <input
                  id="course-description"
                  className="form-input"
                  placeholder="Optional description"
                  value={form.description}
                  onChange={e => setForm(v => ({ ...v, description: e.target.value }))}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                className="btn btn-primary"
                onClick={createCourse}
                disabled={submitting || !form.code || !form.name}
              >
                {submitting ? 'Creating…' : 'Create Course'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="loading-center"><div className="spinner" role="status" aria-label="Loading courses" /></div>
        ) : courses.length === 0 ? (
          <div className="card card-padding">
            <div className="empty-state">
              <div className="empty-state-icon" aria-hidden="true"><Icon name="courses" size={22} /></div>
              <div className="empty-state-text">No courses yet. Create one to get started.</div>
            </div>
          </div>
        ) : (
          <div className="grid-3">
            {courses.map((c, idx) => {
              const syllabusPct = 72 + ((idx * 9) % 22);
              return (
                <div
                  key={c.id}
                  className="card card-padding"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 16,
                  }}
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="badge badge-blue">{c.code}</span>
                      <span className="badge badge-green">
                        <Icon name="checkCircle" size={12} /> Active
                      </span>
                    </div>

                    <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--text-primary)', marginBottom: 6, letterSpacing: '-0.02em' }}>
                      {c.name}
                    </div>

                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                      {c.description || 'Core undergraduate curriculum with weekly diagnostic assessments and adaptive remedial modules.'}
                    </p>

                    <div style={{ marginTop: 14 }}>
                      <div className="flex items-center justify-between" style={{ marginBottom: 5 }}>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                          Syllabus Completion
                        </span>
                        <span className="font-mono" style={{ fontSize: 12, fontWeight: 700 }}>{syllabusPct}%</span>
                      </div>
                      <div className="progress-bar" style={{ height: 6 }}>
                        <div className="progress-fill" style={{ width: `${syllabusPct}%` }} />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2" style={{ paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                    <a
                      href={`/quiz?exam=${c.code}`}
                      className="btn btn-primary btn-sm btn-full"
                    >
                      <Icon name="exam" size={14} /> Exam Room
                    </a>
                    <a href="/modules" className="btn btn-secondary btn-sm">
                      Modules
                    </a>
                    <a href={`/analytics?course_id=${c.id}`} className="btn btn-secondary btn-sm">
                      Analytics
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
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
