'use client';
// ============================================================
// EdCap AI — Playbooks Page (Faculty)
// RAG-generated intervention plans with pedagogical strategies
// ============================================================
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import Topbar from '@/components/Topbar';
import { playbooksApi, flagsApi, type Playbook, type SupportFlag } from '@/lib/api';

export default function PlaybooksPage() {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [openFlags, setOpenFlags] = useState<SupportFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    Promise.all([
      playbooksApi.list(),
      flagsApi.list({ status: 'open' }),
    ])
      .then(([p, f]) => { setPlaybooks(p); setOpenFlags(f); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const generatePlaybook = async (flagId: string) => {
    setGenerating(flagId);
    try {
      const pb = await playbooksApi.create(flagId);
      setPlaybooks(prev => [pb, ...prev]);
      showToast('Playbook generated successfully');
    } catch {
      showToast('Failed to generate playbook. Check LLM configuration.');
    } finally {
      setGenerating(null);
    }
  };

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

  const coveredFlagIds = new Set(playbooks.map(p => p.flag_id));
  const uncoveredFlags = openFlags.filter(f => !coveredFlagIds.has(f.id));

  return (
    <AppShell>
      <Topbar breadcrumb="Faculty" current="Playbooks" />
      <div className="app-content">
        <div className="page-header">
          <h1 className="page-title">📖 Intervention Playbooks</h1>
          <p className="page-subtitle">
            AI-generated pedagogical intervention plans backed by 30+ research strategies
          </p>
        </div>

        {loading ? (
          <div className="loading-center"><div className="spinner" role="status" aria-label="Loading playbooks" /></div>
        ) : (
          <>
            {/* Flags needing playbooks */}
            {uncoveredFlags.length > 0 && (
              <div className="card card-padding mb-6">
                <div className="section-title mb-4">🚩 Flags Without Playbooks</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {uncoveredFlags.map(f => (
                    <div
                      key={f.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '12px 16px',
                        background: 'var(--bg-overlay)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <span className={trackClass(f.track)}>{trackLabel(f.track)}</span>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1 }}>
                        Risk: {(f.risk_score * 100).toFixed(0)}% · {Array.isArray(f.reasons) ? (f.reasons[0] ?? '') : ''}
                      </span>
                      <button
                        id={`btn-gen-playbook-${f.id}`}
                        className="btn btn-primary btn-sm"
                        disabled={generating === f.id}
                        onClick={() => generatePlaybook(f.id)}
                      >
                        {generating === f.id
                          ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Generating…</>
                          : '✨ Generate Playbook'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Existing playbooks */}
            {playbooks.length === 0 ? (
              <div className="card card-padding">
                <div className="empty-state">
                  <div className="empty-state-icon">📖</div>
                  <div className="empty-state-text">
                    No playbooks yet. Generate one for an open support flag above.
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {playbooks.map(pb => {
                  const flag = openFlags.find(f => f.id === pb.flag_id);
                  const content = pb.content as Record<string, unknown>;
                  const isExpanded = expanded === pb.id;

                  return (
                    <div key={pb.id} className="card">
                      <button
                        type="button"
                        className="card-padding"
                        style={{ width: '100%', textAlign: 'left', background: 'none', cursor: 'pointer' }}
                        onClick={() => setExpanded(isExpanded ? null : pb.id)}
                        aria-expanded={isExpanded}
                        aria-controls={`playbook-content-${pb.id}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span style={{ fontSize: 24 }} aria-hidden="true">
                              {flag?.track === 'A_foundational' ? '📐' :
                               flag?.track === 'B_language'     ? '💬' :
                               flag?.track === 'C_engagement'   ? '⚡' : '📖'}
                            </span>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>
                                {flag ? trackLabel(flag.track) : 'Playbook'} Intervention Plan
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                                Generated {new Date(pb.created_at).toLocaleDateString()} ·
                                {pb.approved_by ? ' ✅ Approved' : ' Pending approval'}
                              </div>
                            </div>
                          </div>
                          <span style={{ color: 'var(--text-muted)', fontSize: 18, transform: isExpanded ? 'rotate(180deg)' : '', transition: '0.2s' }} aria-hidden="true">▾</span>
                        </div>
                      </button>

                      {isExpanded && (
                        <div
                          id={`playbook-content-${pb.id}`}
                          role="region"
                          aria-label={`${flag ? trackLabel(flag.track) : 'Playbook'} details`}
                          style={{
                            padding: '0 24px 24px',
                            borderTop: '1px solid var(--border)',
                            paddingTop: 20,
                          }}
                        >
                          {typeof content === 'object' && content !== null ? (
                            Object.entries(content).map(([key, val]) => (
                              <div key={key} style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-disabled)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                                  {key.replace(/_/g, ' ')}
                                </div>
                                {Array.isArray(val) ? (
                                  <ul style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {(val as string[]).map((item, i) => (
                                      <li key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                        {item}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                    {String(val)}
                                  </p>
                                )}
                              </div>
                            ))
                          ) : (
                            <pre style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'auto' }}>
                              {JSON.stringify(content, null, 2)}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
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
