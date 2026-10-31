'use client';
// ============================================================
// EdCap — App Shell Layout
// Wraps all authenticated pages with Sidebar + Topbar
// ============================================================
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-base)',
      }}>
        <div style={{ textAlign: 'center' }} role="status">
          <div className="spinner" aria-hidden="true" style={{ width: 36, height: 36, margin: '0 auto 16px' }} />
          <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Loading EdCap…</div>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="app-layout">
      <Sidebar />
      <main id="main-content" className="app-main" tabIndex={-1} aria-label="Main content">
        {children}
      </main>
    </div>
  );
}
