import { useEffect, useState } from 'react';
import { api, unwrap } from '../../api.js';
import Spinner from '../../components/Spinner.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';

const VACIO = { nombre: '', email: '', telefono: '', empresa: '', puesto: '', notas: '' };

export default function Contacts() {
  const { esAdmin } = useAuth();
  const [contacts, setContacts] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [mostrarModal, setMostrarModal] = useState(false);
  const [form, setForm] = useState(VACIO);
  const [errorModal, setErrorModal] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      const d = await api.get('/arrendamientos/contacts');
      setContacts(unwrap(d, 'contacts') || []);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los contactos.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  function abrirModal() {
    setForm(VACIO);
    setErrorModal('');
    setMostrarModal(true);
  }

  async function crear(e) {
    e.preventDefault();
    if (!form.nombre.trim()) { setErrorModal('El nombre es requerido.'); return; }
    setGuardando(true);
    try {
      await api.post('/arrendamientos/contacts', form);
      setMostrarModal(false);
      await cargar();
    } catch (err) {
      setErrorModal(err.message || 'No se pudo crear el contacto.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Contactos</h1>
          <p className="page-header-sub">Directorio de contactos externos (landlords, proveedores, etc.)</p>
        </div>
        {esAdmin && <button className="btn btn-primary" onClick={abrirModal}>+ Nuevo contacto</button>}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {cargando ? (
        <Spinner />
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nombre</th><th>Empresa</th><th>Puesto</th><th>Correo</th><th>Teléfono</th></tr></thead>
            <tbody>
              {contacts.length === 0 ? (
                <tr><td colSpan={5} className="table-empty">No hay contactos registrados.</td></tr>
              ) : (
                contacts.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nombre}</td>
                    <td>{c.empresa || '—'}</td>
                    <td>{c.puesto || '—'}</td>
                    <td>{c.email || '—'}</td>
                    <td>{c.telefono || '—'}</td>
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
            <h3>Nuevo contacto</h3>
            {errorModal && <div className="alert alert-error">{errorModal}</div>}
            <form onSubmit={crear}>
              <div className="field">
                <label>Nombre *</label>
                <input type="text" value={form.nombre} onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))} autoFocus />
              </div>
              <div className="form-row">
                <div className="field">
                  <label>Empresa</label>
                  <input type="text" value={form.empresa} onChange={(e) => setForm((p) => ({ ...p, empresa: e.target.value }))} />
                </div>
                <div className="field">
                  <label>Puesto</label>
                  <input type="text" value={form.puesto} onChange={(e) => setForm((p) => ({ ...p, puesto: e.target.value }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="field">
                  <label>Correo</label>
                  <input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
                </div>
                <div className="field">
                  <label>Teléfono</label>
                  <input type="text" value={form.telefono} onChange={(e) => setForm((p) => ({ ...p, telefono: e.target.value }))} />
                </div>
              </div>
              <div className="field">
                <label>Notas</label>
                <textarea rows={2} value={form.notas} onChange={(e) => setForm((p) => ({ ...p, notas: e.target.value }))} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setMostrarModal(false)} disabled={guardando}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Crear contacto'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
