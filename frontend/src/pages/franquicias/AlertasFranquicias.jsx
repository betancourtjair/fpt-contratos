import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, unwrap } from '../../api.js';
import Spinner from '../../components/Spinner.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { formatFecha } from '../../utils.js';

const TIPO_EVENTO_LABEL = {
  pago_regalias: 'Pago de regalías',
  apertura: 'Fecha límite de apertura',
  auditoria: 'Auditoría',
};

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}
function enNDiasISO(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Página dedicada de "alertas próximas y vencimientos" de Franquicias: versión sin límite (20)
// del resumen que ya muestra el dashboard, con rango de fechas elegible -- para cuando hay más
// de 20 avisos/vencimientos próximos y el dashboard se queda corto.
export default function AlertasFranquicias() {
  const { puedeFranquicias } = useAuth();
  const [from, setFrom] = useState(hoyISO());
  const [to, setTo] = useState(enNDiasISO(90));
  const [vencimientos, setVencimientos] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      const data = await api.get('/franquicias/alertas', { from, to });
      setVencimientos(unwrap(data, 'vencimientos') || []);
      setEventos(unwrap(data, 'eventos') || []);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las alertas de franquicias.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [from, to]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Alertas de franquicias</h1>
          <p className="page-header-sub">Vencimientos y avisos de regalías, apertura y auditoría, en el rango de fechas elegido.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/franquicias" className="btn btn-secondary">Volver al dashboard</Link>
          {puedeFranquicias && (
            <Link to="/franquicias/alertas/destinatarios" className="btn btn-primary">Administrar destinatarios</Link>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="filters-bar">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Desde
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Hasta
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      {cargando ? (
        <Spinner />
      ) : (
        <>
          <div className="card">
            <div className="card-title">Vencimientos de contrato{vencimientos.length > 0 && <span className="tag-pill">{vencimientos.length}</span>}</div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Folio</th><th>Club</th><th>Vence</th><th></th></tr></thead>
                <tbody>
                  {vencimientos.length === 0 ? (
                    <tr><td colSpan={4} className="table-empty">Sin vencimientos en este rango.</td></tr>
                  ) : (
                    vencimientos.map((c) => (
                      <tr key={c.id}>
                        <td>{c.folio}</td>
                        <td>{c.clubNombre || '—'}</td>
                        <td>{formatFecha(c.fechaFin)}</td>
                        <td><Link className="btn btn-secondary btn-sm" to={`/contratos/${c.id}`}>Ver</Link></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Avisos (regalías, apertura, auditoría){eventos.length > 0 && <span className="tag-pill">{eventos.length}</span>}</div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Folio</th><th>Club</th><th>Tipo de aviso</th><th>Fecha</th><th></th></tr></thead>
                <tbody>
                  {eventos.length === 0 ? (
                    <tr><td colSpan={5} className="table-empty">Sin avisos en este rango.</td></tr>
                  ) : (
                    eventos.map((ev, idx) => (
                      <tr key={`${ev.contratoId}-${ev.tipo}-${idx}`}>
                        <td>{ev.folio}</td>
                        <td>{ev.clubNombre || '—'}</td>
                        <td>{TIPO_EVENTO_LABEL[ev.tipo] || ev.tipo}</td>
                        <td>{formatFecha(ev.fecha)}</td>
                        <td><Link className="btn btn-secondary btn-sm" to={`/contratos/${ev.contratoId}`}>Ver</Link></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
