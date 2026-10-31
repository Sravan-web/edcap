'use client';
// ============================================================
// EdCap — Sidebar Component
// ============================================================
import { useAuth } from '@/lib/auth-context';
import { usePathname, useRouter } from 'next/navigation';

interface NavItem {
  icon: string;
  label: string;
  href: string;
  roles?: string[];
}

const NAV_ITEMS: NavItem[] = [
  // Common
  { icon: '🏠', label: 'Dashboard',    href: '/dashboard' },

  // Faculty + Admin
  { icon: '📊', label: 'Analytics',    href: '/analytics',  roles: ['faculty', 'admin'] },
  { icon: '🚩', label: 'Support Flags',href: '/flags',      roles: ['faculty', 'admin'] },
  { icon: '📋', label: 'Assessments',  href: '/assessments',roles: ['faculty', 'admin'] },
  { icon: '📚', label: 'Modules',      href: '/modules',    roles: ['faculty', 'admin'] },
  { icon: '🎓', label: 'Courses',      href: '/courses',    roles: ['faculty', 'admin'] },
  { icon: '📖', label: 'Playbooks',    href: '/playbooks',  roles: ['faculty', 'admin'] },

  // Student
  { icon: '🧪', label: 'Daily Quiz',   href: '/quiz',       roles: ['student'] },
  { icon: '📈', label: 'My Progress',  href: '/progress',   roles: ['student'] },
  { icon: '🔁', label: 'Remedial',     href: '/remedial',   roles: ['student'] },

  // Admin
  { icon: '⚙️',  label: 'Admin',        href: '/admin',      roles: ['admin'] },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  if (!user) return null;

  const visibleItems = NAV_ITEMS.filter(
    item => !item.roles || item.roles.includes(user.role)
  );

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const initials = `${user.first_name[0]}${user.last_name[0]}`.toUpperCase();
  const roleLabel = user.role.charAt(0).toUpperCase() + user.role.slice(1);

  return (
    <aside className="sidebar" aria-label="Main sidebar navigation">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon" aria-hidden="true">🎓</div>
        <span className="sidebar-logo-name gradient-text">EdCap</span>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav" aria-label="Primary">
        {visibleItems.map(item => {
          const isActive = pathname.startsWith(item.href);
          return (
            <a
              key={item.href}
              href={item.href}
              className={`nav-item ${isActive ? 'active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="user-pill" role="region" aria-label="Current user information">
          <div className="avatar" aria-hidden="true">{initials}</div>
          <div className="user-pill-info">
            <div className="user-pill-name">{user.first_name} {user.last_name}</div>
            <div className="user-pill-role">{roleLabel}</div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="btn btn-ghost btn-sm w-full mt-4"
          style={{ justifyContent: 'flex-start', color: 'var(--text-muted)' }}
          aria-label="Sign out of EdCap"
        >
          <span aria-hidden="true">🚪</span> Sign out
        </button>
      </div>
    </aside>
  );
}
