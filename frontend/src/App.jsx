import { Navigate, Route, Routes } from 'react-router-dom';
import Login from './pages/Login.jsx';
import FirmarEspera from './pages/FirmarEspera.jsx';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ListaContratos from './pages/contratos/ListaContratos.jsx';
import BusquedaAvanzada from './pages/contratos/BusquedaAvanzada.jsx';
import NuevaSolicitud from './pages/contratos/NuevaSolicitud.jsx';
import DetalleContrato from './pages/contratos/DetalleContrato.jsx';
import TiposContrato from './pages/admin/TiposContrato.jsx';
import FlujosAutorizacion from './pages/admin/FlujosAutorizacion.jsx';
import Usuarios from './pages/admin/Usuarios.jsx';
import DashboardFranquicias from './pages/franquicias/DashboardFranquicias.jsx';
import NuevaSolicitudFranquicia from './pages/franquicias/NuevaSolicitudFranquicia.jsx';
import Clubes from './pages/franquicias/Clubes.jsx';
import CambiarPassword from './pages/CambiarPassword.jsx';
import DashboardArrendamientos from './pages/arrendamientos/DashboardArrendamientos.jsx';
import Locations from './pages/arrendamientos/Locations.jsx';
import LocationDetalle from './pages/arrendamientos/LocationDetalle.jsx';
import Leases from './pages/arrendamientos/Leases.jsx';
import LeaseDetalle from './pages/arrendamientos/LeaseDetalle.jsx';
import Rentas from './pages/arrendamientos/Rentas.jsx';
import EventsArrendamientos from './pages/arrendamientos/Events.jsx';
import TasksArrendamientos from './pages/arrendamientos/Tasks.jsx';
import ContactsArrendamientos from './pages/arrendamientos/Contacts.jsx';
import BrandsArrendamientos from './pages/arrendamientos/Brands.jsx';
import CompaniesArrendamientos from './pages/arrendamientos/Companies.jsx';

// El módulo de Franquicias es exclusivo de super_admin/admin/ceo/cfo/cabeza_juridico/juridico
// (separado del resto de Contratos/Dashboard, que sí ven otros roles).
const ROLES_FRANQUICIAS = ['super_admin', 'admin', 'ceo', 'cfo', 'cabeza_juridico', 'juridico'];

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/firmar-espera" element={<FirmarEspera />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="cambiar-password" element={<CambiarPassword />} />
        {/* "Contratos" se dividió en tres vistas por bloque de estatus (ver ListaContratos.jsx):
            Solicitudes (borrador/en_revision/en_autorizacion/rechazado), Contratos vigentes
            (autorizado/activo/por_vencer) y Archivo (vencido/cancelado). La ruta vieja
            /contratos redirige a Solicitudes por si queda algún enlace o marcador viejo. */}
        <Route path="contratos" element={<Navigate to="/solicitudes" replace />} />
        <Route path="solicitudes" element={<ListaContratos vista="solicitudes" />} />
        <Route path="contratos-vigentes" element={<ListaContratos vista="vigentes" />} />
        <Route path="archivo" element={<ListaContratos vista="archivo" />} />
        <Route path="busqueda" element={<BusquedaAvanzada />} />
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

        {/* Módulo de Arrendamientos (reemplazo de Leasecake): abierto a cualquier usuario
            autenticado en modo lectura; las acciones de escritura se gatean dentro de cada
            página con useAuth().esAdmin (mismo nivel que el resto de la app: super_admin/
            admin/ceo/cfo/cabeza_juridico). */}
        <Route path="arrendamientos" element={<DashboardArrendamientos />} />
        <Route path="arrendamientos/ubicaciones" element={<Locations />} />
        <Route path="arrendamientos/ubicaciones/:id" element={<LocationDetalle />} />
        <Route path="arrendamientos/leases" element={<Leases />} />
        <Route path="arrendamientos/leases/:id" element={<LeaseDetalle />} />
        <Route path="arrendamientos/rentas" element={<Rentas />} />
        <Route path="arrendamientos/eventos" element={<EventsArrendamientos />} />
        <Route path="arrendamientos/tareas" element={<TasksArrendamientos />} />
        <Route path="arrendamientos/contactos" element={<ContactsArrendamientos />} />
        <Route path="arrendamientos/brands" element={<BrandsArrendamientos />} />
        <Route path="arrendamientos/companies" element={<CompaniesArrendamientos />} />

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
