import { Navigate, Route, Routes } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ListaContratos from './pages/contratos/ListaContratos.jsx';
import NuevaSolicitud from './pages/contratos/NuevaSolicitud.jsx';
import DetalleContrato from './pages/contratos/DetalleContrato.jsx';
import TiposContrato from './pages/admin/TiposContrato.jsx';
import FlujosAutorizacion from './pages/admin/FlujosAutorizacion.jsx';
import Usuarios from './pages/admin/Usuarios.jsx';
import DashboardFranquicias from './pages/franquicias/DashboardFranquicias.jsx';
import NuevaSolicitudFranquicia from './pages/franquicias/NuevaSolicitudFranquicia.jsx';
import Clubes from './pages/franquicias/Clubes.jsx';

// El módulo de Franquicias es exclusivo de super_admin/admin/juridico (separado del resto
// de Contratos/Dashboard, que sí ven otros roles).
const ROLES_FRANQUICIAS = ['super_admin', 'admin', 'juridico'];

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="contratos" element={<ListaContratos />} />
        <Route path="contratos/nueva" element={<NuevaSolicitud />} />
        <Route path="contratos/:id" element={<DetalleContrato />} />

        <Route
          path="franquicias"
          element={
            <ProtectedRoute roles={ROLES_FRANQUICIAS}>
              <DashboardFranquicias />
            </ProtectedRoute>
          }
        />
        <Route
          path="franquicias/nueva"
          element={
            <ProtectedRoute roles={ROLES_FRANQUICIAS}>
              <NuevaSolicitudFranquicia />
            </ProtectedRoute>
          }
        />
        <Route
          path="franquicias/clubes"
          element={
            <ProtectedRoute roles={ROLES_FRANQUICIAS}>
              <Clubes />
            </ProtectedRoute>
          }
        />

        <Route
          path="admin/tipos-contrato"
          element={
            <ProtectedRoute adminOnly>
              <TiposContrato />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/flujos"
          element={
            <ProtectedRoute adminOnly>
              <FlujosAutorizacion />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/usuarios"
          element={
            <ProtectedRoute adminOnly>
              <Usuarios />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
