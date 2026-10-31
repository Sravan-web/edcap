'use client';
// ============================================================
// EdCap AI — Remedial Queue Page (Student)
// Spaced-repetition review queue
// ============================================================
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import Topbar from '@/components/Topbar';
import { remedialApi, type RemedialItem } from '@/lib/api';

export default function RemedialPage() {
  const [items, setItems] = useState<RemedialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    remedialApi.list()
      .then(setItems)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const complete = async (id: string) => {
    setCompleting(id);
    try {
      await remedialApi.complete(id);
      setItems(prev => prev.filter(i => i.id !== id));
      showToast('Review marked as complete — see you next interval!');
    } catch {
      showToast('Failed to update. Try again.');
    } finally {
      setCompleting(null);
    }
  };

  const now = new Date();
  const dueItems = items.filter(i => new Date(i.next_review_at) <= now);
  const upcomingItems = items.filter(i => new Date(i.next_review_at) > now);

  return (
    <AppShell>
      <Topbar breadcrumb="Student" current="Remedial Queue" />
      <div className="app-content">
        <div className="page-header">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="page-title">🔁 Remedial Queue</h1>
              <p className="page-subtitle">Spaced-repetition review for weak topics (intervals: 1, 3, 7, 14 days)</p>
            </div>
            {dueItems.length > 0 && (
              <span className="badge badge-orange">{dueItems.length} due now</span>
            )}
          </div>
        </div>

        {loading ? (
          <div className="loading-center"><div className="spinner" role="status" aria-label="Loading remedial queue" /></div>
        ) : items.length === 0 ? (
          <div className="card card-padding" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
            <h2 style={{ fontWeight: 700, fontSize: 20, marginBottom: 8 }}>Queue is empty!</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              No topics due for review. Keep up the great work!
            </p>
          </div>
        ) : (
          <>
            {/* Due now */}
            {dueItems.length > 0 && (
              <>
                <div className="section-title mb-4">⚠️ Due Now</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                  {dueItems.map(item => (
                    <div
                      key={item.id}
                      className="card card-padding"
                      style={{ borderLeft: '3px solid var(--danger)' }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
                            📐 Topic {item.topic_id.slice(0, 8)}
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span className="badge badge-orange">
                              Repetition #{item.repetition_count + 1}
                            </span>
                            <span className="badge badge-gray">
                              Interval: {item.interval_days}d
                            </span>
                            {item.last_result && (
                              <span className={`badge ${item.last_result === 'pass' ? 'badge-green' : 'badge-red'}`}>
                                Last: {item.last_result}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                            Was due: {new Date(item.next_review_at).toLocaleString()}
                          </div>
                        </div>
                        <button
                          id={`btn-complete-${item.id}`}
                          className="btn btn-primary"
                          disabled={completing === item.id}
                          onClick={() => complete(item.id)}
                        >
                          {completing === item.id
                            ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Marking…</>
                            : '✅ Mark Complete'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Upcoming */}
            {upcomingItems.length > 0 && (
              <>
                <div className="section-title mb-4">📅 Upcoming Reviews</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {upcomingItems.map(item => {
                    const dueDate = new Date(item.next_review_at);
                    const daysUntil = Math.ceil((dueDate.getTime() - now.getTime()) / 86400000);
                    return (
                      <div
                        key={item.id}
                        className="card card-padding"
                        style={{ opacity: 0.7 }}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                              📐 Topic {item.topic_id.slice(0, 8)}
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <span className="badge badge-gray">
                                Due in {daysUntil} day{daysUntil !== 1 ? 's' : ''}
                              </span>
                              <span className="badge badge-gray">
                                Interval: {item.interval_days}d
                              </span>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                              {dueDate.toLocaleDateString()}
                            </div>
                          </div>
                          <div
                            className="progress-bar"
                            style={{ width: 80 }}
                            role="progressbar"
                            aria-valuenow={Math.round(Math.min(((item.interval_days - daysUntil) / item.interval_days) * 100, 100))}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`Review progress for topic ${item.topic_id}`}
                          >
                            <div
                              className="progress-fill"
                              style={{
                                width: `${Math.min(((item.interval_days - daysUntil) / item.interval_days) * 100, 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
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
