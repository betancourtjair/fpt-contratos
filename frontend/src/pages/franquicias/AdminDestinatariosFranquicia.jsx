import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, unwrap } from '../../api.js';
import Spinner from '../../components/Spinner.jsx';

const TIPO_EVENTO_OPCIONES = [
  { value: 'todos', label: 'Todos los avisos' },
  { value: 'pago_regalias', label: 'Pago de regalías' },
  { value: 'apertura', label: 'Fecha límite de apertura' },
  { value: 'auditoria', label: 'Auditoría' },
  { value: 'vencimiento', label: 'Vencimiento de contrato' },
];

function tipoEventoLabel(valor) {
  return TIPO_EVENTO_OPCIONES.find((o) => o.value === valor)?.label || valor;
}

const FORM_VACIO = { tipoEvento: 'todos', email: '', nombre: '' };

// Panel de administración: quién recibe cada tipo de aviso automático de Franquicias, además
// de los correos fijos por rol (jurídico/admin/super_admin) que ya se mandan siempre. Antes no
// existía ninguna forma de configurar esto desde la app -- había que tocar código.
export default function AdminDestinatariosFranquicia() {
  const [destinatarios, setDestinatarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      const data = await api.get('/franquicias/alertas/destinatarios');
      setDestinatarios(unwrap(data, 'destinatarios') || []);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los destinatarios.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  async function agregar(e) {
    e.preventDefault();
    const email = form.email.trim();
    if (!email) { setErrorForm('El correo es requerido.'); return; }
    setErrorForm('');
    setGuardando(true);
    try {
      await api.post('/franquicias/alertas/destinatarios', { ...form, email });
      setForm(FORM_VACIO);
      await cargar();
    } catch (err) {
      setErrorForm(err.message || 'No se pudo agregar el destinatario.');
    } finally {
      setGuardando(false);
    }
  }

  async function alternarActivo(dest) {
    try {
      await api.put(`/franquicias/alertas/destinatarios/${dest.id}`, {
        tipoEvento: dest.tipoEvento,
        email: dest.email,
        nombre: dest.nombre,
        activo: !dest.activo,
      });
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo actualizar el destinatario.');
    }
  }

  async function eliminar(dest) {
    if (!window.confirm(`¿Quitar a ${dest.email} de los avisos de "${tipoEventoLabel(dest.tipoEvento)}"?`)) return;
    try {
      await api.del(`/franquicias/alertas/destinatarios/${dest.id}`);
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo eliminar el destinatario.');
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Destinatarios de alertas de franquicias</h1>
          <p className="page-header-sub">
            Quién recibe cada tipo de aviso automático (pago de regalías, apertura, auditoría, vencimiento), además de jurídico/administración.
          </p>
        </div>
        <Link to="/franquicias/alertas" className="btn btn-secondary">Volver a alertas</Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="card-title">Agregar destinatario</div>
        <form className="filters-bar" onSubmit={agregar}>
          <select
            value={form.tipoEvento}
            onChange={(e) => setForm((p) => ({ ...p, tipoEvento: e.target.value }))}
          >
            {TIPO_EVENTO_OPCIONES.map((op) => (
              <option key={op.value} value={op.value}>{op.label}</option>
            ))}
          </select>
          <input
            type="email"
            placeholder="correo@ejemplo.com"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            required
          />
          <input
            type="text"
            placeholder="Nombre (opcional)"
            value={form.nombre}
            onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
          />
          <button type="submit" className="btn btn-primary" disabled={guardando}>
            {guardando ? 'Agregando…' : '+ Agregar'}
          </button>
        </form>
        {errorForm && <div className="alert alert-error">{errorForm}</div>}
      </div>

      <div className="card">
        <div className="card-title">Destinatarios configurados{destinatarios.length > 0 && <span className="tag-pill">{destinatarios.length}</span>}</div>
        {cargando ? (
          <Spinner />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tipo de aviso</th>
                  <th>Correo</th>
                  <th>Nombre</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {destinatarios.length === 0 ? (
                  <tr><td colSpan={5} className="table-empty">Sin destinatarios configurados todavía.</td></tr>
                ) : (
                  destinatarios.map((d) => (
                    <tr key={d.id}>
                      <td>{tipoEventoLabel(d.tipoEvento)}</td>
                      <td>{d.email}</td>
                      <td>{d.nombre || '—'}</td>
                      <td>
                        <button type="button" className={`badge badge-${d.activo ? 'activo' : 'cancelado'}`} style={{ border: 'none', cursor: 'pointer' }} onClick={() => alternarActivo(d)}>
                          {d.activo ? 'Activo' : 'Inactivo'}
                        </button>
                      </td>
                      <td>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => eliminar(d)}>Eliminar</button>
                      </td>
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
