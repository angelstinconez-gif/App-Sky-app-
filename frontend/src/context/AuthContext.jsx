import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../api/endpoints';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('skypv_access_token');
    if (!token) {
      setLoading(false);
      return;
    }
    authApi
      .me()
      .then(setUser)
      .catch(() => {
        localStorage.removeItem('skypv_access_token');
        localStorage.removeItem('skypv_refresh_token');
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await authApi.login(email, password);
    localStorage.setItem('skypv_access_token', data.accessToken);
    localStorage.setItem('skypv_refresh_token', data.refreshToken);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch (e) {}
    localStorage.removeItem('skypv_access_token');
    localStorage.removeItem('skypv_refresh_token');
    setUser(null);
  }, []);

  // hasRole estable: depende solo del rol del usuario
  const hasRole = useCallback(
    (...roles) => !!user && roles.includes(user.role),
    [user]
  );

  // value estable: solo cambia cuando user/loading cambian de verdad
  const value = useMemo(
    () => ({ user, loading, login, logout, hasRole }),
    [user, loading, login, logout, hasRole]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
