'use client';
// ============================================================
// EdCap — Collapsible Sidebar Navigation
// ============================================================
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { usePathname, useRouter } from 'next/navigation';
import Icon, { type IconName } from '@/components/ui/Icon';

interface NavItem {
  icon: IconName;
  label: string;
  href: string;
  section: 'overview' | 'academic' | 'support' | 'admin';
  roles?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { icon: 'dashboard',   label: 'Dashboard',     href: '/dashboard',   section: 'overview' },
  { icon: 'analytics',   label: 'Analytics',     href: '/analytics',   section: 'overview', roles: ['faculty', 'admin'] },

  { icon: 'courses',     label: 'Courses',       href: '/courses',     section: 'academic', roles: ['faculty', 'admin'] },
  { icon: 'modules',     label: 'Modules',       href: '/modules',     section: 'academic', roles: ['faculty', 'admin'] },
  { icon: 'assessments', label: 'Assessments',   href: '/assessments', section: 'academic', roles: ['faculty', 'admin'] },
  { icon: 'exam',        label: 'Exam Room',     href: '/quiz',        section: 'academic' },
  { icon: 'progress',    label: 'My Progress',   href: '/progress',    section: 'academic', roles: ['student'] },

  { icon: 'flag',        label: 'Support Flags', href: '/flags',       section: 'support',  roles: ['faculty', 'admin'] },
  { icon: 'playbook',    label: 'Playbooks',     href: '/playbooks',   section: 'support',  roles: ['faculty', 'admin'] },
  { icon: 'repeat',      label: 'Study Plan',    href: '/remedial',    section: 'support',  roles: ['student'] },

  { icon: 'settings',    label: 'Admin Console', href: '/admin',       section: 'admin',    roles: ['admin'] },
];

const SECTION_LABELS: Record<NavItem['section'], string> = {
  overview: 'Overview',
  academic: 'Learning',
  support:  'Support',
  admin:    'System',
};

export default function Sidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    document.querySelector('.app-layout')?.classList.toggle('sidebar-collapsed', collapsed);
  }, [collapsed]);

  if (!user) return null;

  const visible = NAV_ITEMS.filter(i => !i.roles || i.roles.includes(user.role));
  const sections = (['overview', 'academic', 'support', 'admin'] as const).filter(s =>
    visible.some(i => i.section === s)
  );

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const initials = `${user.first_name[0]}${user.last_name[0]}`.toUpperCase();
  const roleLabel = user.role.charAt(0).toUpperCase() + user.role.slice(1);

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`} aria-label="Main navigation">
      <div className="sidebar-logo">
        <a href="/dashboard" className="flex items-center gap-3" style={{ minWidth: 0 }} aria-label="EdCap home">
          <span className="sidebar-logo-icon"><Icon name="logo" size={18} strokeWidth={2} /></span>
          {!collapsed && <span className="sidebar-logo-name">EdCap</span>}
        </a>
        {!collapsed && (
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="btn btn-ghost btn-icon"
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <Icon name="panelLeft" size={17} />
          </button>
        )}
      </div>

      <nav className="sidebar-nav" aria-label="Primary">
        {collapsed && (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="nav-item"
            aria-label="Expand sidebar"
            title="Expand sidebar"
            style={{ marginBottom: 8 }}
          >
            <span className="nav-icon"><Icon name="chevronRight" /></span>
          </button>
        )}
        {sections.map(sec => (
          <div key={sec}>
            {!collapsed && <div className="sidebar-section-label">{SECTION_LABELS[sec]}</div>}
            {visible.filter(i => i.section === sec).map(item => {
              const active = pathname.startsWith(item.href);
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={`nav-item ${active ? 'active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                  title={collapsed ? item.label : undefined}
                >
                  <span className="nav-icon"><Icon name={item.icon} /></span>
                  {!collapsed && <span className="nav-label">{item.label}</span>}
                </a>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="user-pill" style={collapsed ? { justifyContent: 'center', padding: 6 } : undefined}>
          <div className="avatar avatar-sm" aria-hidden="true">{initials}</div>
          {!collapsed && (
            <div className="user-pill-info">
              <div className="user-pill-name">{user.first_name} {user.last_name}</div>
              <div className="user-pill-role">{roleLabel}</div>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={handleLogout}
              className="btn btn-ghost btn-icon"
              style={{ width: 30, height: 30, minHeight: 30 }}
              aria-label="Sign out"
              title="Sign out"
            >
              <Icon name="logout" size={16} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
