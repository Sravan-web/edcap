'use client';
// ============================================================
// EdCap — Playbooks Page (Faculty)
// RAG-generated intervention plans with pedagogical strategies
// ============================================================
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import Topbar from '@/components/Topbar';
import { Icon, IconTile, type IconName } from '@/components/ui/Icon';
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
      A_foundational: 'Foundational',
      B_language:     'Language',
      C_engagement:   'Engagement',
      normal:         'Normal',
    };
    return map[track] ?? track;
  }

  function trackIcon(track?: string): IconName {
    const map: Record<string, IconName> = {
      A_foundational: 'ruler',
      B_language:     'message',
      C_engagement:   'zap',
      normal:         'checkCircle',
    };
    return (track && map[track]) || 'playbook';
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
          <div>
            <div className="page-eyebrow">
              <Icon name="playbook" size={13} /> Pedagogical Strategy Engine
            </div>
            <h1 className="page-title">Intervention Playbooks</h1>
            <p className="page-subtitle">
              Pedagogical intervention plans backed by 30+ research strategies
            </p>
          </div>
          <span className="badge badge-purple">{playbooks.length} playbooks</span>
        </div>

        {loading ? (
          <div className="loading-center"><div className="spinner" role="status" aria-label="Loading playbooks" /></div>
        ) : (
          <>
            {/* Flags needing playbooks */}
            {uncoveredFlags.length > 0 && (
              <div className="card card-padding mb-6">
                <div className="section-title mb-4">
                  <Icon name="flag" size={16} /> Flags Without Playbooks
                </div>
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
                        flexWrap: 'wrap',
                      }}
                    >
                      <span className={trackClass(f.track)}>
                        <Icon name={trackIcon(f.track)} size={12} />
                        {trackLabel(f.track)}
                      </span>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1 }}>
                        Risk: {(f.risk_score * 100).toFixed(0)}% · {Array.isArray(f.reasons) ? (f.reasons[0] ?? '') : ''}
                      </span>
                      <button
                        id={`btn-gen-playbook-${f.id}`}
                        className="btn btn-primary btn-sm"
                        disabled={generating === f.id}
                        onClick={() => generatePlaybook(f.id)}
                      >
                        {generating === f.id ? (
                          <>
                            <span className="spinner" style={{ width: 12, height: 12 }} /> Generating…
                          </>
                        ) : (
                          <>
                            <Icon name="sparkles" size={14} /> Generate Playbook
                          </>
                        )}
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
                  <div className="empty-state-icon"><Icon name="playbook" size={22} /></div>
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
                        style={{ width: '100%', textAlign: 'left', background: 'none', cursor: 'pointer', border: 'none' }}
                        onClick={() => setExpanded(isExpanded ? null : pb.id)}
                        aria-expanded={isExpanded}
                        aria-controls={`playbook-content-${pb.id}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <IconTile
                              name={trackIcon(flag?.track)}
                              tone={
                                flag?.track === 'A_foundational' ? 'indigo' :
                                flag?.track === 'B_language'     ? 'emerald' :
                                flag?.track === 'C_engagement'   ? 'amber' : 'violet'
                              }
                            />
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                                {flag ? trackLabel(flag.track) : 'Playbook'} Intervention Plan
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span>Generated {new Date(pb.created_at).toLocaleDateString()}</span>
                                <span>·</span>
                                {pb.approved_by ? (
                                  <span style={{ color: 'var(--success)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    <Icon name="checkCircle" size={12} /> Approved
                                  </span>
                                ) : (
                                  <span>Pending approval</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <span
                            style={{
                              color: 'var(--text-muted)',
                              transform: isExpanded ? 'rotate(180deg)' : '',
                              transition: '0.2s',
                              display: 'inline-flex',
                            }}
                            aria-hidden="true"
                          >
                            <Icon name="chevronDown" size={18} />
                          </span>
                        </div>
                      </button>

                      {isExpanded && (
                        <div
                          id={`playbook-content-${pb.id}`}
                          role="region"
                          aria-label={`${flag ? trackLabel(flag.track) : 'Playbook'} details`}
                          style={{
                            padding: '20px 24px 24px',
                            borderTop: '1px solid var(--border)',
                          }}
                        >
                          {typeof content === 'object' && content !== null ? (
                            Object.entries(content).map(([key, val]) => (
                              <div key={key} style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-disabled)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
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
          <Icon name={toast.includes('Failed') ? 'xCircle' : 'checkCircle'} size={15} />
          <span>{toast}</span>
        </div>
      )}
    </AppShell>
  );
}
