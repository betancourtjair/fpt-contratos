import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import Spinner from '../../components/Spinner.jsx';
import { formatMonto, formatFecha } from '../../utils.js';
import { CATEGORIAS_RENTA } from './campos.js';

// Vista consolidada del calendario de renta de todos los leases (algo que ni el propio
// Leasecake ofrece: ahí solo se ve el calendario de renta dentro de cada lease individual).
export default function Rentas() {
  const [categoria, setCategoria] = useState('');
  const [soloVigente, setSoloVigente] = useState(true);
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;
    (async () => {
      setCargando(true);
      setError('');
      try {
        const d = await api.get('/arrendamientos/rentas', {
          categoria: categoria || undefined,
          vigente: soloVigente ? 'true' : undefined,
        });
        if (activo) setData(d);
      } catch (err) {
        if (activo) setError(err.message || 'No se pudo cargar la información de rentas.');
      } finally {
        if (activo) setCargando(false);
      }
    })();
    return () => { activo = false; };
  }, [categoria, soloVigente]);

  const resumenPorCategoria = data?.resumenPorCategoria || [];
  const proximosIncrementos = data?.proximosIncrementos || [];
  const renglones = data?.renglones || [];
  const totalVigente = resumenPorCategoria.reduce((acc, r) => acc + Number(r.montoTotal || 0), 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Rentas</h1>
          <p className="page-header-sub">Calendario de renta consolidado de todos los leases activos, por periodo y categoría.</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">{formatMonto(totalVigente)}</div>
          <div className="stat-label">Renta total vigente hoy</div>
        </div>
        {resumenPorCategoria.slice(0, 3).map((r) => (
          <div className="stat-card" key={r.categoria}>
            <div className="stat-value">{formatMonto(r.montoTotal)}</div>
            <div className="stat-label">{r.categoria}</div>
          </div>
        ))}
      </div>

      {resumenPorCategoria.length > 0 && (
        <div className="card">
          <div className="card-title">Renta vigente por categoría</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Categoría</th><th>Monto mensual</th></tr></thead>
              <tbody>
                {resumenPorCategoria.map((r) => (
                  <tr key={r.categoria}><td>{r.categoria}</td><td>{formatMonto(r.montoTotal)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {proximosIncrementos.length > 0 && (
        <div className="card">
          <div className="card-title">Próximos incrementos / cambios de renta</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Ubicación</th><th>Categoría</th><th>Desde</th><th>Nuevo monto</th><th>% cambio</th></tr>
              </thead>
              <tbody>
                {proximosIncrementos.map((p, i) => (
                  <tr key={i}>
                    <td>{p.locationNombre}</td>
                    <td>{p.categoria}</td>
                    <td>{formatFecha(p.startDate)}</td>
                    <td>{formatMonto(p.monto)}</td>
                    <td>{p.pctChange != null ? `${p.pctChange}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">Calendario de renta — detalle</div>
        <div className="filters-bar">
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Todas las categorías</option>
            {CATEGORIAS_RENTA.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={soloVigente} onChange={(e) => setSoloVigente(e.target.checked)} />
            Solo renglones vigentes hoy
          </label>
        </div>

        {cargando ? (
          <Spinner />
        ) : renglones.length === 0 ? (
          <div className="empty-state">No hay renglones de renta para este filtro.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ubicación</th>
                  <th>Categoría</th>
                  <th>Desde</th>
                  <th>Hasta</th>
                  <th>Monto</th>
                  <th>Frecuencia</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {renglones.map((r) => (
                  <tr key={r.id}>
                    <td>{r.locationNombre}<div className="muted" style={{ fontSize: 12 }}>{r.brandNombre}</div></td>
                    <td>{r.categoria}</td>
                    <td>{formatFecha(r.startDate)}</td>
                    <td>{r.endDate ? formatFecha(r.endDate) : '—'}</td>
                    <td>{formatMonto(r.monto)}</td>
                    <td>{r.frecuencia}</td>
                    <td><Link className="btn btn-secondary btn-sm" to={`/arrendamientos/leases/${r.leaseId}`}>Ver lease</Link></td>
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
