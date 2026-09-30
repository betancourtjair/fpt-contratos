import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, unwrap } from '../../api.js';
import Spinner from '../../components/Spinner.jsx';
import { formatFecha } from '../../utils.js';

const ESTATUS_TASK = [
  { value: 'abierta', label: 'Abierta' },
  { value: 'en_progreso', label: 'En progreso' },
  { value: 'cerrada', label: 'Cerrada' },
];

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [locations, setLocations] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [guardandoId, setGuardandoId] = useState(null);

  const [mostrarModal, setMostrarModal] = useState(false);
  const [form, setForm] = useState({ titulo: '', descripcion: '', locationId: '', asignadoAId: '', fechaLimite: '' });
  const [errorModal, setErrorModal] = useState('');
  const [creando, setCreando] = useState(false);

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      const [dt, dl, du] = await Promise.all([
        api.get('/arrendamientos/tasks'),
        api.get('/arrendamientos/locations'),
        api.get('/usuarios/directorio'),
      ]);
      setTasks(unwrap(dt, 'tasks') || []);
      setLocations(unwrap(dl, 'locations') || []);
      setUsuarios(unwrap(du, 'usuarios') || []);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las tareas.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  function abrirModal() {
    setForm({ titulo: '', descripcion: '', locationId: '', asignadoAId: '', fechaLimite: '' });
    setErrorModal('');
    setMostrarModal(true);
  }

  async function crear(e) {
    e.preventDefault();
    if (!form.titulo.trim()) { setErrorModal('El título es requerido.'); return; }
    setCreando(true);
    try {
      await api.post('/arrendamientos/tasks', form);
      setMostrarModal(false);
      await cargar();
    } catch (err) {
      setErrorModal(err.message || 'No se pudo crear la tarea.');
    } finally {
      setCreando(false);
    }
  }

  async function cambiarEstatus(t, estatus) {
    setGuardandoId(t.id);
    try {
      await api.patch(`/arrendamientos/tasks/${t.id}`, { estatus });
      await cargar();
    } catch (err) {
      window.alert(err.message || 'No se pudo actualizar la tarea.');
    } finally {
      setGuardandoId(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Tareas</h1>
          <p className="page-header-sub">Pendientes relacionados a ubicaciones y leases.</p>
        </div>
        <button className="btn btn-primary" onClick={abrirModal}>+ Nueva tarea</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {cargando ? (
        <Spinner />
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Título</th><th>Ubicación</th><th>Asignado a</th><th>Límite</th><th>Estatus</th></tr></thead>
            <tbody>
              {tasks.length === 0 ? (
                <tr><td colSpan={5} className="table-empty">No hay tareas registradas.</td></tr>
              ) : (
                tasks.map((t) => (
                  <tr key={t.id}>
                    <td>{t.titulo}{t.descripcion && <div className="muted" style={{ fontSize: 12 }}>{t.descripcion}</div>}</td>
                    <td>{t.locationId ? <Link to={`/arrendamientos/ubicaciones/${t.locationId}`}>{t.locationNombre}</Link> : '—'}</td>
                    <td>{t.asignadoANombre || '—'}</td>
                    <td>{formatFecha(t.fechaLimite)}</td>
                    <td>
                      <select value={t.estatus} disabled={guardandoId === t.id} onChange={(e) => cambiarEstatus(t, e.target.value)}>
                        {ESTATUS_TASK.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {mostrarModal && (
        <div className="modal-backdrop" onClick={() => !creando && setMostrarModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Nueva tarea</h3>
            {errorModal && <div className="alert alert-error">{errorModal}</div>}
            <form onSubmit={crear}>
              <div className="field">
                <label>Título *</label>
                <input type="text" value={form.titulo} onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))} autoFocus />
              </div>
              <div className="field">
                <label>Descripción</label>
                <textarea rows={2} value={form.descripcion} onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))} />
              </div>
              <div className="form-row">
                <div className="field">
                  <label>Ubicación</label>
                  <select value={form.locationId} onChange={(e) => setForm((p) => ({ ...p, locationId: e.target.value }))}>
                    <option value="">—</option>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Asignado a</label>
                  <select value={form.asignadoAId} onChange={(e) => setForm((p) => ({ ...p, asignadoAId: e.target.value }))}>
                    <option value="">—</option>
                    {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                  </select>
                </div>
              </div>
              <div className="field">
                <label>Fecha límite</label>
                <input type="date" value={form.fechaLimite} onChange={(e) => setForm((p) => ({ ...p, fechaLimite: e.target.value }))} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setMostrarModal(false)} disabled={creando}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={creando}>{creando ? 'Guardando…' : 'Crear tarea'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
