import { Link } from 'react-router-dom';
import { CATEGORIAS, TIPOS } from './operacionesConfig.js';
import { useAuth } from '../../auth/AuthContext.jsx';

export default function Operaciones() {
  const { usuario, gestionaOperaciones } = useAuth();

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Operaciones</h1>
          <p className="page-header-sub">
            {gestionaOperaciones
              ? 'Solicitudes de Operaciones para Jurídico.'
              : `Hola${usuario?.nombre ? `, ${usuario.nombre.split(' ')[0]}` : ''}. Elige el tipo de solicitud que quieres enviar a Jurídico.`}
          </p>
        </div>
        <Link to="/operaciones/solicitudes" className="btn btn-secondary">
          {gestionaOperaciones ? 'Ver todas las solicitudes' : 'Mis solicitudes'}
        </Link>
      </div>

      {Object.entries(CATEGORIAS).map(([catKey, cat]) => (
        <div className="card" key={catKey}>
          <div className="card-title">{cat.label}</div>
          <p className="page-header-sub" style={{ marginTop: 0 }}>{cat.descripcion}</p>
          <div className="stat-grid">
            {cat.tipos.map((tipoKey) => {
              const tipo = TIPOS[tipoKey];
              return (
                <Link
                  key={tipoKey}
                  to={`/operaciones/${catKey}/${tipo.ruta}`}
                  className="stat-card stat-card-clickable"
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>{tipo.label}</div>
                  <div className="stat-label" style={{ textTransform: 'none' }}>{tipo.descripcion}</div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
