'use client';
// ============================================================
// EdCap AI — Courses Page (Faculty/Admin)
// ============================================================
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import Topbar from '@/components/Topbar';
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
        breadcrumb="Faculty"
        current="Courses"
        actions={
          <button
            id="btn-create-course"
            className="btn btn-primary btn-sm"
            onClick={() => setShowForm(v => !v)}
          >
            + New Course
          </button>
        }
      />
      <div className="app-content">
        <div className="page-header">
          <h1 className="page-title">🎓 Courses</h1>
          <p className="page-subtitle">Manage course catalogue and enrollments</p>
        </div>

        {/* Create form */}
        {showForm && (
          <div className="card card-padding mb-6" role="region" aria-label="Create new course form">
            <div className="section-title mb-4">
              <span aria-hidden="true">✏️ </span>New Course
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: '0 0 120px' }}>
                <label className="form-label" htmlFor="course-code">Course Code</label>
                <input id="course-code" className="form-input" placeholder="CS101" value={form.code}
                  onChange={e => setForm(v => ({ ...v, code: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label className="form-label" htmlFor="course-name">Name</label>
                <input id="course-name" className="form-input" placeholder="Introduction to Computer Science" value={form.name}
                  onChange={e => setForm(v => ({ ...v, name: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ flex: '2 1 300px' }}>
                <label className="form-label" htmlFor="course-description">Description</label>
                <input id="course-description" className="form-input" placeholder="Optional description" value={form.description}
                  onChange={e => setForm(v => ({ ...v, description: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="btn btn-primary" onClick={createCourse} disabled={submitting || !form.code || !form.name}>
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
              <div className="empty-state-icon" aria-hidden="true">🎓</div>
              <div className="empty-state-text">No courses yet. Create one to get started.</div>
            </div>
          </div>
        ) : (
          <div className="grid-3">
            {courses.map(c => (
              <a key={c.id} href={`/analytics?course_id=${c.id}`} style={{ textDecoration: 'none' }}>
                <div
                  className="card card-padding"
                  style={{
                    cursor: 'pointer', height: '100%',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                    (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.transform = '';
                    (e.currentTarget as HTMLElement).style.boxShadow = '';
                  }}
                >
                  <div
                    style={{
                      width: 40, height: 40, borderRadius: 'var(--radius-md)',
                      background: 'linear-gradient(135deg, var(--brand-500), var(--accent-500))',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 18, marginBottom: 12,
                    }}
                  >
                    📚
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{c.name}</div>
                  <div className="badge badge-blue" style={{ marginBottom: 8 }}>{c.code}</div>
                  {c.description && (
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 8 }}>
                      {c.description}
                    </p>
                  )}
                  <div style={{ marginTop: 12, fontSize: 12, color: 'var(--brand-400)' }}>
                    View Analytics →
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div className={`toast ${toast.includes('Failed') ? 'error' : 'success'}`} role="alert" aria-live="polite">
          <span aria-hidden="true">{toast.includes('Failed') ? '❌ ' : '✅ '}</span>{toast}
        </div>
      )}
    </AppShell>
  );
}
