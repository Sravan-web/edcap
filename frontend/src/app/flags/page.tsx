'use client';
// ============================================================
// EdCap AI — Support Flags Page (Faculty/Admin)
// ============================================================
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import Topbar from '@/components/Topbar';
import { flagsApi, coursesApi, type SupportFlag, type Course } from '@/lib/api';

const TRACKS = ['all', 'A_foundational', 'B_language', 'C_engagement', 'normal'];
const STATUSES = ['open', 'acknowledged', 'resolved', 'dismissed'];

function trackLabel(track: string) {
  const map: Record<string, string> = {
    A_foundational: '📐 Foundational',
    B_language:     '💬 Language',
    C_engagement:   '⚡ Engagement',
    normal:         '✅ Normal',
  };
  return map[track] ?? track;
}

function trackClass(track: string) {
  const map: Record<string, string> = {
    A_foundational: 'badge track-foundational',
    B_language:     'badge track-language',
    C_engagement:   'badge track-engagement',
    normal:         'badge track-normal',
  };
  return map[track] ?? 'badge badge-gray';
}

function riskColor(score: number) {
  if (score >= 0.75) return 'hsl(355,75%,65%)';
  if (score >= 0.45) return 'hsl(35,90%,65%)';
  return 'hsl(145,65%,55%)';
}

export default function FlagsPage() {
  const [flags, setFlags] = useState<SupportFlag[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [courseFilter, setCourseFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('open');
  const [trackFilter, setTrackFilter] = useState('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      flagsApi.list({
        course_id: courseFilter === 'all' ? undefined : courseFilter,
        status: statusFilter === 'all' ? undefined : statusFilter,
        track: trackFilter === 'all' ? undefined : trackFilter,
      }),
      coursesApi.list(),
    ])
      .then(([f, c]) => { setFlags(f); setCourses(c); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, [courseFilter, statusFilter, trackFilter]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const updateFlag = async (id: string, status: string) => {
    setUpdatingId(id);
    try {
      await flagsApi.update(id, { status });
      setFlags(prev => prev.map(f => f.id === id ? { ...f, status } : f));
      showToast('Flag status updated');
    } catch {
      showToast('Failed to update flag');
    } finally {
      setUpdatingId(null);
    }
  };

  const courseName = (id: string) => courses.find(c => c.id === id)?.name ?? id.slice(0, 8) + '…';

  return (
    <AppShell>
      <Topbar breadcrumb="Faculty" current="Support Flags" />
      <div className="app-content">
        <div className="page-header">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="page-title">🚩 Support Flags</h1>
              <p className="page-subtitle">At-risk student interventions detected by the rule engine and ML classifier</p>
            </div>
            <span className="badge badge-red">{flags.length} flags</span>
          </div>
        </div>

        {/* Filters */}
        <div className="card card-padding mb-6">
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ minWidth: 180 }}>
              <label className="form-label" htmlFor="flags-course">Course</label>
              <select id="flags-course" className="form-input" value={courseFilter} onChange={e => setCourseFilter(e.target.value)}>
                <option value="all">All Courses</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ minWidth: 140 }}>
              <label className="form-label" htmlFor="flags-status">Status</label>
              <select id="flags-status" className="form-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="all">All Statuses</option>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ minWidth: 160 }}>
              <label className="form-label" htmlFor="flags-track">Track</label>
              <select id="flags-track" className="form-input" value={trackFilter} onChange={e => setTrackFilter(e.target.value)}>
                {TRACKS.map(t => <option key={t} value={t}>{t === 'all' ? 'All Tracks' : trackLabel(t)}</option>)}
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="loading-center"><div className="spinner" role="status" aria-label="Loading support flags" /></div>
        ) : flags.length === 0 ? (
          <div className="card card-padding">
            <div className="empty-state">
              <div className="empty-state-icon" aria-hidden="true">✅</div>
              <div className="empty-state-text">No flags match the current filters</div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {flags.map(flag => (
              <div
                key={flag.id}
                className="card card-padding"
                style={{
                  borderLeft: `3px solid ${
                    flag.track === 'A_foundational' ? 'var(--track-foundational)' :
                    flag.track === 'B_language'     ? 'var(--track-language)' :
                    flag.track === 'C_engagement'   ? 'var(--track-engagement)' :
                    'var(--track-normal)'
                  }`,
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={trackClass(flag.track)}>{trackLabel(flag.track)}</span>
                    <span className={`badge ${flag.status === 'open' ? 'badge-red' : flag.status === 'resolved' ? 'badge-green' : 'badge-gray'}`}>
                      {flag.status}
                    </span>
                    <span className="badge badge-blue">{courseName(flag.course_id)}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div
                      className="risk-bar"
                      style={{ width: 120 }}
                      role="progressbar"
                      aria-valuenow={Math.round(flag.risk_score * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Risk score: ${Math.round(flag.risk_score * 100)}%`}
                    >
                      <div className="risk-bar-track">
                        <div
                          className="risk-bar-fill"
                          style={{
                            width: `${(flag.risk_score * 100).toFixed(0)}%`,
                            background: riskColor(flag.risk_score),
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: riskColor(flag.risk_score), minWidth: 36 }}>
                        {(flag.risk_score * 100).toFixed(0)}%
                      </span>
                    </div>

                    {/* Quick actions */}
                    {flag.status === 'open' && (
                      <>
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={updatingId === flag.id}
                          onClick={() => updateFlag(flag.id, 'acknowledged')}
                        >
                          Acknowledge
                        </button>
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={updatingId === flag.id}
                          onClick={() => updateFlag(flag.id, 'resolved')}
                        >
                          Resolve
                        </button>
                      </>
                    )}
                    {flag.status === 'acknowledged' && (
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={updatingId === flag.id}
                        onClick={() => updateFlag(flag.id, 'resolved')}
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                </div>

                {/* Reasons */}
                {Array.isArray(flag.reasons) && flag.reasons.length > 0 && (
                  <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {flag.reasons.map((r, i) => (
                      <span
                        key={i}
                        style={{
                          padding: '3px 10px', fontSize: 12,
                          background: 'var(--bg-overlay)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-full)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                )}

                {/* SHAP features */}
                {flag.top_features && typeof flag.top_features === 'object' && !Array.isArray(flag.top_features) && Object.keys(flag.top_features).length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-disabled)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                      ML Feature Contributions
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {Object.entries(flag.top_features).slice(0, 4).map(([feat, val]) => {
                        const numVal = Number(val) || 0;
                        return (
                          <div key={feat} className="flex items-center gap-2">
                            <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 180, fontFamily: 'var(--font-mono)' }}>{feat}</span>
                            <div className="risk-bar-track" style={{ flex: 1 }}>
                              <div
                                className="risk-bar-fill"
                                style={{
                                  width: `${Math.min(Math.abs(numVal) * 100, 100).toFixed(0)}%`,
                                  background: numVal > 0 ? 'var(--danger)' : 'var(--success)',
                                }}
                              />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 600, minWidth: 40, textAlign: 'right', color: numVal > 0 ? 'hsl(355,75%,65%)' : 'hsl(145,65%,55%)' }}>
                              {numVal.toFixed(2)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-disabled)' }}>
                  Created {new Date(flag.created_at).toLocaleString()} · ID {flag.id.slice(0, 8)}
                </div>
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
