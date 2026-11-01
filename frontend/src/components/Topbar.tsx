'use client';
// ============================================================
// EdCap — Top Navigation
// Breadcrumb · Global search (⌘K) · Role/session indicator ·
// Theme toggle · Notifications · Account menu
// ============================================================
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import Icon, { type IconName } from '@/components/ui/Icon';

interface TopbarProps {
  breadcrumb?: string;
  current: string;
  actions?: React.ReactNode;
}

const QUICK_ROUTES: { label: string; href: string; icon: IconName; group: string }[] = [
  { label: 'Dashboard',          href: '/dashboard',   icon: 'dashboard',   group: 'Overview' },
  { label: 'Exam Room',          href: '/quiz',        icon: 'exam',        group: 'Assessment' },
  { label: 'Courses',            href: '/courses',     icon: 'courses',     group: 'Learning' },
  { label: 'Lecture Modules',    href: '/modules',     icon: 'modules',     group: 'Learning' },
  { label: 'Assessments',        href: '/assessments', icon: 'assessments', group: 'Assessment' },
  { label: 'Support Flags',      href: '/flags',       icon: 'flag',        group: 'Support' },
  { label: 'Course Analytics',   href: '/analytics',   icon: 'analytics',   group: 'Overview' },
  { label: 'Study Plan',         href: '/remedial',    icon: 'repeat',      group: 'Support' },
  { label: 'My Progress',        href: '/progress',    icon: 'progress',    group: 'Overview' },
];

const NOTIFICATIONS: { icon: IconName; tone: string; title: string; body: string; time: string }[] = [
  { icon: 'exam',      tone: 'tone-indigo',  title: 'Timed exam is live',        body: 'CS101 Mid-Term Diagnostic is open in the Exam Room.', time: '5m' },
  { icon: 'analytics', tone: 'tone-emerald', title: 'Scores synchronized',       body: 'Weekly assessment results and study plans updated.',  time: '1h' },
  { icon: 'calendar',  tone: 'tone-amber',   title: 'Deadline approaching',      body: 'CS204 Paging Test closes tomorrow at 5:00 PM.',        time: '3h' },
];

export default function Topbar({ breadcrumb, current, actions }: TopbarProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    setTheme(current);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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

  const initials = user ? `${user.first_name[0]}${user.last_name[0]}`.toUpperCase() : '??';
  const results = query.trim()
    ? QUICK_ROUTES.filter(r => (r.label + r.group).toLowerCase().includes(query.toLowerCase()))
    : QUICK_ROUTES.slice(0, 5);

  return (
    <header className="topbar">
      <nav aria-label="Breadcrumb" className="topbar-breadcrumb">
        {breadcrumb && <span>{breadcrumb}</span>}
        {breadcrumb && <Icon name="chevronRight" size={14} style={{ color: 'var(--text-disabled)' }} />}
        <span className="current" aria-current="page">{current}</span>
      </nav>

      <div className="topbar-search" style={{ position: 'relative', flex: '0 1 340px' }}>
        <div className="search-field">
          <Icon name="search" size={16} />
          <input
            ref={searchRef}
            type="search"
            className="form-input"
            placeholder="Search courses, exams, modules…"
            aria-label="Global search"
            value={query}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && results[0]) router.push(results[0].href);
              if (e.key === 'Escape') (e.target as HTMLInputElement).blur();
            }}
          />
          <span className="kbd" aria-hidden="true">⌘K</span>
        </div>
        {searchOpen && results.length > 0 && (
          <div className="dropdown-menu" role="listbox" aria-label="Search results" style={{ width: '100%', left: 0 }}>
            {results.map(r => (
              <a key={r.href} href={r.href} className="dropdown-item" role="option" aria-selected="false">
                <Icon name={r.icon} size={16} />
                <span style={{ flex: 1 }}>{r.label}</span>
                <span style={{ fontSize: 11, color: 'var(--text-disabled)' }}>{r.group}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="topbar-actions">
        {actions}

        {user && (
          <div className="role-switch hide-mobile" role="status" aria-label={`Signed in as ${user.role}`}>
            {(['student', 'faculty', 'admin'] as const).map(r => (
              <span key={r} className={user.role === r ? 'active' : ''}>{r}</span>
            ))}
          </div>
        )}

        <button
          type="button"
          className="notif-btn"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          title={theme === 'light' ? 'Dark mode' : 'Light mode'}
        >
          <Icon name={theme === 'light' ? 'moon' : 'sun'} size={17} />
        </button>

        <div className="dropdown" onKeyDown={e => e.key === 'Escape' && setShowNotifs(false)}>
          <button
            type="button"
            className="notif-btn"
            onClick={() => { setShowNotifs(v => !v); setShowMenu(false); }}
            aria-label={`Notifications, ${NOTIFICATIONS.length} unread`}
            aria-haspopup="dialog"
            aria-expanded={showNotifs}
          >
            <Icon name="bell" size={17} />
            <span className="notif-dot" aria-hidden="true">{NOTIFICATIONS.length}</span>
          </button>
          {showNotifs && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setShowNotifs(false)} aria-hidden="true" />
              <div className="dropdown-menu" role="dialog" aria-label="Notifications" style={{ width: 340, padding: 0 }}>
                <div className="flex items-center justify-between" style={{ padding: '12px 14px', borderBottom: '1px solid var(--glass-border)' }}>
                  <strong style={{ fontSize: 13.5 }}>Notifications</strong>
                  <span className="badge badge-blue">{NOTIFICATIONS.length} new</span>
                </div>
                <div style={{ padding: 6 }}>
                  {NOTIFICATIONS.map(n => (
                    <div key={n.title} className="dropdown-item" style={{ alignItems: 'flex-start', cursor: 'default' }}>
                      <span className={`icon-tile ${n.tone}`} style={{ width: 32, height: 32 }}><Icon name={n.icon} size={15} /></span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', color: 'var(--text-primary)', fontWeight: 700 }}>{n.title}</span>
                        <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', whiteSpace: 'normal' }}>{n.body}</span>
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-disabled)' }}>{n.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="dropdown" onKeyDown={e => e.key === 'Escape' && setShowMenu(false)}>
          <button
            type="button"
            className="avatar"
            onClick={() => { setShowMenu(v => !v); setShowNotifs(false); }}
            aria-label="Account menu"
            aria-haspopup="menu"
            aria-expanded={showMenu}
          >
            {initials}
          </button>
          {showMenu && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setShowMenu(false)} aria-hidden="true" />
              <div className="dropdown-menu" role="menu" aria-label="Account">
                <div style={{ padding: '10px 10px 8px' }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-primary)' }}>{user?.first_name} {user?.last_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{user?.email}</div>
                </div>
                <div className="divider" style={{ margin: '4px 0' }} role="separator" />
                <a href="/dashboard" className="dropdown-item" role="menuitem"><Icon name="dashboard" size={16} /> Dashboard</a>
                <a href="/quiz" className="dropdown-item" role="menuitem"><Icon name="exam" size={16} /> Exam Room</a>
                {user?.role !== 'student' && (
                  <a href="/courses" className="dropdown-item" role="menuitem"><Icon name="courses" size={16} /> Courses</a>
                )}
                <div className="divider" style={{ margin: '4px 0' }} role="separator" />
                <button type="button" className="dropdown-item danger" role="menuitem" onClick={handleLogout}>
                  <Icon name="logout" size={16} /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
