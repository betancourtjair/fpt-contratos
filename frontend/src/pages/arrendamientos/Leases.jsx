import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, unwrap } from '../../api.js';
import Spinner from '../../components/Spinner.jsx';
import { formatFecha } from '../../utils.js';
import { ESTATUS_LEASE } from './campos.js';

export default function Leases() {
  const [leases, setLeases] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [estatusFiltro, setEstatusFiltro] = useState('');

  useEffect(() => {
    let activo = true;
    (async () => {
      setCargando(true);
      setError('');
      try {
        const d = await api.get('/arrendamientos/leases');
        if (activo) setLeases(unwrap(d, 'leases') || []);
      } catch (err) {
        if (activo) setError(err.message || 'No se pudieron cargar los leases.');
      } finally {
        if (activo) setCargando(false);
      }
    })();
    return () => { activo = false; };
  }, []);

  const filtrados = leases.filter((l) => {
    if (estatusFiltro && l.estatus !== estatusFiltro) return false;
    if (busqueda && !`${l.locationNombre} ${l.leaseName || ''}`.toLowerCase().includes(busqueda.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Leases</h1>
          <p className="page-header-sub">Todos los contratos de arrendamiento, de todas las ubicaciones.</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="filters-bar">
        <input
          className="search-input"
          placeholder="Buscar por ubicación o nombre del lease…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <select value={estatusFiltro} onChange={(e) => setEstatusFiltro(e.target.value)}>
          <option value="">Todos los estatus</option>
          {ESTATUS_LEASE.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {cargando ? (
        <Spinner />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ubicación</th>
                <th>Nombre del lease</th>
                <th>Company</th>
                <th>Estatus</th>
                <th>Vence</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr><td colSpan={6} className="table-empty">No hay leases para este filtro.</td></tr>
              ) : (
                filtrados.map((l) => (
                  <tr key={l.id}>
                    <td><Link to={`/arrendamientos/ubicaciones/${l.locationId}`}>{l.locationNombre}</Link></td>
                    <td>{l.leaseName || '(sin nombre)'}</td>
                    <td>{l.tenantCompanyNombre || '—'}</td>
                    <td><span className={`badge badge-${l.estatus}`}>{l.estatus}</span></td>
                    <td>{formatFecha(l.expirationDate)}</td>
                    <td><Link className="btn btn-secondary btn-sm" to={`/arrendamientos/leases/${l.id}`}>Ver</Link></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
