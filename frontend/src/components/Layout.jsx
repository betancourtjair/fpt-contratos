import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import fptLogoMark from '../assets/fpt-logo-mark.png';

const ROL_LABELS = {
  super_admin: 'Super admin',
  admin: 'Administrador',
  ceo: 'CEO',
  cfo: 'CFO',
  cabeza_juridico: 'Cabeza de Jurídico',
  juridico: 'Jurídico',
  aprobador: 'Aprobador',
  solicitante: 'Solicitante',
  operaciones: 'Operaciones',
  lectura: 'Lectura',
};

// Estado (abierto/cerrado) de las secciones colapsables del menú, persistido en localStorage
// para que el usuario no tenga que volver a expandirlas cada vez que recarga la app.
const SIDEBAR_ACCORDION_KEY = 'fpt_sidebar_secciones_abiertas';

function cargarSeccionesAbiertas() {
  try {
    const raw = localStorage.getItem(SIDEBAR_ACCORDION_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // localStorage no disponible (modo privado, etc.); usamos el valor por defecto.
  }
  return { contratos: true, franquicias: true, arrendamientos: true, administracion: true, operaciones: true, opSocios: true, opAutoridades: true };
}

function NavItem({ to, children, end }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
      {children}
    </NavLink>
  );
}

// Sección colapsable del menú lateral: el label actúa como botón que expande/contrae el
// bloque de enlaces, con una flechita que indica el estado actual.
function SidebarSection({ id, titulo, abierta, onToggle, children }) {
  return (
    <div className="sidebar-section">
      <button
        type="button"
        className="sidebar-section-label sidebar-section-toggle"
        onClick={() => onToggle(id)}
        aria-expanded={abierta}
      >
        <span>{titulo}</span>
        <span className={`sidebar-chevron${abierta ? '' : ' collapsed'}`} aria-hidden="true">▾</span>
      </button>
      <div className={`sidebar-collapsible${abierta ? '' : ' collapsed'}`}>
        <nav className="sidebar-nav">{children}</nav>
      </div>
    </div>
  );
}

// Submenu de segundo nivel dentro de la seccion Operaciones ("Atencion a Socios" / "Atencion a
// Autoridades"): se expande al hacer clic y muestra sus formularios.
function SidebarSubgroup({ id, titulo, abierto, onToggle, children }) {
  return (
    <div className="sidebar-subgroup">
      <button
        type="button"
        className="sidebar-link sidebar-subgroup-toggle"
        onClick={() => onToggle(id)}
        aria-expanded={abierto}
      >
        <span>{titulo}</span>
        <span className={`sidebar-chevron${abierto ? '' : ' collapsed'}`} aria-hidden="true">▾</span>
      </button>
      {abierto && <div className="sidebar-subgroup-items">{children}</div>}
    </div>
  );
}

export default function Layout() {
  const { usuario, logout, esAdmin, puedeFranquicias, puedeVerRentas, esOperaciones, puedeOperaciones } = useAuth();
  const [secciones, setSecciones] = useState(cargarSeccionesAbiertas);
  const location = useLocation();

  // El rol 'operaciones' solo puede estar en el modulo Operaciones (el backend tambien lo hace
  // cumplir): cualquier otra ruta lo regresa ahi.
  if (esOperaciones && !location.pathname.startsWith('/operaciones') && location.pathname !== '/cambiar-password') {
    return <Navigate to="/operaciones" replace />;
  }

  function toggleSeccion(id) {
    setSecciones((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(SIDEBAR_ACCORDION_KEY, JSON.stringify(next));
      } catch {
        // No es crítico si no se puede persistir la preferencia.
      }
      return next;
    });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark">
            <img src={fptLogoMark} alt="Fitness Para Todos" />
          </div>
          <div className="sidebar-brand-text">
            Contratos
            <small>Fitness Para Todos</small>
          </div>
        </div>

        {esOperaciones && (
          <SidebarSection
            id="operaciones"
            titulo="Operaciones"
            abierta={secciones.operaciones !== false}
            onToggle={toggleSeccion}
          >
            <NavItem to="/operaciones" end>Inicio</NavItem>
            <SidebarSubgroup id="opSocios" titulo="Atención a Socios" abierto={secciones.opSocios !== false} onToggle={toggleSeccion}>
              <NavItem to="/operaciones/socios/baja-socio">Baja de socio</NavItem>
              <NavItem to="/operaciones/socios/baja-invitado">Baja de invitado</NavItem>
            </SidebarSubgroup>
            <SidebarSubgroup id="opAutoridades" titulo="Atención a Autoridades" abierto={secciones.opAutoridades !== false} onToggle={toggleSeccion}>
              <NavItem to="/operaciones/autoridades/citatorio-profeco">Citatorios PROFECO</NavItem>
              <NavItem to="/operaciones/autoridades/solicitud-fiscalia">Fiscalías y MP</NavItem>
            </SidebarSubgroup>
            <NavItem to="/operaciones/solicitudes">{esOperaciones ? 'Mis solicitudes' : 'Solicitudes'}</NavItem>
          </SidebarSection>
        )}

        {!esOperaciones && (
          <>
            <SidebarSection
              id="contratos"
              titulo="Contratos"
              abierta={secciones.contratos !== false}
              onToggle={toggleSeccion}
            >
              <NavItem to="/" end>Dashboard</NavItem>
              <NavItem to="/solicitudes">Solicitudes</NavItem>
              <NavItem to="/contratos-vigentes">Contratos vigentes</NavItem>
              <NavItem to="/archivo">Archivo</NavItem>
              <NavItem to="/busqueda">Búsqueda avanzada</NavItem>
              <NavItem to="/contratos/nueva">Nueva solicitud</NavItem>
            </SidebarSection>

            {puedeFranquicias && (
              <SidebarSection
                id="franquicias"
                titulo="Franquicias"
                abierta={secciones.franquicias !== false}
                onToggle={toggleSeccion}
              >
                <NavItem to="/franquicias" end>Dashboard</NavItem>
                <NavItem to="/franquicias/nueva">Nueva solicitud</NavItem>
                <NavItem to="/franquicias/clubes">Clubes</NavItem>
                <NavItem to="/franquicias/alertas">Alertas</NavItem>
                <NavItem to="/franquicias/alertas/destinatarios">Destinatarios de alertas</NavItem>
              </SidebarSection>
            )}

            <SidebarSection
              id="arrendamientos"
              titulo="Arrendamientos"
              abierta={secciones.arrendamientos !== false}
              onToggle={toggleSeccion}
            >
              <NavItem to="/arrendamientos" end>Dashboard</NavItem>
              <NavItem to="/arrendamientos/ubicaciones">Ubicaciones</NavItem>
              <NavItem to="/arrendamientos/leases">Leases</NavItem>
              {puedeVerRentas && <NavItem to="/arrendamientos/rentas">Rentas</NavItem>}
              <NavItem to="/arrendamientos/eventos">Eventos</NavItem>
              <NavItem to="/arrendamientos/tareas">Tareas</NavItem>
              <NavItem to="/arrendamientos/contactos">Contactos</NavItem>
              <NavItem to="/arrendamientos/brands">Brands</NavItem>
              <NavItem to="/arrendamientos/companies">Companies</NavItem>
            </SidebarSection>

            {puedeOperaciones && (
              <SidebarSection
                id="operaciones"
                titulo="Operaciones"
                abierta={secciones.operaciones !== false}
                onToggle={toggleSeccion}
              >
                <NavItem to="/operaciones" end>Inicio</NavItem>
                <SidebarSubgroup id="opSocios" titulo="Atención a Socios" abierto={secciones.opSocios !== false} onToggle={toggleSeccion}>
                  <NavItem to="/operaciones/socios/baja-socio">Baja de socio</NavItem>
                  <NavItem to="/operaciones/socios/baja-invitado">Baja de invitado</NavItem>
                </SidebarSubgroup>
                <SidebarSubgroup id="opAutoridades" titulo="Atención a Autoridades" abierto={secciones.opAutoridades !== false} onToggle={toggleSeccion}>
                  <NavItem to="/operaciones/autoridades/citatorio-profeco">Citatorios PROFECO</NavItem>
                  <NavItem to="/operaciones/autoridades/solicitud-fiscalia">Fiscalías y MP</NavItem>
                </SidebarSubgroup>
                <NavItem to="/operaciones/solicitudes">{esOperaciones ? 'Mis solicitudes' : 'Solicitudes'}</NavItem>
              </SidebarSection>
            )}

            {esAdmin && (
              <SidebarSection
                id="administracion"
                titulo="Administración"
                abierta={secciones.administracion !== false}
                onToggle={toggleSeccion}
              >
                <NavItem to="/admin/tipos-contrato">Tipos de contrato</NavItem>
                <NavItem to="/admin/flujos">Flujos de autorización</NavItem>
                <NavItem to="/admin/usuarios">Usuarios</NavItem>
              </SidebarSection>
            )}

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
