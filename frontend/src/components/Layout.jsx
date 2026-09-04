import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

const ROL_LABELS = {
  super_admin: 'Super admin',
  admin: 'Administrador',
  juridico: 'Jurídico',
  aprobador: 'Aprobador',
  solicitante: 'Solicitante',
  lectura: 'Lectura',
};

function NavItem({ to, children, end }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
      {children}
    </NavLink>
  );
}

export default function Layout() {
  const { usuario, logout, esAdmin } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark">FPT</div>
          <div className="sidebar-brand-text">
            Contratos
            <small>Fitness Para Todos</small>
          </div>
        </div>

        <nav className="sidebar-nav">
          <NavItem to="/" end>Dashboard</NavItem>
          <NavItem to="/contratos">Contratos</NavItem>
          <NavItem to="/contratos/nueva">Nueva solicitud</NavItem>
        </nav>

        {esAdmin && (
          <>
            <div className="sidebar-section-label">Administración</div>
            <nav className="sidebar-nav">
              <NavItem to="/admin/tipos-contrato">Tipos de contrato</NavItem>
              <NavItem to="/admin/flujos">Flujos de autorización</NavItem>
              <NavItem to="/admin/usuarios">Usuarios</NavItem>
            </nav>
          </>
        )}

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <strong>{usuario?.nombre}</strong>
            <span>{ROL_LABELS[usuario?.rol] || usuario?.rol}</span>
          </div>
          <button className="sidebar-logout" onClick={logout}>Cerrar sesión</button>
        </div>
      </aside>

      <div className="main-area">
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
