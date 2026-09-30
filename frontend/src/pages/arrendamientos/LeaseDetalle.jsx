import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, unwrap } from '../../api.js';
import Spinner from '../../components/Spinner.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { formatMonto, formatFecha, formatFechaHora } from '../../utils.js';
import CamposForm from './CamposForm.jsx';
import { GRUPOS_LEASE, CATEGORIAS_RENTA, valoresIniciales } from './campos.js';

const RENGLON_RENTA_VACIO = {
  categoria: 'Base Rent', startDate: '', endDate: '', monto: '', frecuencia: 'Monthly',
  dueDate: '', proration: '', payee: '', pctChange: '', montoPorSqm: '', nota: '',
};

const CLAUSULA_VACIA = {
  clauseType: '', pageNumber: '', sectionNumber: '', leaseDocumentHeader: '', aiSummary: '', originalLanguage: '', leaseIsSilent: false,
};

export default function LeaseDetalle() {
  const { id } = useParams();
  const { esAdmin } = useAuth();

  const [lease, setLease] = useState(null);
  const [rentSchedule, setRentSchedule] = useState([]);
  const [oneTimePayments, setOneTimePayments] = useState([]);
  const [taxSchedule, setTaxSchedule] = useState([]);
  const [criticalClauses, setCriticalClauses] = useState([]);
  const [notes, setNotes] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [mostrarEditar, setMostrarEditar] = useState(false);
  const [form, setForm] = useState(null);
  const [errorEditar, setErrorEditar] = useState('');
  const [guardandoEditar, setGuardandoEditar] = useState(false);

  const [mostrarRenta, setMostrarRenta] = useState(false);
  const [renglonRenta, setRenglonRenta] = useState(RENGLON_RENTA_VACIO);
  const [errorRenta, setErrorRenta] = useState('');
  const [guardandoRenta, setGuardandoRenta] = useState(false);

  const [mostrarClausula, setMostrarClausula] = useState(false);
  const [clausula, setClausula] = useState(CLAUSULA_VACIA);
  const [errorClausula, setErrorClausula] = useState('');
  const [guardandoClausula, setGuardandoClausula] = useState(false);

  const [nota, setNota] = useState({ titulo: '', nota: '' });
  const [guardandoNota, setGuardandoNota] = useState(false);

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      const [d, dc] = await Promise.all([
        api.get(`/arrendamientos/leases/${id}`),
        api.get('/arrendamientos/companies'),
      ]);
      setLease(d.lease);
      setRentSchedule(d.rentSchedule || []);
      setOneTimePayments(d.oneTimePayments || []);
      setTaxSchedule(d.taxSchedule || []);
      setCriticalClauses(d.criticalClauses || []);
      setNotes(d.notes || []);
      setCompanies(unwrap(dc, 'companies') || []);
    } catch (err) {
      setError(err.message || 'No se pudo cargar el lease.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const opciones = useMemo(() => ({
    companies: companies.map((c) => ({ value: c.id, label: c.nombre })),
  }), [companies]);

  const rentaVigenteMensual = rentSchedule
    .filter((r) => {
      const hoy = new Date().toISOString().slice(0, 10);
      return r.startDate <= hoy && (!r.endDate || r.endDate >= hoy);
    })
    .reduce((acc, r) => acc + Number(r.monto || 0), 0);

  function abrirEditar() {
    setForm(valoresIniciales(GRUPOS_LEASE, lease));
    setErrorEditar('');
    setMostrarEditar(true);
  }

  async function guardarEdicion(e) {
    e.preventDefault();
    setErrorEditar('');
    setGuardandoEditar(true);
    try {
      const data = await api.patch(`/arrendamientos/leases/${id}`, form);
      setLease(data.lease);
      setMostrarEditar(false);
    } catch (err) {
      setErrorEditar(err.message || 'No se pudo guardar el lease.');
    } finally {
      setGuardandoEditar(false);
    }
  }

  function abrirRenta() {
    setRenglonRenta(RENGLON_RENTA_VACIO);
    setErrorRenta('');
    setMostrarRenta(true);
  }

  async function crearRenglonRenta(e) {
    e.preventDefault();
    setErrorRenta('');
    if (!renglonRenta.startDate || !renglonRenta.monto) {
      setErrorRenta('Fecha de inicio y monto son requeridos.');
      return;
    }
    setGuardandoRenta(true);
    try {
      const data = await api.post(`/arrendamientos/leases/${id}/rent-schedule`, renglonRenta);
      setRentSchedule((prev) => [...prev, data.item].sort((a, b) => (a.startDate > b.startDate ? 1 : -1)));
      setMostrarRenta(false);
    } catch (err) {
      setErrorRenta(err.message || 'No se pudo agregar el renglón de renta.');
    } finally {
      setGuardandoRenta(false);
    }
  }

  async function borrarRenglonRenta(itemId) {
    if (!window.confirm('¿Eliminar este renglón del calendario de renta?')) return;
    try {
      await api.del(`/arrendamientos/leases/rent-schedule/${itemId}`);
      setRentSchedule((prev) => prev.filter((r) => r.id !== itemId));
    } catch (err) {
      window.alert(err.message || 'No se pudo eliminar el renglón.');
    }
  }

  function abrirClausula() {
    setClausula(CLAUSULA_VACIA);
    setErrorClausula('');
    setMostrarClausula(true);
  }

  async function crearClausula(e) {
    e.preventDefault();
    setErrorClausula('');
    if (!clausula.clauseType) { setErrorClausula('El tipo de cláusula es requerido.'); return; }
    setGuardandoClausula(true);
    try {
      const data = await api.post(`/arrendamientos/leases/${id}/critical-clauses`, clausula);
      setCriticalClauses((prev) => [...prev, data.item]);
      setMostrarClausula(false);
    } catch (err) {
      setErrorClausula(err.message || 'No se pudo agregar la cláusula.');
    } finally {
      setGuardandoClausula(false);
    }
  }

  async function enviarNota(e) {
    e.preventDefault();
    if (!nota.nota.trim()) return;
    setGuardandoNota(true);
    try {
      const data = await api.post(`/arrendamientos/leases/${id}/notes`, nota);
      setNotes((prev) => [data.item, ...prev]);
      setNota({ titulo: '', nota: '' });
    } catch (err) {
      window.alert(err.message || 'No se pudo agregar la nota.');
    } finally {
      setGuardandoNota(false);
    }
  }

  if (cargando) return <Spinner label="Cargando lease…" />;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!lease) return null;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{lease.leaseName || '(Lease sin nombre)'}</h1>
          <p className="page-header-sub">
            <Link to={`/arrendamientos/ubicaciones/${lease.locationId}`}>{lease.locationNombre}</Link>
            {lease.tenantCompanyNombre && <> · {lease.tenantCompanyNombre}</>}
          </p>
        </div>
        {esAdmin && <button className="btn btn-secondary" onClick={abrirEditar}>Editar</button>}
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value"><span className={`badge badge-${lease.estatus}`}>{lease.estatus}</span></div>
          <div className="stat-label">Estatus</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{formatMonto(rentaVigenteMensual)}</div>
          <div className="stat-label">Renta vigente (todas las categorías)</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{formatFecha(lease.expirationDate)}</div>
          <div className="stat-label">Vencimiento</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{formatFecha(lease.renewalNoticeDeadline)}</div>
          <div className="stat-label">Aviso de renovación</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          Calendario de renta
          {esAdmin && (
            <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={abrirRenta}>+ Agregar renglón</button>
          )}
        </div>
        {rentSchedule.length === 0 ? (
          <div className="empty-state">Sin calendario de renta registrado.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Categoría</th><th>Desde</th><th>Hasta</th><th>Monto</th><th>Frecuencia</th><th>% cambio</th>{esAdmin && <th></th>}</tr>
              </thead>
              <tbody>
                {rentSchedule.map((r) => (
                  <tr key={r.id}>
                    <td>{r.categoria}</td>
                    <td>{formatFecha(r.startDate)}</td>
                    <td>{r.endDate ? formatFecha(r.endDate) : '—'}</td>
                    <td>{formatMonto(r.monto)}</td>
                    <td>{r.frecuencia}</td>
                    <td>{r.pctChange != null ? `${r.pctChange}%` : '—'}</td>
                    {esAdmin && <td><button className="icon-btn" onClick={() => borrarRenglonRenta(r.id)}>Eliminar</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(oneTimePayments.length > 0 || taxSchedule.length > 0) && (
        <div className="grid-2">
          {oneTimePayments.length > 0 && (
            <div className="card">
              <div className="card-title">Pagos únicos</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Fecha</th><th>Tipo</th><th>Monto</th><th>Payee</th></tr></thead>
                  <tbody>
                    {oneTimePayments.map((p) => (
                      <tr key={p.id}><td>{formatFecha(p.dueDate)}</td><td>{p.tipo}</td><td>{formatMonto(p.monto)}</td><td>{p.payee || '—'}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {taxSchedule.length > 0 && (
            <div className="card">
              <div className="card-title">Calendario de impuestos</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Desde</th><th>Hasta</th><th>Tasa</th></tr></thead>
                  <tbody>
                    {taxSchedule.map((t) => (
                      <tr key={t.id}><td>{formatFecha(t.startDate)}</td><td>{formatFecha(t.endDate)}</td><td>{t.rate != null ? `${t.rate}%` : '—'}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-title">
          Cláusulas críticas
          {esAdmin && (
            <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={abrirClausula}>+ Agregar cláusula</button>
          )}
        </div>
        {criticalClauses.length === 0 ? (
          <div className="empty-state">Sin cláusulas críticas registradas.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {criticalClauses.map((c) => (
              <div key={c.id} style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong>{c.clauseType}</strong>
                  {c.leaseIsSilent && <span className="tag-pill">El lease no lo menciona</span>}
                  {(c.pageNumber || c.sectionNumber) && (
                    <span className="muted" style={{ fontSize: 12 }}>
                      {c.pageNumber && `pág. ${c.pageNumber}`} {c.sectionNumber && `sec. ${c.sectionNumber}`}
                    </span>
                  )}
                </div>
                {c.aiSummary && <p style={{ margin: '6px 0' }}>{c.aiSummary}</p>}
                {c.originalLanguage && (
                  <p className="muted" style={{ fontSize: 13, fontStyle: 'italic' }}>&ldquo;{c.originalLanguage}&rdquo;</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Notas</div>
        {notes.length === 0 ? (
          <div className="empty-state">Sin notas registradas.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
            {notes.map((n) => (
              <div key={n.id} style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 8 }}>
                {n.titulo && <strong>{n.titulo}</strong>}
                <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
                  {n.autorNombre || '—'} · {formatFechaHora(n.fechaNota || n.createdAt)}
                </span>
                <div>{n.nota}</div>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={enviarNota} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Título (opcional)"
            value={nota.titulo}
            onChange={(e) => setNota((p) => ({ ...p, titulo: e.target.value }))}
            style={{ maxWidth: 220 }}
          />
          <input
            type="text"
            placeholder="Escribe una nota…"
            value={nota.nota}
            onChange={(e) => setNota((p) => ({ ...p, nota: e.target.value }))}
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={guardandoNota}>Agregar</button>
        </form>
      </div>

      {mostrarEditar && form && (
        <div className="modal-backdrop" onClick={() => !guardandoEditar && setMostrarEditar(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
            <h3>Editar lease</h3>
            {errorEditar && <div className="alert alert-error">{errorEditar}</div>}
            <form onSubmit={guardarEdicion}>
              <CamposForm
                grupos={GRUPOS_LEASE}
                valores={form}
                opciones={opciones}
                onChange={(k, v) => setForm((prev) => ({ ...prev, [k]: v }))}
              />
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setMostrarEditar(false)} disabled={guardandoEditar}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={guardandoEditar}>{guardandoEditar ? 'Guardando…' : 'Guardar cambios'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {mostrarRenta && (
        <div className="modal-backdrop" onClick={() => !guardandoRenta && setMostrarRenta(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Agregar renglón de renta</h3>
            {errorRenta && <div className="alert alert-error">{errorRenta}</div>}
            <form onSubmit={crearRenglonRenta}>
              <div className="form-row">
                <div className="field">
                  <label>Categoría</label>
                  <select value={renglonRenta.categoria} onChange={(e) => setRenglonRenta((p) => ({ ...p, categoria: e.target.value }))}>
                    {CATEGORIAS_RENTA.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Frecuencia</label>
                  <input type="text" value={renglonRenta.frecuencia} onChange={(e) => setRenglonRenta((p) => ({ ...p, frecuencia: e.target.value }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="field">
                  <label>Desde *</label>
                  <input type="date" value={renglonRenta.startDate} onChange={(e) => setRenglonRenta((p) => ({ ...p, startDate: e.target.value }))} />
                </div>
                <div className="field">
                  <label>Hasta</label>
                  <input type="date" value={renglonRenta.endDate} onChange={(e) => setRenglonRenta((p) => ({ ...p, endDate: e.target.value }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="field">
                  <label>Monto *</label>
                  <input type="number" step="0.01" value={renglonRenta.monto} onChange={(e) => setRenglonRenta((p) => ({ ...p, monto: e.target.value }))} />
                </div>
                <div className="field">
                  <label>% cambio vs. periodo anterior</label>
                  <input type="number" step="0.01" value={renglonRenta.pctChange} onChange={(e) => setRenglonRenta((p) => ({ ...p, pctChange: e.target.value }))} />
                </div>
              </div>
              <div className="field">
                <label>Payee</label>
                <input type="text" value={renglonRenta.payee} onChange={(e) => setRenglonRenta((p) => ({ ...p, payee: e.target.value }))} />
              </div>
              <div className="field">
                <label>Nota</label>
                <input type="text" value={renglonRenta.nota} onChange={(e) => setRenglonRenta((p) => ({ ...p, nota: e.target.value }))} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setMostrarRenta(false)} disabled={guardandoRenta}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={guardandoRenta}>{guardandoRenta ? 'Guardando…' : 'Agregar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {mostrarClausula && (
        <div className="modal-backdrop" onClick={() => !guardandoClausula && setMostrarClausula(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Agregar cláusula crítica</h3>
            {errorClausula && <div className="alert alert-error">{errorClausula}</div>}
            <form onSubmit={crearClausula}>
              <div className="field">
                <label>Tipo de cláusula *</label>
                <input type="text" value={clausula.clauseType} onChange={(e) => setClausula((p) => ({ ...p, clauseType: e.target.value }))} autoFocus />
              </div>
              <div className="form-row">
                <div className="field">
                  <label>Página</label>
                  <input type="text" value={clausula.pageNumber} onChange={(e) => setClausula((p) => ({ ...p, pageNumber: e.target.value }))} />
                </div>
                <div className="field">
                  <label>Sección</label>
                  <input type="text" value={clausula.sectionNumber} onChange={(e) => setClausula((p) => ({ ...p, sectionNumber: e.target.value }))} />
                </div>
              </div>
              <div className="field">
                <label>Resumen</label>
                <textarea rows={2} value={clausula.aiSummary} onChange={(e) => setClausula((p) => ({ ...p, aiSummary: e.target.value }))} />
              </div>
              <div className="field">
                <label>Texto original de la cláusula</label>
                <textarea rows={3} value={clausula.originalLanguage} onChange={(e) => setClausula((p) => ({ ...p, originalLanguage: e.target.value }))} />
              </div>
              <div className="field checkbox-row">
                <input id="clausula-silente" type="checkbox" checked={clausula.leaseIsSilent} onChange={(e) => setClausula((p) => ({ ...p, leaseIsSilent: e.target.checked }))} />
                <label htmlFor="clausula-silente" style={{ marginBottom: 0 }}>El lease no menciona esta cláusula</label>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setMostrarClausula(false)} disabled={guardandoClausula}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={guardandoClausula}>{guardandoClausula ? 'Guardando…' : 'Agregar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
