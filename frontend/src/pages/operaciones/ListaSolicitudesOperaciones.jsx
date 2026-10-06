import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, unwrap } from '../../api.js';
import Spinner from '../../components/Spinner.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { CATEGORIAS, TIPOS, ESTATUS_LABELS } from './operacionesConfig.js';

export function EstatusOperacionesBadge({ estatus }) {
  const clase = estatus === 'atendida' ? 'activo' : estatus === 'en_proceso' ? 'por_vencer' : 'borrador';
  return <span className={`badge badge-${clase}`}>{ESTATUS_LABELS[estatus] || estatus}</span>;
}

function fmtFecha(valor) {
  if (!valor) return '—';
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function ListaSolicitudesOperaciones() {
  const { gestionaOperaciones } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const categoria = searchParams.get('categoria') || '';
  const tipo = searchParams.get('tipo') || '';
  const estatus = searchParams.get('estatus') || '';
  const [texto, setTexto] = useState('');
  const [q, setQ] = useState('');

  const [solicitudes, setSolicitudes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setQ(texto.trim()), 300);
    return () => clearTimeout(t);
  }, [texto]);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError('');
    api.get('/operaciones/solicitudes', { categoria, tipo, estatus, texto: q })
      .then((data) => { if (activo) setSolicitudes(unwrap(data, 'solicitudes') || []); })
      .catch((err) => { if (activo) setError(err.message || 'No se pudieron cargar las solicitudes.'); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, [categoria, tipo, estatus, q]);

  function setFiltro(clave, valor) {
    const next = new URLSearchParams(searchParams);
    if (valor) next.set(clave, valor); else next.delete(clave);
    if (clave === 'categoria') next.delete('tipo');
    setSearchParams(next);
  }

  const tiposVisibles = categoria ? CATEGORIAS[categoria]?.tipos || [] : Object.keys(TIPOS);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{gestionaOperaciones ? 'Solicitudes de Operaciones' : 'Mis solicitudes'}</h1>
          <p className="page-header-sub">
            {gestionaOperaciones ? 'Todas las solicitudes enviadas por Operaciones a Jurídico.' : 'Solicitudes que has enviado a Jurídico.'}
          </p>
        </div>
        <Link to="/operaciones" className="btn btn-primary">+ Nueva solicitud</Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="filters-bar">
          <select value={categoria} onChange={(e) => setFiltro('categoria', e.target.value)}>
            <option value="">Todas las categorías</option>
            {Object.entries(CATEGORIAS).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
          </select>
          <select value={tipo} onChange={(e) => setFiltro('tipo', e.target.value)}>
            <option value="">Todos los tipos</option>
            {tiposVisibles.map((k) => <option key={k} value={k}>{TIPOS[k].label}</option>)}
          </select>
          <select value={estatus} onChange={(e) => setFiltro('estatus', e.target.value)}>
            <option value="">Todos los estatus</option>
            {Object.entries(ESTATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <input type="search" placeholder="Buscar folio, club, gerente, socio…" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>

        {cargando ? (
          <Spinner label="Cargando solicitudes…" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Tipo</th>
                  <th>Club</th>
                  <th>Gerente / Subgerente</th>
                  {gestionaOperaciones && <th>Capturada por</th>}
                  {gestionaOperaciones && <th>Asignada a</th>}
                  <th>Fecha</th>
                  <th>Estatus</th>
                </tr>
              </thead>
              <tbody>
                {solicitudes.length === 0 && (
                  <tr><td colSpan={gestionaOperaciones ? 8 : 6} className="table-empty">Sin solicitudes.</td></tr>
                )}
                {solicitudes.map((s) => (
                  <tr key={s.id}>
                    <td><Link to={`/operaciones/solicitudes/${s.id}`}>{s.folio}</Link></td>
                    <td>{TIPOS[s.tipo]?.label || s.tipo}</td>
                    <td>{s.clubNombre}</td>
                    <td>{s.gerenteNombre}</td>
                    {gestionaOperaciones && <td>{s.solicitanteNombre}</td>}
                    {gestionaOperaciones && <td>{s.asignadoANombre || <span className="page-header-sub">Sin asignar</span>}</td>}
                    <td>{fmtFecha(s.createdAt)}</td>
                    <td><EstatusOperacionesBadge estatus={s.estatus} /></td>
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
