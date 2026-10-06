import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, unwrap, API_URL } from '../../api.js';
import Spinner from '../../components/Spinner.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { TIPOS, ESTATUS_LABELS, ETIQUETAS_DATOS, ETIQUETAS_VALIDACIONES } from './operacionesConfig.js';
import { EstatusOperacionesBadge } from './ListaSolicitudesOperaciones.jsx';

function resolverUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const base = API_URL.replace(/\/api\/?$/, '');
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}

function formatearValor(clave, valor) {
  if (clave === 'disponibilidadVideo') return valor === 'si' ? 'Sí' : valor === 'no' ? 'No' : valor;
  if (clave === 'fechaRecepcion') {
    const d = new Date(`${valor}T00:00:00`);
    return Number.isNaN(d.getTime()) ? valor : d.toLocaleDateString('es-MX', { dateStyle: 'long' });
  }
  return valor;
}

export default function DetalleSolicitudOperaciones() {
  const { id } = useParams();
  const location = useLocation();
  const { gestionaOperaciones, usuario } = useAuth();
  const puedeAsignar = ['super_admin', 'cabeza_juridico'].includes(usuario?.rol);
  const [solicitud, setSolicitud] = useState(null);
  const [documentos, setDocumentos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [estatus, setEstatus] = useState('');
  const [respuesta, setRespuesta] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [juridicos, setJuridicos] = useState([]);
  const [asignadoA, setAsignadoA] = useState('');
  const [asignando, setAsignando] = useState(false);
  const [archivosNuevos, setArchivosNuevos] = useState([]);
  const [notificar, setNotificar] = useState(true);
  const [mensaje, setMensaje] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    let activo = true;
    setCargando(true);
    api.get(`/operaciones/solicitudes/${id}`)
      .then((data) => {
        if (!activo) return;
        const s = unwrap(data, 'solicitud');
        setSolicitud(s);
        setDocumentos(unwrap(data, 'documentos') || []);
        setEstatus(s.estatus);
        setRespuesta(s.respuestaJuridico || '');
        setAsignadoA(s.asignadoAId || '');
      })
      .catch((err) => { if (activo) setError(err.message || 'No se pudo cargar la solicitud.'); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, [id]);

  useEffect(() => {
    if (!puedeAsignar) return;
    api.get('/operaciones/juridicos')
      .then((data) => setJuridicos(unwrap(data, 'usuarios') || []))
      .catch(() => {});
  }, [puedeAsignar]);

  async function asignar(e) {
    e.preventDefault();
    setAsignando(true);
    setError('');
    setAviso('');
    try {
      const data = await api.patch(`/operaciones/solicitudes/${id}`, { asignadoAId: asignadoA || null });
      const s = unwrap(data, 'solicitud');
      setSolicitud((prev) => ({ ...prev, ...s }));
      if (s.estatus) setEstatus(s.estatus);
      setAviso(asignadoA ? 'Caso asignado. Se avisó por correo a la persona asignada.' : 'Asignación quitada.');
    } catch (err) {
      setError(err.message || 'No se pudo asignar.');
    } finally {
      setAsignando(false);
    }
  }

  async function subirArchivos(e) {
    e.preventDefault();
    if (archivosNuevos.length === 0) return;
    setSubiendo(true);
    setError('');
    setAviso('');
    try {
      const fd = new FormData();
      archivosNuevos.forEach((f) => fd.append('archivos', f));
      fd.append('notificar', notificar ? 'true' : 'false');
      if (mensaje.trim()) fd.append('mensaje', mensaje.trim());
      const data = await api.post(`/operaciones/solicitudes/${id}/documentos`, fd);
      setDocumentos(unwrap(data, 'documentos') || []);
      setArchivosNuevos([]);
      setMensaje('');
      const input = document.getElementById('archivosJuridico');
      if (input) input.value = '';
      setAviso(
        data.notificado
          ? (data.adjuntadoEnCorreo
              ? 'Archivos subidos. Se envió correo a quien capturó la solicitud, con los documentos adjuntos.'
              : 'Archivos subidos. Se envió correo con la liga (los archivos pesan demasiado para adjuntarse).')
          : 'Archivos subidos.'
      );
    } catch (err) {
      setError(err.message || 'No se pudieron subir los archivos.');
    } finally {
      setSubiendo(false);
    }
  }

  async function guardarSeguimiento(e) {
    e.preventDefault();
    setGuardando(true);
    setError('');
    setGuardado(false);
    try {
      const data = await api.patch(`/operaciones/solicitudes/${id}`, { estatus, respuestaJuridico: respuesta });
      const s = unwrap(data, 'solicitud');
      setSolicitud((prev) => ({ ...prev, ...s }));
      setGuardado(true);
    } catch (err) {
      setError(err.message || 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <Spinner label="Cargando solicitud…" />;
  if (!solicitud) return <div className="alert alert-error">{error || 'Solicitud no encontrada.'}</div>;

  const tipo = TIPOS[solicitud.tipo];
  const datos = solicitud.datos || {};
  const validaciones = solicitud.validaciones || {};
  const puedeTrabajar = gestionaOperaciones && (puedeAsignar || solicitud.asignadoAId === usuario?.id);
  const docsSolicitante = documentos.filter((d) => d.campo !== 'respuesta');
  const docsJuridico = documentos.filter((d) => d.campo === 'respuesta');

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{solicitud.folio} <EstatusOperacionesBadge estatus={solicitud.estatus} /></h1>
          <p className="page-header-sub">{tipo?.label || solicitud.tipo}</p>
        </div>
        <Link to="/operaciones/solicitudes" className="btn btn-secondary">Volver</Link>
      </div>

      {location.state?.recienCreada && (
        <div className="alert alert-success">Solicitud enviada. Jurídico recibió el aviso y le dará seguimiento.</div>
      )}
      {error && <div className="alert alert-error">{error}</div>}
      {aviso && <div className="alert alert-success">{aviso}</div>}

      <div className="card">
        <div className="card-title">Datos de la solicitud</div>
        <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 240px) 1fr', gap: '10px 16px', margin: 0 }}>
          <dt><strong>Club</strong></dt><dd style={{ margin: 0 }}>{solicitud.clubNombre}</dd>
          <dt><strong>Gerente / Subgerente</strong></dt><dd style={{ margin: 0 }}>{solicitud.gerenteNombre}</dd>
          {Object.entries(datos).map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt><strong>{ETIQUETAS_DATOS[k] || k}</strong></dt>
              <dd style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{formatearValor(k, v)}</dd>
            </div>
          ))}
          <dt><strong>Capturada por</strong></dt>
          <dd style={{ margin: 0 }}>{solicitud.solicitanteNombre} · {new Date(solicitud.createdAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</dd>
        </dl>
      </div>

      <div className="card">
        <div className="card-title">{tipo?.archivos?.label || 'Archivos'}{docsSolicitante.length > 0 && <span className="tag-pill">{docsSolicitante.length}</span>}</div>
        {docsSolicitante.length === 0 ? (
          <p className="page-header-sub" style={{ margin: 0 }}>Sin archivos adjuntos.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {docsSolicitante.map((d) => (
              <li key={d.id}>
                <a href={resolverUrl(d.url)} target="_blank" rel="noreferrer">{d.nombreArchivo}</a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {Object.keys(validaciones).length > 0 && (
        <div className="card">
          <div className="card-title">Validaciones</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {Object.entries(validaciones).filter(([, v]) => v).map(([k]) => (
              <li key={k}>☑ {ETIQUETAS_VALIDACIONES[k] || k}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <div className="card-title">Asignación</div>
        {puedeAsignar ? (
          <form onSubmit={asignar} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="field" style={{ margin: 0, minWidth: 260 }}>
              <label htmlFor="asignadoA">Persona de Jurídico que toma el caso</label>
              <select id="asignadoA" value={asignadoA} onChange={(e) => setAsignadoA(e.target.value)}>
                <option value="">Sin asignar</option>
                {juridicos.map((j) => <option key={j.id} value={j.id}>{j.nombre}</option>)}
              </select>
            </div>
            <button type="submit" className="btn btn-primary" disabled={asignando || asignadoA === (solicitud.asignadoAId || '')}>
              {asignando ? 'Asignando…' : 'Asignar'}
            </button>
          </form>
        ) : (
          <p style={{ margin: 0 }}>{solicitud.asignadoANombre ? <>Asignada a <strong>{solicitud.asignadoANombre}</strong>.</> : 'Todavía no se asigna a una persona de Jurídico.'}</p>
        )}
      </div>

      <div className="card">
        <div className="card-title">Documentos de Jurídico{docsJuridico.length > 0 && <span className="tag-pill">{docsJuridico.length}</span>}</div>
        {docsJuridico.length === 0 ? (
          <p className="page-header-sub" style={{ margin: 0 }}>Jurídico todavía no adjunta documentos.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {docsJuridico.map((d) => (
              <li key={d.id}>
                <a href={resolverUrl(d.url)} target="_blank" rel="noreferrer">{d.nombreArchivo}</a>
                {d.subidoPorNombre && <span className="page-header-sub"> · {d.subidoPorNombre}</span>}
              </li>
            ))}
          </ul>
        )}
        {puedeTrabajar && (
          <form onSubmit={subirArchivos} style={{ marginTop: 16 }}>
            <div className="field">
              <label htmlFor="archivosJuridico">Adjuntar documentos</label>
              <input id="archivosJuridico" type="file" multiple onChange={(e) => setArchivosNuevos(Array.from(e.target.files || []))} />
            </div>
            <div className="field">
              <label htmlFor="mensajeJuridico">Mensaje para quien capturó la solicitud (opcional)</label>
              <textarea id="mensajeJuridico" rows={2} value={mensaje} onChange={(e) => setMensaje(e.target.value)} />
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <input type="checkbox" checked={notificar} onChange={(e) => setNotificar(e.target.checked)} />
              Enviar correo a {solicitud.solicitanteNombre} con los documentos adjuntos
            </label>
            <button type="submit" className="btn btn-primary" disabled={subiendo || archivosNuevos.length === 0}>
              {subiendo ? 'Subiendo…' : 'Subir documentos'}
            </button>
          </form>
        )}
      </div>

      <div className="card">
        <div className="card-title">Seguimiento de Jurídico</div>
        {puedeTrabajar ? (
          <form onSubmit={guardarSeguimiento}>
            <div className="field">
              <label htmlFor="estatus">Estatus</label>
              <select id="estatus" value={estatus} onChange={(e) => setEstatus(e.target.value)}>
                {Object.entries(ESTATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="respuesta">Respuesta / notas para Operaciones</label>
              <textarea id="respuesta" rows={4} value={respuesta} onChange={(e) => setRespuesta(e.target.value)} />
            </div>
            <div className="form-actions" style={{ marginTop: 0, paddingTop: 12 }}>
              <button type="submit" className="btn btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar seguimiento'}</button>
              {guardado && <span style={{ alignSelf: 'center' }}>Guardado.</span>}
            </div>
          </form>
        ) : (
          <>
            {gestionaOperaciones && <p className="page-header-sub">Solo Cabeza de Jurídico o la persona asignada pueden dar seguimiento. Pide que te asignen el caso.</p>}
            <p style={{ margin: 0 }}><strong>Estatus:</strong> {ESTATUS_LABELS[solicitud.estatus]}</p>
            <p style={{ whiteSpace: 'pre-wrap' }}>{solicitud.respuestaJuridico || 'Todavía no hay respuesta de Jurídico.'}</p>
          </>
        )}
        {solicitud.atendidoPorNombre && (
          <p className="page-header-sub" style={{ marginBottom: 0 }}>Atendida por {solicitud.atendidoPorNombre}.</p>
        )}
      </div>
    </div>
  );
}
