import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Spinner from '../components/Spinner.jsx';
import EstatusBadge, { estatusLabel } from '../components/EstatusBadge.jsx';
import { formatMonto, formatFecha, diasRestantes } from '../utils.js';

const ORDEN_ESTATUS = [
  'borrador', 'en_revision', 'en_autorizacion', 'autorizado',
  'activo', 'por_vencer', 'vencido', 'rechazado', 'cancelado',
];

export default function Dashboard() {
  const [resumen, setResumen] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;
    async function cargar() {
      setCargando(true);
      setError('');
      try {
        const data = await api.get('/dashboard/resumen');
        if (activo) setResumen(data);
      } catch (err) {
        if (activo) setError(err.message || 'No se pudo cargar el dashboard.');
      } finally {
        if (activo) setCargando(false);
      }
    }
    cargar();
    return () => { activo = false; };
  }, []);

  if (cargando) return <Spinner label="Cargando dashboard…" />;
  if (error) return <div className="alert alert-error">{error}</div>;

  // El backend usa conteosPorEstatus/contratosPorVencer; se aceptan también los nombres
  // porEstatus/porVencerProximos por si el backend termina alineándose al contrato original.
  const porEstatus = resumen?.porEstatus || resumen?.conteosPorEstatus || {};
  const porVencer = resumen?.porVencerProximos || resumen?.contratosPorVencer || [];
  const pendientesAprobar = resumen?.misPendientesAprobar || [];
  const recientes = resumen?.misSolicitudesRecientes || [];

  const estatusKeys = Array.from(new Set([...ORDEN_ESTATUS, ...Object.keys(porEstatus)]));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="page-header-sub">Resumen general de la gestión contractual de FPT.</p>
        </div>
        <Link to="/contratos/nueva" className="btn btn-primary">+ Nueva solicitud</Link>
      </div>

      <div className="stat-grid">
        {estatusKeys.map((estatus) => (
          <div className="stat-card" key={estatus}>
            <div className="stat-value">{porEstatus[estatus] ?? 0}</div>
            <div className="stat-label">{estatusLabel(estatus)}</div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">
            Pendientes de mi aprobación
            {pendientesAprobar.length > 0 && <span className="tag-pill">{pendientesAprobar.length}</span>}
          </div>
          {pendientesAprobar.length === 0 ? (
            <div className="empty-state">No tienes contratos pendientes de aprobar.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Folio</th>
                    <th>Título</th>
                    <th>Paso pendiente</th>
                    {pendientesAprobar.some((c) => c.contraparteNombre) && <th>Contraparte</th>}
                    {pendientesAprobar.some((c) => c.monto !== undefined) && <th>Monto</th>}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pendientesAprobar.map((c) => {
                    // El resumen del dashboard identifica cada fila por el id de la
                    // aprobación (c.id); el contrato al que hay que navegar es c.contratoId.
                    const contratoId = c.contratoId ?? c.contrato?.id ?? c.id;
                    return (
                      <tr key={c.id ?? contratoId}>
                        <td>{c.folio}</td>
                        <td>{c.titulo}</td>
                        <td className="muted">{c.nombrePaso || '—'}</td>
                        {pendientesAprobar.some((p) => p.contraparteNombre) && <td>{c.contraparteNombre || '—'}</td>}
                        {pendientesAprobar.some((p) => p.monto !== undefined) && <td>{formatMonto(c.monto, c.moneda)}</td>}
                        <td>
                          <Link className="btn btn-primary btn-sm" to={`/contratos/${contratoId}`}>Decidir</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">Por vencer próximamente</div>
          {porVencer.length === 0 ? (
            <div className="empty-state">Sin contratos próximos a vencer.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Folio</th>
                    <th>Vence</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {porVencer.map((c) => {
                    const dias = diasRestantes(c.fechaFin);
                    return (
                      <tr key={c.id}>
                        <td>
                          <div>{c.folio}</div>
                          <div className="muted" style={{ fontSize: 12 }}>{c.titulo}</div>
                        </td>
                        <td>
                          {formatFecha(c.fechaFin)}
                          {dias !== null && (
                            <div className="muted" style={{ fontSize: 12 }}>
                              {dias >= 0 ? `en ${dias} día${dias === 1 ? '' : 's'}` : `venció hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? '' : 's'}`}
                            </div>
                          )}
                        </td>
                        <td>
                          <Link className="btn btn-secondary btn-sm" to={`/contratos/${c.id}`}>Ver</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Mis solicitudes recientes</div>
        {recientes.length === 0 ? (
          <div className="empty-state">Aún no has creado solicitudes de contrato.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Título</th>
                  <th>Tipo</th>
                  <th>Contraparte</th>
                  <th>Monto</th>
                  <th>Vence</th>
                  <th>Estatus</th>
                </tr>
              </thead>
              <tbody>
                {recientes.map((c) => (
                  <tr key={c.id}>
                    <td><Link to={`/contratos/${c.id}`}>{c.folio}</Link></td>
                    <td>{c.titulo}</td>
                    <td>{c.tipoContrato?.nombre || c.tipoContratoNombre || '—'}</td>
                    <td>{c.contraparteNombre}</td>
                    <td>{formatMonto(c.monto, c.moneda)}</td>
                    <td>{formatFecha(c.fechaFin)}</td>
                    <td><EstatusBadge estatus={c.estatus} /></td>
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
