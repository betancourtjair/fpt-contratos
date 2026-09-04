import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import Spinner from './Spinner.jsx';

export default function ProtectedRoute({ children, adminOnly = false }) {
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

  return children;
}
