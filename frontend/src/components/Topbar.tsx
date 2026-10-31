'use client';
// ============================================================
// EdCap — Accessible Topbar Component (WCAG 2.2)
// ============================================================
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';

interface TopbarProps {
  breadcrumb?: string;
  current: string;
  actions?: React.ReactNode;
}

export default function Topbar({ breadcrumb, current, actions }: TopbarProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const saved = (typeof window !== 'undefined' && localStorage.getItem('edcap_theme')) as 'light' | 'dark' | null;
    const initial = saved === 'dark' ? 'dark' : 'light';
    setTheme(initial);
    document.documentElement.dataset.theme = initial;
  }, []);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('edcap_theme', next);
    document.documentElement.dataset.theme = next;
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const initials = user
    ? `${user.first_name[0]}${user.last_name[0]}`.toUpperCase()
    : '??';

  return (
    <header className="topbar">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="topbar-breadcrumb">
        {breadcrumb && <span>{breadcrumb}</span>}
        {breadcrumb && <span aria-hidden="true" style={{ color: 'var(--text-disabled)' }}>/</span>}
        <span className="current" aria-current="page">{current}</span>
      </nav>

      {/* Actions */}
      <div className="topbar-actions">
        {actions}

        {/* Eye-Comfort Theme Switcher */}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          <span aria-hidden="true">{theme === 'light' ? '🌙' : '☀️'}</span>
          <span>{theme === 'light' ? 'Dark' : 'Light'}</span>
        </button>

        {/* Notification Bell + Popover */}
        <div
          className="dropdown"
          onKeyDown={e => {
            if (e.key === 'Escape' && showNotifs) setShowNotifs(false);
          }}
        >
          <button
            type="button"
            className="notif-btn"
            onClick={() => {
              setShowNotifs(v => !v);
              setShowDropdown(false);
            }}
            aria-label="Notifications"
            aria-haspopup="dialog"
            aria-expanded={showNotifs}
            title="Notifications"
          >
            <span aria-hidden="true">🔔</span>
            <span className="notif-dot" aria-hidden="true" />
          </button>

          {showNotifs && (
            <>
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 998 }}
                onClick={() => setShowNotifs(false)}
                aria-hidden="true"
              />
              <div
                className="dropdown-menu"
                role="dialog"
                aria-label="Recent notifications"
                style={{ width: 300, padding: 12 }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', marginBottom: 8 }}>
                  Recent Activity & Alerts
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <div style={{ padding: 8, background: 'var(--bg-raised)', borderRadius: 8 }}>
                    <strong style={{ color: 'var(--text-primary)' }}>Assessment Sync Complete</strong>
                    <div>Weekly student diagnostic scores are updated.</div>
                  </div>
                  <div style={{ padding: 8, background: 'var(--bg-raised)', borderRadius: 8 }}>
                    <strong style={{ color: 'var(--text-primary)' }}>Remedial Tracks Active</strong>
                    <div>Personalized study plans are ready for review.</div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* User Avatar Dropdown */}
        <div
          className="dropdown"
          onKeyDown={e => {
            if (e.key === 'Escape' && showDropdown) {
              setShowDropdown(false);
            }
          }}
        >
          <button
            type="button"
            className="avatar"
            onClick={() => {
              setShowDropdown(v => !v);
              setShowNotifs(false);
            }}
            aria-label="Account menu"
            aria-haspopup="menu"
            aria-expanded={showDropdown}
            title="Account"
          >
            {initials}
          </button>

          {showDropdown && (
            <>
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 998 }}
                onClick={() => setShowDropdown(false)}
                aria-hidden="true"
              />
              <div className="dropdown-menu" role="menu" aria-label="User account actions">
                <div
                  className="dropdown-item"
                  role="none"
                  style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2, cursor: 'default' }}
                >
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                    {user?.first_name} {user?.last_name}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{user?.email}</span>
                </div>
                <div style={{ height: 1, background: 'var(--glass-border)', margin: '4px 0' }} role="separator" />
                <a
                  href="/dashboard"
                  className="dropdown-item"
                  role="menuitem"
                  onClick={() => setShowDropdown(false)}
                >
                  <span aria-hidden="true">🏠</span> Dashboard
                </a>
                {user?.role !== 'student' && (
                  <a
                    href="/courses"
                    className="dropdown-item"
                    role="menuitem"
                    onClick={() => setShowDropdown(false)}
                  >
                    <span aria-hidden="true">🎓</span> Courses
                  </a>
                )}
                <button
                  type="button"
                  className="dropdown-item danger"
                  role="menuitem"
                  style={{ width: '100%', textAlign: 'left' }}
                  onClick={handleLogout}
                >
                  <span aria-hidden="true">🚪</span> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
