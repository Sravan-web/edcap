'use client';
// ============================================================
// EdCap — Auth Context
// ============================================================
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import { usersApi, authApi, type UserProfile } from '@/lib/api';

interface AuthState {
  user: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await usersApi.me();
      if (typeof window !== 'undefined' && me?.email) {
        window.localStorage.setItem('edcap_user_email', me.email);
      }
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    if (typeof window !== 'undefined' && user?.email) {
      window.localStorage.setItem('edcap_user_email', user.email);
    }
  }, [user]);

  const login = async (email: string, password: string) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('edcap_user_email', email.trim().toLowerCase());
    }
    await authApi.login(email, password);
    await refresh();
  };

  const logout = async () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('edcap_user_email');
    }
    await authApi.logout().catch(() => {});
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
