import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import Spinner from '../../components/Spinner.jsx';
import { formatMonto, formatFecha, diasRestantes } from '../../utils.js';

export default function DashboardArrendamientos() {
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;
    (async () => {
      setCargando(true);
      setError('');
      try {
        const d = await api.get('/arrendamientos/dashboard');
        if (activo) setData(d);
      } catch (err) {
        if (activo) setError(err.message || 'No se pudo cargar el dashboard.');
      } finally {
        if (activo) setCargando(false);
      }
    })();
    return () => { activo = false; };
  }, []);

  if (cargando) return <Spinner label="Cargando dashboard de Arrendamientos…" />;
  if (error) return <div className="alert alert-error">{error}</div>;

  const resumen = data?.resumen || {};
  const proximosVencimientos = data?.proximosVencimientos || [];
  const porBrand = data?.porBrand || [];
  const fechaInicioPagoRenta = data?.fechaInicioPagoRenta || [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Arrendamientos</h1>
          <p className="page-header-sub">Resumen general de ubicaciones y leases (reemplazo de Leasecake).</p>
        </div>
        <Link to="/arrendamientos/ubicaciones" className="btn btn-primary">Ver ubicaciones</Link>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">{resumen.totalUbicaciones ?? 0}</div>
          <div className="stat-label">Ubicaciones</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{resumen.leasesActivos ?? 0}</div>
          <div className="stat-label">Leases activos</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{formatMonto(resumen.rentaMensualTotal)}</div>
          <div className="stat-label">Renta mensual total</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{resumen.venciendo180Dias ?? 0}</div>
          <div className="stat-label">Vencen en 180 días</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">
            Próximos vencimientos (365 días)
            {proximosVencimientos.length > 0 && <span className="tag-pill">{proximosVencimientos.length}</span>}
          </div>
          {proximosVencimientos.length === 0 ? (
            <div className="empty-state">Sin leases próximos a vencer.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ubicación</th>
                    <th>Vence</th>
                    <th>Aviso de renovación</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {proximosVencimientos.map((v) => {
                    const dias = diasRestantes(v.expirationDate);
                    return (
                      <tr key={v.leaseId}>
                        <td>
                          {v.locationId ? (
                            <Link to={`/arrendamientos/ubicaciones/${v.locationId}`}>{v.locationNombre}</Link>
                          ) : (
                            v.locationNombre
                          )}
                        </td>
                        <td>
                          {formatFecha(v.expirationDate)}
                          {dias !== null && (
                            <div className="muted" style={{ fontSize: 12 }}>
                              {dias >= 0 ? `en ${dias} día${dias === 1 ? '' : 's'}` : `venció hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? '' : 's'}`}
                            </div>
                          )}
                        </td>
                        <td>{formatFecha(v.renewalNoticeDeadline)}</td>
                        <td><Link className="btn btn-secondary btn-sm" to={`/arrendamientos/leases/${v.leaseId}`}>Ver</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">Ubicaciones por brand</div>
          {porBrand.length === 0 ? (
            <div className="empty-state">Sin brands registrados.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Brand</th><th>Ubicaciones</th></tr>
                </thead>
                <tbody>
                  {porBrand.map((b) => (
                    <tr key={b.brandNombre}>
                      <td>{b.brandNombre || 'Sin brand'}</td>
                      <td>{b.numeroUbicaciones}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Fecha de inicio de pago de renta (leases activos)</div>
        {fechaInicioPagoRenta.length === 0 ? (
          <div className="empty-state">Sin leases activos.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Ubicación</th><th>Inicio de pago de renta</th><th>Vencimiento</th></tr>
              </thead>
              <tbody>
                {fechaInicioPagoRenta.map((f, i) => (
                  <tr key={i}>
                    <td>
                      {f.locationId ? (
                        <Link to={`/arrendamientos/ubicaciones/${f.locationId}`}>{f.locationNombre}</Link>
                      ) : (
                        f.locationNombre
                      )}
                    </td>
                    <td>{formatFecha(f.fechaInicioPagoRenta)}</td>
                    <td>{formatFecha(f.expirationDate)}</td>
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
