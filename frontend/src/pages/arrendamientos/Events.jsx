import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, unwrap } from '../../api.js';
import Spinner from '../../components/Spinner.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { formatFecha } from '../../utils.js';

const ORIGEN_LABELS = {
  auto_rent_due: 'Pago de renta',
  auto_rent_commencement: 'Inicio de pago de renta',
  auto_renewal_deadline: 'Fecha límite de aviso de renovación',
  auto_expiration: 'Vencimiento de lease',
  auto_coi_expiration: 'Vencimiento de COI',
  manual: 'Evento manual',
};

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}
function enNDiasISO(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function Events() {
  const { esAdmin } = useAuth();
  const [from, setFrom] = useState(hoyISO());
  const [to, setTo] = useState(enNDiasISO(90));
  const [locations, setLocations] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [mostrarModal, setMostrarModal] = useState(false);
  const [form, setForm] = useState({ nombre: '', fecha: '', locationId: '' });
  const [errorModal, setErrorModal] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      const [de, dl] = await Promise.all([
        api.get('/arrendamientos/events', { from, to }),
        locations.length ? Promise.resolve(null) : api.get('/arrendamientos/locations'),
      ]);
      setEventos(unwrap(de, 'events') || []);
      if (dl) setLocations(unwrap(dl, 'locations') || []);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los eventos.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [from, to]);

  function abrirModal() {
    setForm({ nombre: '', fecha: '', locationId: '' });
    setErrorModal('');
    setMostrarModal(true);
  }

  async function crear(e) {
    e.preventDefault();
    if (!form.nombre.trim() || !form.fecha) { setErrorModal('Nombre y fecha son requeridos.'); return; }
    setGuardando(true);
    try {
      await api.post('/arrendamientos/events', form);
      setMostrarModal(false);
      await cargar();
    } catch (err) {
      setErrorModal(err.message || 'No se pudo crear el evento.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Eventos</h1>
          <p className="page-header-sub">Fechas clave calculadas de cada lease (pago de renta, vencimientos, COI) más eventos manuales.</p>
        </div>
        {esAdmin && <button className="btn btn-primary" onClick={abrirModal}>+ Evento manual</button>}
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
        <div className="table-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Evento</th><th>Ubicación</th><th>Tipo</th></tr></thead>
            <tbody>
              {eventos.length === 0 ? (
                <tr><td colSpan={4} className="table-empty">Sin eventos en este rango.</td></tr>
              ) : (
                eventos.map((ev, i) => (
                  <tr key={i}>
                    <td>{formatFecha(ev.fecha)}</td>
                    <td>{ev.nombre}</td>
                    <td>{ev.locationId ? <Link to={`/arrendamientos/ubicaciones/${ev.locationId}`}>{ev.entidadNombre}</Link> : (ev.entidadNombre || '—')}</td>
                    <td><span className="tag-pill">{ORIGEN_LABELS[ev.origen] || ev.origen}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {mostrarModal && (
        <div className="modal-backdrop" onClick={() => !guardando && setMostrarModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Nuevo evento manual</h3>
            {errorModal && <div className="alert alert-error">{errorModal}</div>}
            <form onSubmit={crear}>
              <div className="field">
                <label>Nombre *</label>
                <input type="text" value={form.nombre} onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))} autoFocus />
              </div>
              <div className="field">
                <label>Fecha *</label>
                <input type="date" value={form.fecha} onChange={(e) => setForm((p) => ({ ...p, fecha: e.target.value }))} />
              </div>
              <div className="field">
                <label>Ubicación (opcional)</label>
                <select value={form.locationId} onChange={(e) => setForm((p) => ({ ...p, locationId: e.target.value }))}>
                  <option value="">—</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setMostrarModal(false)} disabled={guardando}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Crear evento'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
