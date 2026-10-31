'use client';
// ============================================================
// EdCap — Topbar Component
// ============================================================
import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';

interface TopbarProps {
  breadcrumb?: string;
  current: string;
  actions?: React.ReactNode;
}

export default function Topbar({ breadcrumb, current, actions }: TopbarProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [showDropdown, setShowDropdown] = useState(false);

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
      <div className="topbar-breadcrumb">
        {breadcrumb && <span>{breadcrumb}</span>}
        {breadcrumb && <span style={{ color: 'var(--text-disabled)' }}>›</span>}
        <span className="current">{current}</span>
      </div>

      {/* Actions */}
      <div className="topbar-actions">
        {actions}

        {/* Notification bell */}
        <button
          className="notif-btn"
          aria-label="Notifications (new activity available)"
          title="Notifications"
        >
          <span aria-hidden="true">🔔</span>
          <span className="notif-dot" aria-hidden="true" />
          <span className="sr-only">New notifications available</span>
        </button>

        {/* User avatar dropdown */}
        <div
          className="dropdown"
          style={{ position: 'relative' }}
          onKeyDown={e => {
            if (e.key === 'Escape' && showDropdown) {
              setShowDropdown(false);
            }
          }}
        >
          <button
            className="avatar"
            onClick={() => setShowDropdown(v => !v)}
            aria-label="Account menu"
            aria-haspopup="menu"
            aria-expanded={showDropdown}
            title="Account"
          >
            {initials}
          </button>

          {showDropdown && (
            <>
              {/* Backdrop */}
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 998 }}
                onClick={() => setShowDropdown(false)}
                aria-hidden="true"
              />
              <div className="dropdown-menu" role="menu" aria-label="User account actions">
                <div
                  className="dropdown-item"
                  role="none"
                  style={{ fontWeight: 700, color: 'var(--text-primary)', cursor: 'default' }}
                >
                  {user?.first_name} {user?.last_name}
                </div>
                <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} role="separator" />
                <a
                  href="/courses"
                  className="dropdown-item"
                  role="menuitem"
                  onClick={() => setShowDropdown(false)}
                >
                  <span aria-hidden="true">📚</span> My Courses
                </a>
                <button
                  type="button"
                  className="dropdown-item danger"
                  role="menuitem"
                  style={{ width: '100%', textAlign: 'left', background: 'none' }}
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
