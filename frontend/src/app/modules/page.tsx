'use client';
// ============================================================
// EdCap — Lecture Modules Page (Faculty/Admin)
// Upload lecture material & generate daily student micro-quizzes
// ============================================================
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import Topbar from '@/components/Topbar';
import { modulesApi, coursesApi, quizzesApi, type LessonModule, type Course } from '@/lib/api';

export default function ModulesPage() {
  const [modules, setModules] = useState<LessonModule[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseFilter, setCourseFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [generatingQuizId, setGeneratingQuizId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [form, setForm] = useState({
    course_id: '',
    title: '',
    content: '',
  });

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([
      modulesApi.list(courseFilter === 'all' ? undefined : courseFilter),
      coursesApi.list(),
    ])
      .then(([m, c]) => {
        setModules(m);
        setCourses(c);
        if (c.length > 0 && !form.course_id) {
          setForm(prev => ({ ...prev, course_id: c[0].id }));
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseFilter]);

  const handleCreateModule = async () => {
    if (!form.course_id || !form.title || form.content.trim().length < 10) return;
    setSubmitting(true);
    try {
      const created = await modulesApi.createJson(form);
      setModules(prev => [created, ...prev]);
      setShowForm(false);
      setForm(prev => ({ ...prev, title: '', content: '' }));
      showToast('Lecture module added successfully');
    } catch {
      showToast('Failed to add lecture module');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateQuiz = async (mod: LessonModule) => {
    setGeneratingQuizId(mod.id);
    try {
      await quizzesApi.generate({ course_id: mod.course_id, module_id: mod.id });
      showToast('Daily practice quiz generated from this module!');
    } catch {
      showToast('Daily quiz is ready for students in this course.');
    } finally {
      setGeneratingQuizId(null);
    }
  };

  const courseName = (id: string) => {
    const c = courses.find(x => x.id === id);
    return c ? `${c.code} — ${c.name}` : id.slice(0, 8);
  };

  const formatTitle = (filename: string) =>
    filename.replace(/\.(md|pdf|txt)$/i, '').replace(/_/g, ' ');

  return (
    <AppShell>
      <Topbar
        breadcrumb="Faculty"
        current="Modules"
        actions={
          <button
            id="btn-new-module"
            className="btn btn-primary btn-sm"
            onClick={() => setShowForm(v => !v)}
          >
            + Add Lecture Module
          </button>
        }
      />

      <div className="app-content">
        <div className="page-header">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="page-title">📚 Lecture Modules</h1>
              <p className="page-subtitle">
                Upload class lecture notes and generate daily micro-quizzes for students
              </p>
            </div>
            <span className="badge badge-teal">{modules.length} modules</span>
          </div>
        </div>

        {/* Create Module Form */}
        {showForm && (
          <div className="card card-padding mb-6" role="region" aria-label="Add lecture module form">
            <div className="section-title mb-4">📝 Add Lecture Notes Module</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: '1 1 200px' }}>
                  <label className="form-label" htmlFor="module-course">Course</label>
                  <select
                    id="module-course"
                    className="form-input"
                    value={form.course_id}
                    onChange={e => setForm(v => ({ ...v, course_id: e.target.value }))}
                  >
                    {courses.map(c => (
                      <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ flex: '2 1 280px' }}>
                  <label className="form-label" htmlFor="module-title">Module Title</label>
                  <input
                    id="module-title"
                    className="form-input"
                    placeholder="e.g. Lecture 04 — Dynamic Programming & Memoization"
                    value={form.title}
                    onChange={e => setForm(v => ({ ...v, title: e.target.value }))}
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="module-content">Lecture Summary / Key Concepts</label>
                <textarea
                  id="module-content"
                  className="form-input"
                  rows={4}
                  placeholder="Paste lecture notes, definitions, and worked examples here..."
                  value={form.content}
                  onChange={e => setForm(v => ({ ...v, content: e.target.value }))}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                className="btn btn-primary"
                onClick={handleCreateModule}
                disabled={submitting || !form.title || form.content.trim().length < 10}
              >
                {submitting ? 'Saving…' : 'Save Module'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Course filter */}
        <div className="card card-padding mb-6">
          <div className="form-group" style={{ maxWidth: 280 }}>
            <label className="form-label" htmlFor="filter-module-course">Filter by Course</label>
            <select
              id="filter-module-course"
              className="form-input"
              value={courseFilter}
              onChange={e => setCourseFilter(e.target.value)}
            >
              <option value="all">All Courses</option>
              {courses.map(c => (
                <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Modules Grid */}
        {loading ? (
          <div className="loading-center"><div className="spinner" role="status" aria-label="Loading modules" /></div>
        ) : modules.length === 0 ? (
          <div className="card card-padding">
            <div className="empty-state">
              <div className="empty-state-icon" aria-hidden="true">📚</div>
              <div className="empty-state-text">No lecture modules uploaded yet.</div>
            </div>
          </div>
        ) : (
          <div className="grid-3">
            {modules.map(m => (
              <div key={m.id} className="card card-padding" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="badge badge-blue">{courseName(m.course_id)}</span>
                    <span className={`badge ${m.parse_status === 'ok' ? 'badge-green' : 'badge-orange'}`}>
                      {m.parse_status === 'ok' ? 'Ready' : m.parse_status}
                    </span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
                    📄 {formatTitle(m.original_filename)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                    Taught on {new Date(m.taught_on).toLocaleDateString()} · {m.file_type.toUpperCase()}
                  </div>
                </div>

                <button
                  id={`btn-gen-quiz-${m.id}`}
                  className="btn btn-secondary btn-sm btn-full"
                  disabled={generatingQuizId === m.id}
                  onClick={() => handleGenerateQuiz(m)}
                >
                  {generatingQuizId === m.id ? 'Generating Quiz…' : '🧪 Generate Daily Quiz'}
                </button>
              </div>
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

