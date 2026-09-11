import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import Spinner from './Spinner.jsx';

export default function ProtectedRoute({ children, adminOnly = false, roles }) {
  const { usuario, cargando, esAdmin } = useAuth();
  const location = useLocation();

  if (cargando) {
    return <Spinner label="Verificando sesión…" />;
  }

  if (!usuario) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (adminOnly && !esAdmin) {
    return <Navigate to="/" replace />;
  }

  // roles: lista explícita de roles permitidos (p.ej. el módulo de franquicias, al que
  // además de admin/super_admin también entra jurídico) — adminOnly no alcanza para eso.
  if (roles && !roles.includes(usuario.rol)) {
    return <Navigate to="/" replace />;
  }

  // Si el usuario tiene pendiente el cambio de contraseña (forzado al crear su cuenta, o
  // tras un reseteo), se le bloquea el resto de la app hasta que lo haga — salvo que ya
  // esté precisamente en esa pantalla.
  if (usuario.debeCambiarPassword && location.pathname !== '/cambiar-password') {
    return <Navigate to="/cambiar-password" replace />;
  }

  return children;
}
