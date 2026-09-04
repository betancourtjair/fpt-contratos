import { useEffect, useState } from 'react';
import { api, unwrap } from '../../api.js';
import Spinner from '../../components/Spinner.jsx';

const VACIO = { id: null, nombre: '', descripcion: '', activo: true };

export default function TiposContrato() {
  const [tipos, setTipos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [formAbierto, setFormAbierto] = useState(false);
  const [valores, setValores] = useState(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      // activo=false le pide al backend que incluya también los tipos inactivos
      // (por defecto solo regresa los activos, pensado para poblar el formulario de solicitud).
      const data = await api.get('/tipos-contrato', { activo: 'false' });
      setTipos(unwrap(data, 'tiposContrato') || []);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los tipos de contrato.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  function abrirNuevo() {
    setValores(VACIO);
    setErrorForm('');
    setFormAbierto(true);
  }

  function abrirEdicion(tipo) {
    setValores({ id: tipo.id, nombre: tipo.nombre, descripcion: tipo.descripcion || '', activo: tipo.activo !== false });
    setErrorForm('');
    setFormAbierto(true);
  }

  async function guardar(e) {
    e.preventDefault();
    if (!valores.nombre.trim()) {
      setErrorForm('El nombre es obligatorio.');
      return;
    }
    setGuardando(true);
    setErrorForm('');
    try {
      if (valores.id) {
        await api.patch(`/tipos-contrato/${valores.id}`, {
          nombre: valores.nombre,
          descripcion: valores.descripcion,
          activo: valores.activo,
        });
      } else {
        await api.post('/tipos-contrato', {
          nombre: valores.nombre,
          descripcion: valores.descripcion,
          activo: valores.activo,
        });
      }
      setFormAbierto(false);
      await cargar();
    } catch (err) {
      setErrorForm(err.message || 'No se pudo guardar el tipo de contrato.');
    } finally {
      setGuardando(false);
    }
  }

  async function toggleActivo(tipo) {
    try {
      await api.patch(`/tipos-contrato/${tipo.id}`, { activo: !(tipo.activo !== false) });
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo actualizar el tipo de contrato.');
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Tipos de contrato</h1>
          <p className="page-header-sub">Catálogo de tipos de contrato disponibles al crear una solicitud.</p>
        </div>
        <button className="btn btn-primary" onClick={abrirNuevo}>+ Nuevo tipo</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {formAbierto && (
        <div className="card" style={{ maxWidth: 560 }}>
          <div className="card-title">{valores.id ? 'Editar tipo de contrato' : 'Nuevo tipo de contrato'}</div>
          {errorForm && <div className="alert alert-error">{errorForm}</div>}
          <form onSubmit={guardar}>
            <div className="field">
              <label htmlFor="nombre">Nombre *</label>
              <input
                id="nombre"
                type="text"
                value={valores.nombre}
                onChange={(e) => setValores({ ...valores, nombre: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="descripcion">Descripción</label>
              <textarea
                id="descripcion"
                value={valores.descripcion}
                onChange={(e) => setValores({ ...valores, descripcion: e.target.value })}
              />
            </div>
            <div className="field checkbox-row">
              <input
                id="activo"
                type="checkbox"
                checked={valores.activo}
                onChange={(e) => setValores({ ...valores, activo: e.target.checked })}
              />
              <label htmlFor="activo" style={{ marginBottom: 0 }}>Activo</label>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={guardando}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setFormAbierto(false)} disabled={guardando}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {cargando ? (
        <Spinner />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Descripción</th>
                <th>Estatus</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tipos.length === 0 ? (
                <tr><td colSpan={4} className="table-empty">No hay tipos de contrato registrados.</td></tr>
              ) : (
                tipos.map((t) => (
                  <tr key={t.id}>
                    <td>{t.nombre}</td>
                    <td className="muted">{t.descripcion || '—'}</td>
                    <td>
                      <span className={`badge ${t.activo !== false ? 'badge-activo' : 'badge-cancelado'}`}>
                        {t.activo !== false ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td style={{ display: 'flex', gap: 8 }}>
                      <button className="icon-btn" onClick={() => abrirEdicion(t)}>Editar</button>
                      <button className="icon-btn" onClick={() => toggleActivo(t)}>
                        {t.activo !== false ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
