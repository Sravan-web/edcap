'use client';
// ============================================================
// EdCap — Admin Console Page
// Users management + Audit logs + Settings
// ============================================================
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import Topbar from '@/components/Topbar';
import { Icon } from '@/components/ui/Icon';
import { adminApi, type UserProfile, type AuditLog, type Setting } from '@/lib/api';

type Tab = 'users' | 'audit' | 'settings';

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const loaders: Record<Tab, () => Promise<void>> = {
      users: () => adminApi.users().then(setUsers),
      audit: () => adminApi.auditLogs({ limit: 50 }).then(setLogs),
      settings: () => adminApi.settings().then(setSettings),
    };
    setLoading(true);
    loaders[tab]().catch(console.error).finally(() => setLoading(false));
  }, [tab]);

  const saveSetting = async (key: string) => {
    try {
      await adminApi.updateSetting(key, editingValue);
      setSettings(prev => prev.map(s => s.key === key ? { ...s, value: editingValue } : s));
      setEditingKey(null);
      showToast('Setting updated');
    } catch {
      showToast('Failed to update setting');
    }
  };

  const roleColor = (role: string) => {
    if (role === 'admin')   return 'badge-purple';
    if (role === 'faculty') return 'badge-blue';
    return 'badge-teal';
  };

  const outcomeColor = (outcome: string) =>
    outcome === 'success' ? 'badge-green' : 'badge-red';

  const SETTING_INFO: Record<string, { label: string; desc: string }> = {
    'rule.below_avg_pct': {
      label: 'Below Class Average Alert Threshold (%)',
      desc: 'Flag students when their score falls this many percentage points below the class average',
    },
    'rule.trend_slope': {
      label: 'Score Drop Alert Rate (% per test)',
      desc: 'Flag students when their scores drop steadily across consecutive assessments',
    },
    'rule.topic_accuracy_pct': {
      label: 'Minimum Topic Mastery (%)',
      desc: 'Schedule remedial practice when accuracy on a syllabus topic falls below this score',
    },
    'quiz.questions_per_day': {
      label: 'Daily Practice Quiz Length (Questions)',
      desc: 'Number of questions included in each daily student micro-quiz',
    },
    'notification.email_enabled': {
      label: 'Email Alerts Enabled',
      desc: 'Send email summaries and security notifications to teachers and students',
    },
  };

  const ACTION_LABELS: Record<string, string> = {
    'auth.login': 'User Sign-In',
    'auth.logout': 'User Sign-Out',
    'flag.update': 'Support Flag Updated',
    'admin.user_status_change': 'User Account Status Changed',
    'admin.role_change': 'User Role Changed',
    'admin.enroll_student': 'Student Enrolled in Course',
    'admin.assign_faculty': 'Faculty Assigned to Course',
    'system.seed_data': 'Demo Data Initialized',
  };

  return (
    <AppShell>
      <Topbar breadcrumb="Admin" current="Admin Console" />
      <div className="app-content">
        <div className="page-header">
          <div>
            <div className="page-eyebrow">
              <Icon name="shield" size={13} /> Platform Governance
            </div>
            <h1 className="page-title">Admin Console</h1>
            <p className="page-subtitle">Manage users, audit logs, and system configuration</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs mb-6" role="tablist" aria-label="Admin console sections">
          {(['users', 'audit', 'settings'] as Tab[]).map(t => (
            <button
              key={t}
              id={`admin-tab-${t}`}
              role="tab"
              aria-selected={tab === t}
              aria-controls={`admin-panel-${t}`}
              className={`tab ${tab === t ? 'active' : ''}`}
              onClick={() => setTab(t)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
            >
              <Icon name={t === 'users' ? 'users' : t === 'audit' ? 'assessments' : 'settings'} size={15} />
              <span>{t === 'users' ? 'Users' : t === 'audit' ? 'Audit Logs' : 'Settings'}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="loading-center"><div className="spinner" role="status" aria-label="Loading admin data" /></div>
        ) : (
          <>
            {/* ── Users Tab ─────────────────────────────────── */}
            {tab === 'users' && (
              <div id="admin-panel-users" role="tabpanel" aria-labelledby="admin-tab-users" className="card">
                <div className="card-padding" style={{ paddingBottom: 0 }}>
                  <div className="section-header">
                    <div>
                      <div className="section-title">
                        <Icon name="users" size={16} /> Registered Users
                      </div>
                      <div className="section-subtitle">{users.length} total accounts</div>
                    </div>
                  </div>
                </div>
                <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
                  {users.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-state-icon" aria-hidden="true"><Icon name="users" size={22} /></div>
                      <div className="empty-state-text">No users found</div>
                    </div>
                  ) : (
                    <table>
                      <caption className="sr-only">Registered users overview</caption>
                      <thead>
                        <tr>
                          <th>User</th>
                          <th>Email</th>
                          <th>Role</th>
                          <th>Status</th>
                          <th>MFA</th>
                          <th>Joined</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map(u => (
                          <tr key={u.id}>
                            <td className="td-primary">
                              <div className="flex items-center gap-2">
                                <div className="avatar avatar-sm">
                                  {u.first_name[0]}{u.last_name[0]}
                                </div>
                                {u.first_name} {u.last_name}
                              </div>
                            </td>
                            <td className="font-mono text-sm">{u.email}</td>
                            <td>
                              <span className={`badge ${roleColor(u.role)}`}>{u.role}</span>
                            </td>
                            <td>
                              <span className={`badge ${u.status === 'active' ? 'badge-green' : 'badge-gray'}`}>
                                {u.status}
                              </span>
                            </td>
                            <td>
                              {u.mfa_enabled ? (
                                <span className="badge badge-teal">
                                  <Icon name="lock" size={11} /> Enabled
                                </span>
                              ) : (
                                <span className="badge badge-gray">Disabled</span>
                              )}
                            </td>
                            <td style={{ fontSize: 12 }}>
                              {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* ── Audit Logs Tab ───────────────────────────── */}
            {tab === 'audit' && (
              <div id="admin-panel-audit" role="tabpanel" aria-labelledby="admin-tab-audit" className="card">
                <div className="card-padding" style={{ paddingBottom: 0 }}>
                  <div className="section-header">
                    <div>
                      <div className="section-title">
                        <Icon name="shield" size={16} /> Audit Trail
                      </div>
                      <div className="section-subtitle">Immutable log of all privileged actions</div>
                    </div>
                    <span className="badge badge-purple">{logs.length} entries</span>
                  </div>
                </div>
                <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
                  {logs.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-state-icon" aria-hidden="true"><Icon name="assessments" size={22} /></div>
                      <div className="empty-state-text">No audit logs yet</div>
                    </div>
                  ) : (
                    <table>
                      <caption className="sr-only">Platform audit events log</caption>
                      <thead>
                        <tr>
                          <th>Timestamp</th>
                          <th>Action</th>
                          <th>Target</th>
                          <th>IP</th>
                          <th>Outcome</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logs.map(log => (
                          <tr key={log.id}>
                            <td style={{ fontSize: 12, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                              {new Date(log.timestamp).toLocaleString()}
                            </td>
                            <td className="td-primary text-sm">
                              {ACTION_LABELS[log.action] ?? log.action.replace(/[._]/g, ' ')}
                            </td>
                            <td className="text-sm truncate" style={{ maxWidth: 140 }}>{log.target}</td>
                            <td className="font-mono text-sm">{log.ip_prefix}</td>
                            <td>
                              <span className={`badge ${outcomeColor(log.outcome)}`}>{log.outcome}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* ── Settings Tab ─────────────────────────────── */}
            {tab === 'settings' && (
              <div id="admin-panel-settings" role="tabpanel" aria-labelledby="admin-tab-settings" className="card">
                <div className="card-padding" style={{ paddingBottom: 0 }}>
                  <div className="section-header">
                    <div>
                      <div className="section-title">
                        <Icon name="settings" size={16} /> System Settings
                      </div>
                      <div className="section-subtitle">Configure thresholds and platform parameters</div>
                    </div>
                  </div>
                </div>
                <div style={{ padding: '0 24px 24px' }}>
                  {settings.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-state-icon" aria-hidden="true"><Icon name="settings" size={22} /></div>
                      <div className="empty-state-text">No settings found</div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {settings.map(s => (
                        <div
                          key={s.key}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '12px 16px',
                            background: 'var(--bg-overlay)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border)',
                            flexWrap: 'wrap',
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                              {SETTING_INFO[s.key]?.label ?? s.key.replace(/[._]/g, ' ')}
                            </div>
                            {SETTING_INFO[s.key]?.desc && (
                              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                                {SETTING_INFO[s.key].desc}
                              </div>
                            )}
                          </div>

                          {editingKey === s.key ? (
                            <>
                              <input
                                id={`setting-input-${s.key}`}
                                className="form-input"
                                aria-label={`Configuration setting ${s.key}`}
                                style={{ width: 200, padding: '6px 10px' }}
                                value={editingValue}
                                onChange={e => setEditingValue(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') saveSetting(s.key);
                                  if (e.key === 'Escape') setEditingKey(null);
                                }}
                                autoFocus
                              />
                              <button className="btn btn-primary btn-sm" onClick={() => saveSetting(s.key)}>Save</button>
                              <button className="btn btn-ghost btn-sm" onClick={() => setEditingKey(null)}>Cancel</button>
                            </>
                          ) : (
                            <>
                              <span
                                className="font-mono"
                                style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', minWidth: 120, textAlign: 'right' }}
                              >
                                {s.value}
                              </span>
                              <button
                                id={`setting-edit-${s.key}`}
                                className="btn btn-ghost btn-sm"
                                aria-label={`Edit setting ${s.key}`}
                                onClick={() => { setEditingKey(s.key); setEditingValue(s.value); }}
                              >
                                <Icon name="edit" size={14} /> Edit
                              </button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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
