'use client';
// ============================================================
// EdCap — Assessments Page (Faculty/Admin)
// Manage assessments, upload CSV score sheets, & create tests
// ============================================================
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import Topbar from '@/components/Topbar';
import { Icon } from '@/components/ui/Icon';
import SlowLearnerDiagnosticPanel from '@/components/diagnostics/SlowLearnerDiagnosticPanel';
import { assessmentsApi, coursesApi, studentsApi, type Assessment, type Course } from '@/lib/api';

export default function AssessmentsPage() {
  const [viewTab, setViewTab] = useState<'diagnostics' | 'assessments'>('diagnostics');
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseFilter, setCourseFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingCsv, setUploadingCsv] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [form, setForm] = useState({
    course_id: '',
    title: '',
    topic_tag: 'arrays',
    assessment_date: new Date().toISOString().split('T')[0],
  });

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = () => {
    setLoading(true);
    Promise.all([
      assessmentsApi.list(courseFilter === 'all' ? undefined : courseFilter),
      coursesApi.list(),
    ])
      .then(([a, c]) => {
        setAssessments(a);
        setCourses(c);
        if (c.length > 0 && !form.course_id) {
          setForm(prev => ({ ...prev, course_id: c[0].id }));
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseFilter]);

  const handleCreate = async () => {
    if (!form.course_id || !form.title || !form.topic_tag) return;
    setSubmitting(true);
    try {
      const created = await assessmentsApi.create(form);
      setAssessments(prev => [created, ...prev]);
      setShowForm(false);
      setForm(prev => ({ ...prev, title: '' }));
      showToast('Assessment created successfully');
    } catch {
      showToast('Failed to create assessment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetCourseId = courseFilter !== 'all' ? courseFilter : courses[0]?.id;
    if (!file || !targetCourseId) return;

    setUploadingCsv(true);
    try {
      const res = await studentsApi.bulkUpload(file, targetCourseId);
      showToast(
        `Imported ${res.successful} students (${res.slow_learners_count} Slow Learners tagged for remedial quiz)`
      );
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to upload Excel/CSV file';
      showToast(msg);
    } finally {
      setUploadingCsv(false);
      e.target.value = '';
    }
  };

  const courseName = (id: string) => {
    const c = courses.find(x => x.id === id);
    return c ? `${c.code} — ${c.name}` : id.slice(0, 8);
  };

  return (
    <AppShell>
      <Topbar
        breadcrumb="Faculty"
        current="Assessments"
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <a
              href={studentsApi.templateUrl('xlsx')}
              download="EdCap_Student_Bulk_Template.xlsx"
              className="btn btn-secondary btn-sm"
            >
              <Icon name="download" size={14} /> Excel Template (.xlsx)
            </a>
            <label
              htmlFor="csv-upload-input"
              className="btn btn-secondary btn-sm"
              style={{ cursor: uploadingCsv ? 'wait' : 'pointer', margin: 0 }}
            >
              <Icon name="upload" size={14} />
              <span>{uploadingCsv ? 'Uploading…' : 'Bulk Upload (.xlsx/.csv)'}</span>
              <input
                id="csv-upload-input"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleCsvUpload}
                disabled={uploadingCsv}
                style={{ display: 'none' }}
              />
            </label>
            <button
              id="btn-new-assessment"
              className="btn btn-primary btn-sm"
              onClick={() => setShowForm(v => !v)}
            >
              <Icon name="plus" size={14} /> New Assessment
            </button>
          </div>
        }
      />

      <div className="app-content">
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 12 }}>
          <button
            type="button"
            className={`btn btn-sm ${viewTab === 'diagnostics' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setViewTab('diagnostics')}
          >
            <Icon name="analytics" size={14} />
            <span>Slow Learner Diagnostics &amp; ML</span>
          </button>
          <button
            type="button"
            className={`btn btn-sm ${viewTab === 'assessments' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setViewTab('assessments')}
          >
            <Icon name="assessments" size={14} />
            <span>Course Assessments &amp; CSV Scores</span>
          </button>
        </div>

        {viewTab === 'diagnostics' ? (
          <SlowLearnerDiagnosticPanel
            courses={courses}
            activeCourseId={courseFilter !== 'all' ? courseFilter : courses[0]?.id || ''}
            onCourseChange={id => setCourseFilter(id)}
            showToast={showToast}
          />
        ) : (
          <>
            <div className="page-header">
              <div>
                <div className="page-eyebrow">
                  <Icon name="assessments" size={13} /> Evaluation Registry
                </div>
                <h1 className="page-title">Assessments</h1>
                <p className="page-subtitle">
                  Record class tests and import score sheets to automatically identify students needing early support
                </p>
              </div>
              <span className="badge badge-blue">{assessments.length} assessments</span>
            </div>

            {/* Create Assessment Form */}
            {showForm && (
              <div className="card card-padding mb-6" role="region" aria-label="New assessment form">
                <div className="section-title mb-4">
                  <Icon name="edit" size={16} /> Create Assessment
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ flex: '1 1 200px' }}>
                    <label className="form-label" htmlFor="assessment-course">Course</label>
                    <select
                      id="assessment-course"
                      className="form-input"
                      value={form.course_id}
                      onChange={e => setForm(v => ({ ...v, course_id: e.target.value }))}
                    >
                      {courses.map(c => (
                        <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: '2 1 220px' }}>
                    <label className="form-label" htmlFor="assessment-title">Assessment Title</label>
                    <input
                      id="assessment-title"
                      className="form-input"
                      placeholder="e.g. Weekly Quiz 9 — Trees & Graphs"
                      value={form.title}
                      onChange={e => setForm(v => ({ ...v, title: e.target.value }))}
                    />
                  </div>
                  <div className="form-group" style={{ flex: '1 1 150px' }}>
                    <label className="form-label" htmlFor="assessment-topic">Syllabus Topic Tag</label>
                    <input
                      id="assessment-topic"
                      className="form-input"
                      placeholder="e.g. recursion, arrays, sorting"
                      value={form.topic_tag}
                      onChange={e => setForm(v => ({ ...v, topic_tag: e.target.value }))}
                    />
                  </div>
                  <div className="form-group" style={{ flex: '1 1 150px' }}>
                    <label className="form-label" htmlFor="assessment-date">Date</label>
                    <input
                      id="assessment-date"
                      type="date"
                      className="form-input"
                      value={form.assessment_date}
                      onChange={e => setForm(v => ({ ...v, assessment_date: e.target.value }))}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                  <button
                    className="btn btn-primary"
                    onClick={handleCreate}
                    disabled={submitting || !form.title || !form.course_id}
                  >
                    {submitting ? 'Saving…' : 'Save Assessment'}
                  </button>
                  <button className="btn btn-ghost" onClick={() => setShowForm(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Filter Bar */}
            <div className="card card-padding mb-6">
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ minWidth: 240 }}>
                  <label className="form-label" htmlFor="filter-assessment-course">Filter by Course</label>
                  <select
                    id="filter-assessment-course"
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
            </div>

            {/* Assessments Table */}
            {loading ? (
              <div className="loading-center"><div className="spinner" role="status" aria-label="Loading assessments" /></div>
            ) : assessments.length === 0 ? (
              <div className="card card-padding">
                <div className="empty-state">
                  <div className="empty-state-icon" aria-hidden="true"><Icon name="assessments" size={22} /></div>
                  <div className="empty-state-text">No assessments found for this selection.</div>
                </div>
              </div>
            ) : (
              <div className="card">
                <div className="table-wrapper" style={{ border: 'none' }}>
                  <table>
                    <caption className="sr-only">Course assessments table</caption>
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Course</th>
                        <th>Topic</th>
                        <th>Date</th>
                        <th>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assessments.map(a => (
                        <tr key={a.id}>
                          <td className="td-primary">{a.title}</td>
                          <td>
                            <span className="badge badge-blue">{courseName(a.course_id)}</span>
                          </td>
                          <td>
                            <span className="badge badge-teal">{a.topic_tag.replace(/_/g, ' ')}</span>
                          </td>
                          <td style={{ fontSize: 13 }}>
                            {new Date(a.assessment_date).toLocaleDateString()}
                          </td>
                          <td>
                            <span className="badge badge-gray">
                              {a.source === 'csv_import' ? 'CSV Import' : 'Recorded'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {toast && (
        <div className={`toast ${toast.includes('Failed') || toast.includes('failed') ? 'error' : 'success'}`} role="alert" aria-live="polite">
          <Icon name={toast.includes('Failed') || toast.includes('failed') ? 'xCircle' : 'checkCircle'} size={15} />
          <span>{toast}</span>
        </div>
      )}
    </AppShell>
  );
}
