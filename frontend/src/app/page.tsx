'use client';
// Root page — redirects to /dashboard (or /login if unauthenticated)
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';

export default function RootPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      router.replace(user ? '/dashboard' : '/login');
    }
  }, [user, loading, router]);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-base)',
    }}>
      <div className="spinner" role="status" aria-label="Loading EdCap AI" style={{ width: 32, height: 32 }} />
    </div>
  );
}
