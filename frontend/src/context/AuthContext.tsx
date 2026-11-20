import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { User, LoginCredentials } from '../types';
import authApi from '../api/auth.api';
import { isSessionExpired } from '../api/client';
import toast from 'react-hot-toast';
import { getAuthToken, isNativeApp, setAuthToken } from '../native';
import { startStartupSession } from './startupSession';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
  hasRole: (roles: string[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [startupUnavailable, setStartupUnavailable] = useState(false);
  const [startupChecking, setStartupChecking] = useState(false);
  const retryStartup = useRef<() => void>(() => {});

  // Only a confirmed 401 ends a saved session. Retry temporary startup failures.
  useEffect(() => {
    if (isNativeApp && !getAuthToken()) {
      setLoading(false);
      return;
    }
    const startup = startStartupSession({
      getUser: signal => authApi.getMe({ signal, timeout: 15000 }),
      clearSession: () => setAuthToken(null),
      onChecking: () => setStartupChecking(true),
      onUnavailable: () => {
        setStartupUnavailable(true);
        setStartupChecking(false);
      },
      onAuthenticated: userData => {
        setUser(userData);
        setLoading(false);
      },
      onSignedOut: () => {
        setUser(null);
        setLoading(false);
      },
    });
    retryStartup.current = () => void startup.retry();
    return () => {
      retryStartup.current = () => {};
      startup.dispose();
    };
  }, []);

  // Keep the session alive without signing out on temporary connectivity failures.
  useEffect(() => {
    if (!user) return;

    const refreshInterval = setInterval(async () => {
      try {
        await authApi.refresh();
        console.log('[Auth] Token refreshed automatically');
      } catch (error) {
        console.error('[Auth] Auto-refresh failed:', error);
        if (isSessionExpired(error)) {
          await setAuthToken(null);
          setUser(null);
        }
      }
    }, 10 * 60 * 1000); // Renew while the app is active

    return () => clearInterval(refreshInterval);
  }, [user]);

  const login = async (credentials: LoginCredentials) => {
    try {
      const userData = await authApi.login(credentials);
      setUser(userData);
      setLoading(false);
      toast.success(`Welcome back, ${userData.firstName}!`);
      console.log('[Auth] Login successful, auto-refresh enabled');
    } catch (error: any) {
      const message = error.response?.data?.error || 'Login failed';
      toast.error(message);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
      setUser(null);
      toast.success('Logged out successfully');
    } catch (error) {
      console.error('Logout error:', error);
      // Clear user anyway
      setUser(null);
    } finally {
      await setAuthToken(null);
    }
  };

  const refreshUser = async () => {
    try {
      const userData = await authApi.getMe();
      setUser(userData);
    } catch (error) {
      console.error('[Auth] Failed to refresh user data:', error);
    }
  };

  const hasRole = (roles: string[]): boolean => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  const value: AuthContextType = {
    user,
    loading,
    login,
    logout,
    refreshUser,
    isAuthenticated: !!user,
    hasRole,
  };

  return (
    <AuthContext.Provider value={value}>
      {loading ? (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
          <div className="max-w-sm text-center space-y-4">
            <h1 className="text-xl font-semibold text-gray-900">
              {startupUnavailable ? 'Unable to connect' : 'Restoring your session…'}
            </h1>
            <p role="status" className="text-gray-600">
              {startupUnavailable
                ? 'Your saved login has been kept. We’ll reconnect automatically when the portal is available.'
                : 'Connecting to your portal.'}
            </p>
            {startupUnavailable && (
              <button type="button" onClick={() => retryStartup.current()} disabled={startupChecking}
                className="min-h-11 rounded-md bg-indigo-600 px-5 py-2 text-white disabled:opacity-60">
                {startupChecking ? 'Connecting…' : 'Try again'}
              </button>
            )}
          </div>
        </div>
      ) : children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
