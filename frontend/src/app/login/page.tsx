'use client';
// ============================================================
// EdCap AI — Login Page
// ============================================================
import { useState, useEffect, FormEvent } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Redirect if already logged in
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
      admin:   { email: 'admin@edcap.demo',          password: 'Admin@123456789' },
      faculty: { email: 'prof.sharma@edcap.demo',    password: 'Faculty@123456789' },
      student: { email: 'arjun.mehta@edcap.demo',    password: 'Student@123456789' },
    };
    setEmail(creds[role].email);
    setPassword(creds[role].password);
    setError('');
  };

  return (
    <main className="auth-page">
      <div className="auth-card">
        {/* Logo */}
        <div className="auth-logo">
          <div className="auth-logo-icon" aria-hidden="true">🎓</div>
          <span className="auth-logo-text gradient-text">EdCap AI</span>
        </div>

        <h1 className="auth-heading">Welcome back</h1>
        <p className="auth-subheading">Sign in to your account to continue</p>

        {/* Form */}
        <form onSubmit={handleSubmit} aria-label="Sign in to EdCap AI" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group">
            <label className="form-label" htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              className="form-input"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
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
            <div
              role="alert"
              aria-live="assertive"
              style={{
                padding: '10px 14px',
                background: 'rgba(220,60,80,0.10)',
                border: '1px solid rgba(220,60,80,0.25)',
                borderRadius: 'var(--radius-md)',
                fontSize: 13,
                color: 'hsl(355,75%,65%)',
              }}
            >
              <span aria-hidden="true">⚠️ </span>
              {error}
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
              'Sign in'
            )}
          </button>
        </form>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
          <div className="divider" style={{ flex: 1, margin: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Demo accounts</span>
          <div className="divider" style={{ flex: 1, margin: 0 }} />
        </div>

        {/* Demo credential buttons */}
        <div style={{ display: 'flex', gap: 8 }} role="group" aria-label="Demo login shortcuts">
          {(['admin', 'faculty', 'student'] as const).map(role => (
            <button
              key={role}
              id={`btn-demo-${role}`}
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ flex: 1, fontSize: 12, textTransform: 'capitalize' }}
              onClick={() => fillDemo(role)}
              aria-label={`Fill ${role} demo credentials`}
            >
              <span aria-hidden="true">{role === 'admin' ? '🔑' : role === 'faculty' ? '👨‍🏫' : '🧑‍🎓'}</span> {role}
            </button>
          ))}
        </div>

        <p style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
          <a
            href="/forgot-password"
            style={{ color: 'var(--brand-400)', fontWeight: 600 }}
          >
            Forgot your password?
          </a>
        </p>
      </div>
    </main>
  );
}
