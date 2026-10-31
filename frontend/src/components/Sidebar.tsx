'use client';
// ============================================================
// EdCap — Collapsible Accessible Sidebar Component (WCAG 2.2)
// ============================================================
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { usePathname, useRouter } from 'next/navigation';

interface NavItem {
  icon: string;
  label: string;
  href: string;
  section: 'overview' | 'academic' | 'support' | 'admin';
  roles?: string[];
}

const NAV_ITEMS: NavItem[] = [
  // Overview
  { icon: '🏠', label: 'Dashboard',     href: '/dashboard',   section: 'overview' },
  { icon: '📊', label: 'Analytics',     href: '/analytics',   section: 'overview', roles: ['faculty', 'admin'] },

  // Academic & Assessment
  { icon: '🎓', label: 'Courses',       href: '/courses',     section: 'academic', roles: ['faculty', 'admin'] },
  { icon: '📚', label: 'Modules',       href: '/modules',     section: 'academic', roles: ['faculty', 'admin'] },
  { icon: '📋', label: 'Assessments',   href: '/assessments', section: 'academic', roles: ['faculty', 'admin'] },
  { icon: '🧪', label: 'Daily Quiz',    href: '/quiz',        section: 'academic', roles: ['student'] },
  { icon: '📈', label: 'My Progress',   href: '/progress',    section: 'academic', roles: ['student'] },

  // Intervention & Remedial Support
  { icon: '🚩', label: 'Support Flags', href: '/flags',       section: 'support',  roles: ['faculty', 'admin'] },
  { icon: '📖', label: 'Playbooks',     href: '/playbooks',   section: 'support',  roles: ['faculty', 'admin'] },
  { icon: '🔁', label: 'Remedial Plan', href: '/remedial',    section: 'support',  roles: ['student'] },

  // Administration
  { icon: '⚙️', label: 'Admin Console', href: '/admin',       section: 'admin',    roles: ['admin'] },
];

const SECTION_LABELS: Record<NavItem['section'], string> = {
  overview: 'Overview',
  academic: 'Courses & Assessments',
  support:  'Learner Support',
  admin:    'System Administration',
};

export default function Sidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const layout = document.querySelector('.app-layout');
    if (layout) {
      layout.classList.toggle('sidebar-collapsed', collapsed);
    }
  }, [collapsed]);

  if (!user) return null;

  const visibleItems = NAV_ITEMS.filter(
    item => !item.roles || item.roles.includes(user.role)
  );

  const sections = (['overview', 'academic', 'support', 'admin'] as const).filter(
    sec => visibleItems.some(i => i.section === sec)
  );

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const initials = `${user.first_name[0]}${user.last_name[0]}`.toUpperCase();
  const roleLabel = user.role.charAt(0).toUpperCase() + user.role.slice(1);

  return (
    <aside
      className={`sidebar ${collapsed ? 'collapsed' : ''}`}
      aria-label="Main sidebar navigation"
    >
      {/* Brand Header + Collapse Toggle */}
      <div className="sidebar-logo">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div className="sidebar-logo-icon" aria-hidden="true">🎓</div>
          {!collapsed && <span className="sidebar-logo-name">EdCap</span>}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(v => !v)}
          className="btn btn-ghost btn-sm"
          style={{ padding: '4px 8px', minHeight: 30 }}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand sidebar navigation' : 'Collapse sidebar navigation'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span aria-hidden="true">{collapsed ? '»' : '«'}</span>
        </button>
      </div>

      {/* Grouped Navigation */}
      <nav className="sidebar-nav" aria-label="Primary">
        {sections.map(sec => (
          <div key={sec} style={{ marginBottom: 6 }}>
            {!collapsed && (
              <div className="sidebar-section-label">{SECTION_LABELS[sec]}</div>
            )}
            {visibleItems
              .filter(item => item.section === sec)
              .map(item => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    className={`nav-item ${isActive ? 'active' : ''}`}
                    aria-current={isActive ? 'page' : undefined}
                    title={collapsed ? item.label : undefined}
                  >
                    <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                    {!collapsed && <span>{item.label}</span>}
                  </a>
                );
              })}
          </div>
        ))}
      </nav>

      {/* Profile Footer */}
      <div className="sidebar-footer">
        <div className="user-pill" role="region" aria-label="Current user information">
          <div className="avatar" aria-hidden="true">{initials}</div>
          {!collapsed && (
            <div className="user-pill-info">
              <div className="user-pill-name">{user.first_name} {user.last_name}</div>
              <div className="user-pill-role">{roleLabel} Portal</div>
            </div>
          )}
        </div>
        <button
          onClick={handleLogout}
          className="btn btn-ghost btn-sm w-full"
          style={{
            justifyContent: collapsed ? 'center' : 'flex-start',
            color: 'var(--text-muted)',
            marginTop: 8,
          }}
          aria-label="Sign out of EdCap"
          title="Sign out"
        >
          <span aria-hidden="true">🚪</span>
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
