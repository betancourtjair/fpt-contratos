import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, unwrap } from '../../api.js';
import Spinner from '../../components/Spinner.jsx';
import EstatusBadge, { estatusLabel } from '../../components/EstatusBadge.jsx';
import { formatMonto, formatFecha } from '../../utils.js';

const ORDEN_ESTATUS = [
  'borrador', 'en_revision', 'en_autorizacion', 'autorizado',
  'activo', 'por_vencer', 'vencido', 'rechazado', 'cancelado',
];

const ESTATUS_OPCIONES = [
  'borrador', 'en_revision', 'en_autorizacion', 'rechazado',
  'autorizado', 'activo', 'por_vencer', 'vencido', 'cancelado',
];

const TIPO_EVENTO_LABEL = {
  pago_regalias: 'Pago de regalías',
  apertura: 'Fecha límite de apertura',
  auditoria: 'Auditoría',
};

export default function DashboardFranquicias() {
  const [resumen, setResumen] = useState(null);
  const [cargandoResumen, setCargandoResumen] = useState(true);
  const [errorResumen, setErrorResumen] = useState('');

  const [clubesOpciones, setClubesOpciones] = useState([]);
  const [contratos, setContratos] = useState([]);
  const [cargandoLista, setCargandoLista] = useState(true);
  const [errorLista, setErrorLista] = useState('');

  const [estatus, setEstatus] = useState('');
  const [clubId, setClubId] = useState('');
  const [q, setQ] = useState('');
  const [qInput, setQInput] = useState('');

  useEffect(() => {
    let activo = true;
    async function cargarResumen() {
      setCargandoResumen(true);
      setErrorResumen('');
      try {
        const data = await api.get('/franquicias/dashboard');
        if (activo) setResumen(data);
      } catch (err) {
        if (activo) setErrorResumen(err.message || 'No se pudo cargar el dashboard de franquicias.');
      } finally {
        if (activo) setCargandoResumen(false);
      }
    }
    cargarResumen();
    return () => { activo = false; };
  }, []);

  useEffect(() => {
    api.get('/clubes', { activo: 'true' })
      .then((data) => setClubesOpciones(unwrap(data, 'clubes') || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let activo = true;
    async function cargarLista() {
      setCargandoLista(true);
      setErrorLista('');
      try {
        const data = await api.get('/franquicias', { estatus, clubId, texto: q });
        if (activo) setContratos(unwrap(data, 'contratos') || []);
      } catch (err) {
        if (activo) setErrorLista(err.message || 'No se pudieron cargar los contratos de franquicia.');
      } finally {
        if (activo) setCargandoLista(false);
      }
    }
    cargarLista();
    return () => { activo = false; };
  }, [estatus, clubId, q]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setQ(qInput.trim());
  }

  const porEstatus = resumen?.conteosPorEstatus || {};
  const porVencer = resumen?.contratosPorVencer || [];
  const eventosProximos = resumen?.eventosProximos || [];
  const clubesSinContrato = resumen?.clubesSinContrato || [];
  const estatusKeys = Array.from(new Set([...ORDEN_ESTATUS, ...Object.keys(porEstatus)]));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Franquicias</h1>
          <p className="page-header-sub">
            Contratos de franquicia por club{resumen ? ` · ${resumen.totalClubesActivos} club${resumen.totalClubesActivos === 1 ? '' : 'es'} activo${resumen.totalClubesActivos === 1 ? '' : 's'}` : ''}.
          </p>
        </div>
        <Link to="/franquicias/nueva" className="btn btn-primary">+ Nueva solicitud de franquicia</Link>
      </div>

      {errorResumen && <div className="alert alert-error">{errorResumen}</div>}

      {cargandoResumen ? (
        <Spinner label="Cargando resumen…" />
      ) : (
        <>
          <div className="stat-grid">
            {estatusKeys.map((estatusKey) => (
              <div className="stat-card" key={estatusKey}>
                <div className="stat-value">{porEstatus[estatusKey] ?? 0}</div>
                <div className="stat-label">{estatusLabel(estatusKey)}</div>
              </div>
            ))}
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="card-title">
                Clubes sin contrato de franquicia
                {clubesSinContrato.length > 0 && <span className="tag-pill">{clubesSinContrato.length}</span>}
              </div>
              {clubesSinContrato.length === 0 ? (
                <div className="empty-state">Todos los clubes activos tienen un contrato de franquicia.</div>
              ) : (
                <ul className="simple-list">
                  {clubesSinContrato.map((cl) => (
                    <li key={cl.id}>
                      {cl.nombre}
                      <Link className="btn btn-secondary btn-sm" to="/franquicias/nueva" style={{ marginLeft: 8 }}>
                        Solicitar
                      </Link>
                    </li>
                  ))}
                </ul>
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
                        <th>Club</th>
                        <th>Vence</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {porVencer.map((c) => (
                        <tr key={c.id}>
                          <td>{c.folio}</td>
                          <td>{c.clubNombre || '—'}</td>
                          <td>{formatFecha(c.fechaFin)}</td>
                          <td><Link className="btn btn-secondary btn-sm" to={`/contratos/${c.id}`}>Ver</Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-title">Avisos próximos (regalías, apertura, auditoría)</div>
            {eventosProximos.length === 0 ? (
              <div className="empty-state">Sin avisos próximos.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Folio</th>
                      <th>Club</th>
                      <th>Tipo de aviso</th>
                      <th>Fecha</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventosProximos.map((ev, idx) => (
                      <tr key={`${ev.contratoId}-${ev.tipo}-${idx}`}>
                        <td>{ev.folio}</td>
                        <td>{ev.clubNombre || '—'}</td>
                        <td>{TIPO_EVENTO_LABEL[ev.tipo] || ev.tipo}</td>
                        <td>{formatFecha(ev.fecha)}</td>
                        <td><Link className="btn btn-secondary btn-sm" to={`/contratos/${ev.contratoId}`}>Ver</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <div className="card">
        <div className="card-title">Todos los contratos de franquicia</div>

        <form className="filters-bar" onSubmit={handleSearchSubmit}>
          <input
            className="search-input"
            type="search"
            placeholder="Buscar por folio, título, club o contraparte…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
          />
          <select value={estatus} onChange={(e) => setEstatus(e.target.value)}>
            <option value="">Todos los estatus</option>
            {ESTATUS_OPCIONES.map((op) => (
              <option key={op} value={op}>{estatusLabel(op)}</option>
            ))}
          </select>
          <select value={clubId} onChange={(e) => setClubId(e.target.value)}>
            <option value="">Todos los clubes</option>
            {clubesOpciones.map((cl) => (
              <option key={cl.id} value={cl.id}>{cl.nombre}</option>
            ))}
          </select>
          <button type="submit" className="btn btn-secondary">Buscar</button>
          {(estatus || clubId || q) && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => { setEstatus(''); setClubId(''); setQ(''); setQInput(''); }}
            >
              Limpiar filtros
            </button>
          )}
        </form>

        {errorLista && <div className="alert alert-error">{errorLista}</div>}

        {cargandoLista ? (
          <Spinner label="Cargando contratos…" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Club</th>
                  <th>Contraparte</th>
                  <th>Monto</th>
                  <th>Vencimiento</th>
                  <th>Estatus</th>
                </tr>
              </thead>
              <tbody>
                {contratos.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="table-empty">No se encontraron contratos de franquicia con estos filtros.</td>
                  </tr>
                ) : (
                  contratos.map((c) => (
                    <tr key={c.id}>
                      <td><Link to={`/contratos/${c.id}`}>{c.folio}</Link></td>
                      <td>{c.clubNombre || '—'}</td>
                      <td>{c.contraparteNombre}</td>
                      <td>{formatMonto(c.monto, c.moneda)}</td>
                      <td>{formatFecha(c.fechaFin)}</td>
                      <td><EstatusBadge estatus={c.estatus} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
