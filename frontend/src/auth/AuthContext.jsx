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

  // Usado tras un cambio de contraseña exitoso: refresca el usuario en contexto/localStorage
  // sin necesidad de volver a hacer login (ya trae debeCambiarPassword en false).
  const actualizarUsuario = useCallback((usuarioActualizado) => {
    setUsuario(usuarioActualizado);
    setUsuarioState(usuarioActualizado);
  }, []);

  // CEO/CFO/Cabeza de Jurídico tienen el mismo acceso administrativo que "Administrador" (son,
  // sobre todo, un puesto — el flujo de autorización ya los identifica por persona fija, no por
  // rol).
  const esAdmin = usuario && ['admin', 'super_admin', 'ceo', 'cfo', 'cabeza_juridico'].includes(usuario.rol);
  // Quién puede entrar al módulo de Franquicias (dashboard, nueva solicitud, clubes): dato
  // sensible por instrucción explícita de negocio, restringido a Jurídico/Cabeza de
  // Jurídico/CEO/CFO — deliberadamente sin "admin" genérico, pero con "super_admin" como respaldo
  // de sistema (ver ROLES_MODULO_FRANQUICIAS en backend/src/utils/roles.js, que es quien
  // realmente lo hace cumplir).
  const puedeFranquicias = usuario && ['super_admin', 'ceo', 'cfo', 'cabeza_juridico', 'juridico'].includes(usuario.rol);
  // Quién puede ver el apartado "Rentas" (calendario de renta consolidado de todo el
  // portafolio): dato financiero sensible, restringido a Super Admin/CEO/CFO/Jurídico —
  // deliberadamente sin "admin" genérico, a diferencia de esAdmin/puedeFranquicias.
  const puedeVerRentas = usuario && ['super_admin', 'ceo', 'cfo', 'cabeza_juridico', 'juridico'].includes(usuario.rol);

  const value = useMemo(
    () => ({ usuario, cargando, login, logout, esAdmin, puedeFranquicias, puedeVerRentas, actualizarUsuario }),
    [usuario, cargando, login, logout, esAdmin, puedeFranquicias, puedeVerRentas, actualizarUsuario]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
