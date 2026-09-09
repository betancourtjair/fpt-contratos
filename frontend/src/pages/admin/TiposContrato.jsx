import { useEffect, useState } from 'react';
import { api, unwrap } from '../../api.js';
import Spinner from '../../components/Spinner.jsx';
import { formatFechaHora } from '../../utils.js';

const VACIO = { id: null, nombre: '', descripcion: '', activo: true, esFranquicia: false };

export default function TiposContrato() {
  const [tipos, setTipos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [formAbierto, setFormAbierto] = useState(false);
  const [valores, setValores] = useState(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');

  const [llaves, setLlaves] = useState([]);
  const [mostrarLlaves, setMostrarLlaves] = useState(false);
  const [archivoPlantilla, setArchivoPlantilla] = useState(null);
  const [subiendoPlantilla, setSubiendoPlantilla] = useState(false);
  const [errorPlantilla, setErrorPlantilla] = useState('');

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
  useEffect(() => {
    api.get('/tipos-contrato/llaves-plantilla')
      .then((data) => setLlaves(unwrap(data, 'llaves') || []))
      .catch(() => {});
  }, []);

  function abrirNuevo() {
    setValores(VACIO);
    setErrorForm('');
    setErrorPlantilla('');
    setArchivoPlantilla(null);
    setFormAbierto(true);
  }

  function abrirEdicion(tipo) {
    setValores({
      id: tipo.id,
      nombre: tipo.nombre,
      descripcion: tipo.descripcion || '',
      activo: tipo.activo !== false,
      esFranquicia: !!tipo.esFranquicia,
    });
    setErrorForm('');
    setErrorPlantilla('');
    setArchivoPlantilla(null);
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
          esFranquicia: valores.esFranquicia,
        });
        await cargar();
      } else {
        await api.post('/tipos-contrato', {
          nombre: valores.nombre,
          descripcion: valores.descripcion,
          activo: valores.activo,
          esFranquicia: valores.esFranquicia,
        });
        setFormAbierto(false);
        await cargar();
      }
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

  async function subirPlantilla() {
    if (!archivoPlantilla) {
      setErrorPlantilla('Selecciona un archivo Word (.docx) primero.');
      return;
    }
    setSubiendoPlantilla(true);
    setErrorPlantilla('');
    try {
      const formData = new FormData();
      formData.append('archivo', archivoPlantilla);
      await api.post(`/tipos-contrato/${valores.id}/plantilla`, formData);
      setArchivoPlantilla(null);
      await cargar();
    } catch (err) {
      setErrorPlantilla(err.message || 'No se pudo subir la plantilla.');
    } finally {
      setSubiendoPlantilla(false);
    }
  }

  async function quitarPlantilla() {
    setSubiendoPlantilla(true);
    setErrorPlantilla('');
    try {
      await api.del(`/tipos-contrato/${valores.id}/plantilla`);
      await cargar();
    } catch (err) {
      setErrorPlantilla(err.message || 'No se pudo quitar la plantilla.');
    } finally {
      setSubiendoPlantilla(false);
    }
  }

  const tipoActual = valores.id ? tipos.find((t) => t.id === valores.id) : null;
  const llavesVisibles = llaves.filter((l) => !l.franquicia || valores.esFranquicia);
  const llavesPorCategoria = llavesVisibles.reduce((acc, l) => {
    (acc[l.categoria] = acc[l.categoria] || []).push(l);
    return acc;
  }, {});

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
        <div className="card" style={{ maxWidth: 640 }}>
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
            <div className="field checkbox-row">
              <input
                id="esFranquicia"
                type="checkbox"
                checked={valores.esFranquicia}
                onChange={(e) => setValores({ ...valores, esFranquicia: e.target.checked })}
              />
              <label htmlFor="esFranquicia" style={{ marginBottom: 0 }}>
                Es contrato de franquicia (activa sus campos y notificaciones especiales)
              </label>
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

          {valores.id && (
            <>
              <hr className="divider" />
              <h4 className="form-subheading" style={{ marginTop: 0 }}>Plantilla del documento</h4>
              <p className="muted" style={{ fontSize: 13, marginTop: -4 }}>
                Un archivo Word (.docx) con marcadores <code>{'{{llave}}'}</code> que se llenan solos con los
                datos del contrato al generar el documento desde su expediente.
              </p>
              {errorPlantilla && <div className="alert alert-error">{errorPlantilla}</div>}
              {tipoActual?.plantillaNombreArchivo ? (
                <div className="field checkbox-row" style={{ marginBottom: 12 }}>
                  <span className="tag-pill">Cargada</span>
                  <span>
                    {tipoActual.plantillaNombreArchivo}
                    {tipoActual.plantillaActualizadaEn && (
                      <span className="muted"> · actualizada {formatFechaHora(tipoActual.plantillaActualizadaEn)}</span>
                    )}
                  </span>
                </div>
              ) : (
                <div className="empty-state" style={{ marginBottom: 12 }}>Este tipo aún no tiene plantilla.</div>
              )}
              <div className="form-row" style={{ alignItems: 'end', marginBottom: 12 }}>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label htmlFor="plantilla-archivo">Archivo (.docx)</label>
                  <input
                    id="plantilla-archivo"
                    type="file"
                    accept=".docx"
                    onChange={(e) => setArchivoPlantilla(e.target.files?.[0] || null)}
                  />
                </div>
                <div className="field" style={{ marginBottom: 0, display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn-primary" onClick={subirPlantilla} disabled={subiendoPlantilla}>
                    {subiendoPlantilla ? 'Subiendo…' : tipoActual?.plantillaNombreArchivo ? 'Reemplazar' : 'Subir plantilla'}
                  </button>
                  {tipoActual?.plantillaNombreArchivo && (
                    <button type="button" className="btn btn-secondary" onClick={quitarPlantilla} disabled={subiendoPlantilla}>
                      Quitar
                    </button>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setMostrarLlaves((v) => !v)}
                style={{ marginBottom: 8 }}
              >
                {mostrarLlaves ? 'Ocultar llaves disponibles' : 'Ver llaves disponibles'}
              </button>
              {mostrarLlaves && (
                <div style={{ background: 'var(--color-bg-soft, #f5f4f8)', borderRadius: 8, padding: 12 }}>
                  {Object.entries(llavesPorCategoria).map(([categoria, items]) => (
                    <div key={categoria} style={{ marginBottom: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {categoria}
                      </div>
                      {items.map((l) => (
                        <div key={l.llave} style={{ fontSize: 13, display: 'flex', gap: 8 }}>
                          <code>{`{{${l.llave}}}`}</code>
                          <span className="muted">{l.etiqueta}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                  {!valores.esFranquicia && (
                    <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
                      Marca "Es contrato de franquicia" arriba para ver también sus llaves.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
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
                <th>Franquicia</th>
                <th>Plantilla</th>
                <th>Estatus</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tipos.length === 0 ? (
                <tr><td colSpan={6} className="table-empty">No hay tipos de contrato registrados.</td></tr>
              ) : (
                tipos.map((t) => (
                  <tr key={t.id}>
                    <td>{t.nombre}</td>
                    <td className="muted">{t.descripcion || '—'}</td>
                    <td>{t.esFranquicia ? <span className="tag-pill">Franquicia</span> : <span className="muted">—</span>}</td>
                    <td>{t.plantillaNombreArchivo ? <span className="tag-pill">Cargada</span> : <span className="muted">—</span>}</td>
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
