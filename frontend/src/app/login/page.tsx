'use client';
// ============================================================
// EdCap — SaaS Split-Screen Sign-In Page (/login)
// Zero emoji · Crisp SVG icons · Quick Role Demo Switcher
// ============================================================
import { useState, useEffect, FormEvent } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import Icon, { IconTile } from '@/components/ui/Icon';

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace('/dashboard');
    }
  }, [loading, user, router]);

  if (!loading && user) {
    return null;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace('/dashboard');
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr?.message || 'Invalid credentials. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const fillDemo = (role: 'admin' | 'faculty' | 'student') => {
    const creds = {
      admin:   { email: 'admin@edcap.demo',       password: 'Admin@123456789' },
      faculty: { email: 'prof.sharma@edcap.demo', password: 'Faculty@123456789' },
      student: { email: 'arjun.mehta@edcap.demo', password: 'Student@123456789' },
    };
    setEmail(creds[role].email);
    setPassword(creds[role].password);
    setError('');
  };

  return (
    <main className="auth-page">
      {/* Left Brand Showcase Aside */}
      <aside className="auth-aside" aria-label="Platform overview">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div className="auth-logo">
            <div className="auth-logo-icon">
              <Icon name="logo" size={20} strokeWidth={2} />
            </div>
            <span className="auth-logo-text">EdCap</span>
          </div>

          <div style={{ marginTop: 56, maxWidth: 480 }}>
            <span className="eyebrow">
              <Icon name="sparkles" size={13} />
              <span>Unified Learning & Assessment Platform</span>
            </span>
            <h2
              style={{
                fontSize: 34,
                fontWeight: 800,
                letterSpacing: '-0.03em',
                lineHeight: 1.18,
                marginTop: 12,
                color: 'var(--text-primary)',
              }}
            >
              Adaptive Mastery Analytics & Proctored Online Examinations.
            </h2>
            <p
              style={{
                fontSize: 15,
                color: 'var(--text-secondary)',
                marginTop: 14,
                lineHeight: 1.65,
              }}
            >
              Track syllabus progression, launch live timed examinations with real-time question palettes, and deliver targeted remedial study plans.
            </p>
          </div>

          {/* Feature Highlights */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 36, maxWidth: 460 }}>
            {[
              {
                icon: 'exam' as const,
                tone: 'indigo' as const,
                title: 'Dual-Pane Examination Workspace',
                desc: 'Live countdown timer, question status matrix, code-block prompts, and instant diagnostic grading.',
              },
              {
                icon: 'radar' as const,
                tone: 'emerald' as const,
                title: 'Subject Mastery Radar & Analytics',
                desc: 'Granular topic accuracy tracking with early-warning intervention flags.',
              },
              {
                icon: 'repeat' as const,
                tone: 'amber' as const,
                title: 'Spaced-Repetition Study Plans',
                desc: 'Automated 1, 3, 7, and 14-day remedial review queues for struggling learners.',
              },
            ].map(feat => (
              <div key={feat.title} className="subcard flex items-center gap-3" style={{ backdropFilter: 'blur(8px)' }}>
                <IconTile name={feat.icon} tone={feat.tone} size={38} />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>{feat.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{feat.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: 'relative', zIndex: 1, fontSize: 12, color: 'var(--text-muted)' }}>
          SIH1432 Smart Education · WCAG 2.2 AA Compliant · Argon2id + CSRF Hardened
        </div>
      </aside>

      {/* Right Authentication Form */}
      <section className="auth-main" aria-label="Sign in form">
        <div className="auth-card">
          <div className="auth-logo" style={{ marginBottom: 24 }}>
            <div className="auth-logo-icon">
              <Icon name="logo" size={19} strokeWidth={2} />
            </div>
            <span className="auth-logo-text">EdCap</span>
          </div>

          <h1 className="auth-heading">Sign in to your account</h1>
          <p className="auth-subheading">Enter your institutional credentials or choose a demo role below</p>

          <form
            onSubmit={handleSubmit}
            aria-label="Sign in to EdCap"
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <div className="form-group">
              <label className="form-label" htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                className="form-input"
                placeholder="you@institution.edu"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <div className="flex items-center justify-between">
                <label className="form-label" htmlFor="password">Password</label>
                <a
                  href="/forgot-password"
                  style={{ fontSize: 12, color: 'var(--tint-indigo-fg)', fontWeight: 600 }}
                >
                  Forgot password?
                </a>
              </div>
              <input
                id="password"
                type="password"
                className="form-input"
                placeholder="••••••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div role="alert" aria-live="assertive" className="callout callout-danger">
                <Icon name="alert" size={17} />
                <span>{error}</span>
              </div>
            )}

            <button
              id="btn-login"
              type="submit"
              className="btn btn-primary btn-lg btn-full"
              disabled={submitting}
              aria-busy={submitting}
            >
              {submitting ? (
                <>
                  <span className="spinner" role="status" aria-label="Signing in" style={{ width: 16, height: 16 }} />
                  <span>Signing in…</span>
                </>
              ) : (
                <>
                  <span>Sign in to Portal</span>
                  <Icon name="arrowRight" size={16} />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0 16px' }}>
            <div className="divider" style={{ flex: 1, margin: 0 }} />
            <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Quick Demo Access
            </span>
            <div className="divider" style={{ flex: 1, margin: 0 }} />
          </div>

          {/* Demo credential buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }} role="group" aria-label="Demo login shortcuts">
            {(
              [
                { role: 'student', label: 'Student', icon: 'courses' as const },
                { role: 'faculty', label: 'Faculty', icon: 'users' as const },
                { role: 'admin',   label: 'Admin',   icon: 'shield' as const },
              ] as const
            ).map(item => (
              <button
                key={item.role}
                id={`btn-demo-${item.role}`}
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => fillDemo(item.role)}
                aria-label={`Fill ${item.label} demo credentials`}
              >
                <Icon name={item.icon} size={14} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
