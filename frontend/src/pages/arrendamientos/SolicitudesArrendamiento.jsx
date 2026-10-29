import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, unwrap } from '../../api.js';
import Spinner from '../../components/Spinner.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { ESTATUS_LABELS, EstatusBadge, fmtFecha } from './solicitudesConfig.jsx';

const ROLES_VEN_TODO = ['super_admin', 'admin', 'ceo', 'cfo', 'cabeza_juridico', 'juridico'];

export default function SolicitudesArrendamiento() {
  const { usuario } = useAuth();
  const venTodo = ROLES_VEN_TODO.includes(usuario?.rol);
  const [estatus, setEstatus] = useState('');
  const [texto, setTexto] = useState('');
  const [q, setQ] = useState('');
  const [etiquetas, setEtiquetas] = useState({});
  const [solicitudes, setSolicitudes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/arrendamientos/solicitudes/formulario')
      .then((d) => setEtiquetas(d.etiquetasTramite || {}))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setQ(texto.trim()), 300);
    return () => clearTimeout(t);
  }, [texto]);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError('');
    api.get('/arrendamientos/solicitudes', { estatus, texto: q })
      .then((data) => { if (activo) setSolicitudes(unwrap(data, 'solicitudes') || []); })
      .catch((err) => { if (activo) setError(err.message || 'No se pudieron cargar las solicitudes.'); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, [estatus, q]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{venTodo ? 'Solicitudes de arrendamiento' : 'Mis solicitudes de arrendamiento'}</h1>
          <p className="page-header-sub">
            {venTodo ? 'Solicitudes de contrato de Arrendamiento enviadas a Jurídico.' : 'Solicitudes que has enviado a Jurídico.'}
          </p>
        </div>
        <Link to="/arrendamientos/solicitudes/nueva" className="btn btn-primary">+ Nueva solicitud</Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="filters-bar">
          <select value={estatus} onChange={(e) => setEstatus(e.target.value)}>
            <option value="">Todos los estatus</option>
            {Object.entries(ESTATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <input type="search" placeholder="Buscar folio, arrendador, inmueble…" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>

        {cargando ? (
          <Spinner label="Cargando solicitudes…" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Folio</th><th>Trámite</th><th>Arrendador</th><th>Inmueble</th>
                  {venTodo && <th>Solicitante</th>}{venTodo && <th>Asignada a</th>}
                  <th>Fecha</th><th>Estatus</th>
                </tr>
              </thead>
              <tbody>
                {solicitudes.length === 0 && (
                  <tr><td colSpan={venTodo ? 8 : 6} className="table-empty">Sin solicitudes.</td></tr>
                )}
                {solicitudes.map((s) => (
                  <tr key={s.id}>
                    <td><Link to={`/arrendamientos/solicitudes/${s.id}`}>{s.folio}</Link></td>
                    <td>{etiquetas[s.tipoTramite] || s.tipoTramite}</td>
                    <td>{s.arrendadorNombre}</td>
                    <td>{s.inmuebleResumen || '—'}</td>
                    {venTodo && <td>{s.solicitanteNombre}</td>}
                    {venTodo && <td>{s.asignadoANombre || <span className="page-header-sub">Sin asignar</span>}</td>}
                    <td>{fmtFecha(s.createdAt)}</td>
                    <td><EstatusBadge estatus={s.estatus} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
