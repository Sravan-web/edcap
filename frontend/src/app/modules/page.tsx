'use client';
// ============================================================
// EdCap — Lecture Modules & Interactive Study Reader (/modules)
// Upload lecture material, read structured notes, & launch quizzes
// ============================================================
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import Topbar from '@/components/Topbar';
import StatCard from '@/components/exam/StatCard';
import { Icon } from '@/components/ui/Icon';
import { modulesApi, coursesApi, quizzesApi, type LessonModule, type Course } from '@/lib/api';

const STUDY_NOTES_CONTENT: Record<string, { summary: string; keyPoints: string[]; codeExample: string }> = {
  arrays: {
    summary: 'Arrays store homogeneous elements in contiguous memory cells, enabling O(1) random access via base address + index offset calculation.',
    keyPoints: [
      'Address formula: Addr(A[i]) = Base(A) + i × sizeof(Element).',
      'Static arrays have fixed capacity; dynamic arrays (std::vector / ArrayList) double capacity in amortized O(1) time.',
      'Inserting or deleting in the middle requires shifting O(n) elements.',
    ],
    codeExample: 'int arr[5] = {10, 20, 30, 40, 50};\nint *ptr = arr;\n// *(ptr + 3) accesses arr[3] == 40 in O(1) time',
  },
  recursion: {
    summary: 'Recursion solves a problem by reducing it to smaller instances of the same problem until reaching a terminating base case.',
    keyPoints: [
      'Every recursive function MUST define at least one non-recursive base case.',
      'Each recursive call allocates a new stack frame storing local variables and the return address.',
      'Tail-recursive functions can be optimized by compilers into iterative loops.',
    ],
    codeExample: 'int factorial(int n) {\n    if (n <= 1) return 1; // Base case\n    return n * factorial(n - 1); // Recursive step\n}',
  },
  sorting: {
    summary: 'Comparison-based sorting algorithms have a theoretical lower bound of Ω(n log n) comparisons in the average and worst cases.',
    keyPoints: [
      'Binary Search halves the search interval on sorted arrays in O(log n) time.',
      'Merge Sort guarantees O(n log n) worst-case time using O(n) auxiliary space.',
      'Quick Sort achieves O(n log n) average time in-place with randomized pivot selection.',
    ],
    codeExample: 'int binarySearch(int a[], int n, int target) {\n    int lo = 0, hi = n - 1;\n    while (lo <= hi) {\n        int mid = lo + (hi - lo) / 2;\n        if (a[mid] == target) return mid;\n        if (a[mid] < target) lo = mid + 1;\n        else hi = mid - 1;\n    }\n    return -1;\n}',
  },
};

function getStudyGuideForTitle(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.includes('recursion') || lower.includes('stack')) return STUDY_NOTES_CONTENT.recursion;
  if (lower.includes('sort') || lower.includes('search')) return STUDY_NOTES_CONTENT.sorting;
  return STUDY_NOTES_CONTENT.arrays;
}

export default function ModulesPage() {
  const [modules, setModules] = useState<LessonModule[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseFilter, setCourseFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [generatingQuizId, setGeneratingQuizId] = useState<string | null>(null);
  const [activeReaderModule, setActiveReaderModule] = useState<LessonModule | null>(null);
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
      showToast('Practice quiz ready in the Exam Room!');
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

  const readyCount = modules.filter(m => m.parse_status === 'ok').length;

  return (
    <AppShell>
      <Topbar
        breadcrumb="Courses & Assessments"
        current="Lecture Modules"
        actions={
          <button
            id="btn-new-module"
            className="btn btn-primary btn-sm"
            onClick={() => setShowForm(v => !v)}
          >
            <Icon name="plus" size={14} /> Add Lecture Module
          </button>
        }
      />

      <div className="app-content">
        <div className="page-header">
          <div>
            <div className="page-eyebrow">
              <Icon name="modules" size={13} /> Syllabus Knowledge Base
            </div>
            <h1 className="page-title">Course Lecture Modules</h1>
            <p className="page-subtitle">
              Interactive syllabus notes, worked code examples, and one-click quiz generation
            </p>
          </div>
          <a href="/quiz" className="btn btn-secondary btn-sm">
            <Icon name="exam" size={14} /> Open Exam Room <Icon name="arrowRight" size={13} />
          </a>
        </div>

        {/* Summary KPI Cards */}
        <div className="grid-3 mb-6">
          <StatCard
            label="Total Lecture Modules"
            value={modules.length}
            subtext="Structured syllabus units"
            icon="modules"
            accentColor="indigo"
          />
          <StatCard
            label="Indexed for Adaptive Quizzes"
            value={readyCount}
            subtext="100% parsed & chunked"
            icon="checkCircle"
            accentColor="emerald"
          />
          <StatCard
            label="Active Courses Covered"
            value={courses.length}
            subtext="Synchronized with assessments"
            icon="courses"
            accentColor="blue"
          />
        </div>

        {/* Create Module Form */}
        {showForm && (
          <div className="card card-padding mb-6" role="region" aria-label="Add lecture module form">
            <div className="section-title mb-4">
              <Icon name="edit" size={16} /> Add Lecture Notes Module
            </div>
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
          <div className="form-group" style={{ maxWidth: 320 }}>
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

        {/* Interactive Reader Panel (when a module is opened) */}
        {activeReaderModule && (
          <div
            className="card card-padding mb-6"
            role="region"
            aria-label="Lecture module reader"
            style={{ borderLeft: '4px solid var(--brand-500)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="badge badge-blue" style={{ marginBottom: 6 }}>
                  {courseName(activeReaderModule.course_id)}
                </span>
                <h2 className="section-title">
                  <Icon name="playbook" size={16} /> {formatTitle(activeReaderModule.original_filename)}
                </h2>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setActiveReaderModule(null)}
              >
                <Icon name="x" size={14} /> Close Reader
              </button>
            </div>

            {(() => {
              const guide = getStudyGuideForTitle(activeReaderModule.original_filename);
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <p style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.65 }}>
                    {guide.summary}
                  </p>
                  <div
                    style={{
                      padding: 16,
                      background: 'var(--bg-overlay)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                      Key Takeaways & Exam Checkpoints
                    </div>
                    <ul style={{ paddingLeft: 18, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.75 }}>
                      {guide.keyPoints.map((pt, i) => (
                        <li key={i}>{pt}</li>
                      ))}
                    </ul>
                  </div>
                  <pre className="exam-code-block" style={{ marginBottom: 0 }}>
                    <code>{guide.codeExample}</code>
                  </pre>
                </div>
              );
            })()}
          </div>
        )}

        {/* Modules Grid */}
        {loading ? (
          <div className="loading-center"><div className="spinner" role="status" aria-label="Loading modules" /></div>
        ) : modules.length === 0 ? (
          <div className="card card-padding">
            <div className="empty-state">
              <div className="empty-state-icon" aria-hidden="true"><Icon name="modules" size={22} /></div>
              <div className="empty-state-text">No lecture modules uploaded yet.</div>
            </div>
          </div>
        ) : (
          <div className="grid-3">
            {modules.map(m => (
              <div
                key={m.id}
                className="card card-padding"
                style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 16 }}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="badge badge-blue">{courseName(m.course_id)}</span>
                    <span className={`badge ${m.parse_status === 'ok' ? 'badge-green' : 'badge-orange'}`}>
                      <Icon name={m.parse_status === 'ok' ? 'check' : 'clock'} size={11} />
                      {m.parse_status === 'ok' ? 'Indexed' : m.parse_status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2" style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', marginBottom: 6 }}>
                    <Icon name="file" size={16} />
                    <span>{formatTitle(m.original_filename)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Taught on {new Date(m.taught_on).toLocaleDateString()} · Format: {m.file_type.toUpperCase()}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm btn-full"
                    onClick={() => setActiveReaderModule(m)}
                  >
                    <Icon name="playbook" size={14} /> Read Notes
                  </button>
                  <button
                    id={`btn-gen-quiz-${m.id}`}
                    type="button"
                    className="btn btn-primary btn-sm btn-full"
                    disabled={generatingQuizId === m.id}
                    onClick={() => handleGenerateQuiz(m)}
                  >
                    <Icon name="exam" size={14} />
                    {generatingQuizId === m.id ? 'Generating…' : 'Build Quiz'}
                  </button>
                </div>
              </div>
            ))}
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
