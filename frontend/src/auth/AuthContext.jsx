import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, getUsuario, setToken, setUsuario, clearSesion, setUnauthorizedHandler } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuarioState] = useState(() => getUsuario());
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUsuarioState(null);
    });
  }, []);

  useEffect(() => {
    async function bootstrap() {
      const token = getToken();
      if (!token) {
        setCargando(false);
        return;
      }
      try {
        const data = await api.get('/auth/me');
        const u = data?.usuario || data;
        setUsuarioState(u);
        setUsuario(u);
      } catch {
        clearSesion();
        setUsuarioState(null);
      } finally {
        setCargando(false);
      }
    }
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await api.post('/auth/login', { email, password });
    setToken(data.token);
    setUsuario(data.usuario);
    setUsuarioState(data.usuario);
    return data.usuario;
  }, []);

  const logout = useCallback(() => {
    clearSesion();
    setUsuarioState(null);
  }, []);

  const esAdmin = usuario && ['admin', 'super_admin'].includes(usuario.rol);

  const value = useMemo(
    () => ({ usuario, cargando, login, logout, esAdmin }),
    [usuario, cargando, login, logout, esAdmin]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
