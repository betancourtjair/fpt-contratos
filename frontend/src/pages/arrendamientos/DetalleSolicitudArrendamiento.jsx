import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, unwrap } from '../../api.js';
import Spinner from '../../components/Spinner.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { ESTATUS_LABELS, EstatusBadge, esVisible, fmtFecha, resolverUrl } from './solicitudesConfig.jsx';

const ROLES_GESTION = ['super_admin', 'cabeza_juridico', 'juridico'];
const ROLES_VEN_TODO = ['super_admin', 'admin', 'ceo', 'cfo', 'cabeza_juridico', 'juridico'];

function valorLegible(c, v) {
  if (v === undefined || v === null || v === '') return '—';
  const op = (x) => c.opciones?.find((o) => o.value === x)?.label || x;
  if (Array.isArray(v)) return v.map(op).join(', ');
  if (c.tipo === 'select' || c.tipo === 'radio') return op(v);
  if (c.tipo === 'date') {
    const d = new Date(`${v}T00:00:00`);
    return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('es-MX', { dateStyle: 'long' });
  }
  return v;
}

export default function DetalleSolicitudArrendamiento() {
  const { id } = useParams();
  const location = useLocation();
  const { usuario } = useAuth();
  const gestiona = ROLES_GESTION.includes(usuario?.rol);
  const venTodo = ROLES_VEN_TODO.includes(usuario?.rol);
  const puedeAsignar = ['super_admin', 'cabeza_juridico'].includes(usuario?.rol);

  const [secciones, setSecciones] = useState([]);
  const [solicitud, setSolicitud] = useState(null);
  const [documentos, setDocumentos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [estatus, setEstatus] = useState('');
  const [respuesta, setRespuesta] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [juridicos, setJuridicos] = useState([]);
  const [asignadoA, setAsignadoA] = useState('');
  const [asignando, setAsignando] = useState(false);
  const [archivosNuevos, setArchivosNuevos] = useState([]);
  const [subiendo, setSubiendo] = useState(false);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    Promise.all([api.get('/arrendamientos/solicitudes/formulario'), api.get(`/arrendamientos/solicitudes/${id}`)])
      .then(([f, data]) => {
        if (!activo) return;
        setSecciones(f.secciones || []);
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
    api.get('/arrendamientos/solicitudes/juridicos').then((d) => setJuridicos(unwrap(d, 'usuarios') || [])).catch(() => {});
  }, [puedeAsignar]);

  async function asignar(e) {
    e.preventDefault();
    setAsignando(true); setError(''); setAviso('');
    try {
      const data = await api.patch(`/arrendamientos/solicitudes/${id}`, { asignadoAId: asignadoA || null });
      const s = unwrap(data, 'solicitud');
      setSolicitud((p) => ({ ...p, ...s }));
      if (s.estatus) setEstatus(s.estatus);
      setAviso(asignadoA ? 'Caso asignado. Se avisó por correo a la persona asignada.' : 'Asignación quitada.');
    } catch (err) { setError(err.message || 'No se pudo asignar.'); } finally { setAsignando(false); }
  }

  async function guardarSeguimiento(e) {
    e.preventDefault();
    setGuardando(true); setError(''); setAviso('');
    try {
      const data = await api.patch(`/arrendamientos/solicitudes/${id}`, { estatus, respuestaJuridico: respuesta });
      setSolicitud((p) => ({ ...p, ...unwrap(data, 'solicitud') }));
      setAviso('Seguimiento guardado.');
    } catch (err) { setError(err.message || 'No se pudo guardar.'); } finally { setGuardando(false); }
  }

  async function subirArchivos(e) {
    e.preventDefault();
    if (!archivosNuevos.length) return;
    setSubiendo(true); setError(''); setAviso('');
    try {
      const fd = new FormData();
      archivosNuevos.forEach((f) => fd.append('archivos', f));
      const data = await api.post(`/arrendamientos/solicitudes/${id}/documentos`, fd);
      setDocumentos(unwrap(data, 'documentos') || []);
      setArchivosNuevos([]);
      const input = document.getElementById('archivosJuridicoArr');
      if (input) input.value = '';
      setAviso('Archivos subidos.');
    } catch (err) { setError(err.message || 'No se pudieron subir los archivos.'); } finally { setSubiendo(false); }
  }

  if (cargando) return <Spinner label="Cargando solicitud…" />;
  if (!solicitud) return <div className="alert alert-error">{error || 'Solicitud no encontrada.'}</div>;

  const datos = solicitud.datos || {};
  const puedeTrabajar = gestiona && (puedeAsignar || solicitud.asignadoAId === usuario?.id);
  const docsRespuesta = documentos.filter((d) => d.campo === 'respuesta');
  const docsPor = (campo) => documentos.filter((d) => d.campo === campo);
  const tramite = secciones[0]?.campos?.[0]?.opciones?.find((o) => o.value === solicitud.tipoTramite)?.label || solicitud.tipoTramite;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{solicitud.folio} <EstatusBadge estatus={solicitud.estatus} /></h1>
          <p className="page-header-sub">{tramite} · {solicitud.arrendadorNombre}</p>
        </div>
        <Link to="/arrendamientos/solicitudes" className="btn btn-secondary">Volver</Link>
      </div>

      {location.state?.recienCreada && <div className="alert alert-success">Solicitud enviada. Jurídico recibió el aviso y le dará seguimiento.</div>}
      {error && <div className="alert alert-error">{error}</div>}
      {aviso && <div className="alert alert-success">{aviso}</div>}

      {secciones.map((s) => {
        const campos = s.campos.filter((c) => esVisible(c, datos));
        const docs = (s.documentos || []).filter((d) => esVisible(d, datos));
        return (
          <div className="card" key={s.id}>
            <div className="card-title">{s.titulo}</div>
            <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 300px) 1fr', gap: '10px 16px', margin: 0 }}>
              {campos.map((c) => (
                <div key={c.id} style={{ display: 'contents' }}>
                  <dt><strong>{c.label}</strong></dt>
                  <dd style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{valorLegible(c, datos[c.id])}</dd>
                </div>
              ))}
              {docs.map((d) => (
                <div key={d.id} style={{ display: 'contents' }}>
                  <dt><strong>{d.label}</strong></dt>
                  <dd style={{ margin: 0 }}>
                    {docsPor(d.id).length === 0 ? '—' : docsPor(d.id).map((x) => (
                      <div key={x.id}><a href={resolverUrl(x.url)} target="_blank" rel="noreferrer">{x.nombreArchivo}</a></div>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })}

      <div className="card">
        <div className="card-title">Solicitante</div>
        <p style={{ margin: 0 }}>{solicitud.solicitanteNombre} · {fmtFecha(solicitud.createdAt)}</p>
      </div>

      {gestiona && (
        <div className="card">
          <div className="card-title">Asignación</div>
          {puedeAsignar ? (
            <form onSubmit={asignar} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="field" style={{ margin: 0, minWidth: 260 }}>
                <label htmlFor="asignadoAArr">Persona de Jurídico que toma el caso</label>
                <select id="asignadoAArr" value={asignadoA} onChange={(e) => setAsignadoA(e.target.value)}>
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
      )}

      <div className="card">
        <div className="card-title">Documentos de Jurídico{docsRespuesta.length > 0 && <span className="tag-pill">{docsRespuesta.length}</span>}</div>
        {docsRespuesta.length === 0 ? (
          <p className="page-header-sub" style={{ margin: 0 }}>Jurídico todavía no adjunta documentos.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {docsRespuesta.map((d) => (
              <li key={d.id}>
                <a href={resolverUrl(d.url)} target="_blank" rel="noreferrer">{d.nombreArchivo}</a>
                {venTodo && d.subidoPorNombre && <span className="page-header-sub"> · {d.subidoPorNombre}</span>}
              </li>
            ))}
          </ul>
        )}
        {puedeTrabajar && (
          <form onSubmit={subirArchivos} style={{ marginTop: 16 }}>
            <div className="field">
              <label htmlFor="archivosJuridicoArr">Adjuntar documentos</label>
              <input id="archivosJuridicoArr" type="file" multiple onChange={(e) => setArchivosNuevos(Array.from(e.target.files || []))} />
            </div>
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
              <label htmlFor="estatusArr">Estatus</label>
              <select id="estatusArr" value={estatus} onChange={(e) => setEstatus(e.target.value)}>
                {Object.entries(ESTATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="respuestaArr">Respuesta / notas para quien solicita</label>
              <textarea id="respuestaArr" rows={4} value={respuesta} onChange={(e) => setRespuesta(e.target.value)} />
            </div>
            <div className="form-actions" style={{ marginTop: 0, paddingTop: 12 }}>
              <button type="submit" className="btn btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar seguimiento'}</button>
            </div>
          </form>
        ) : (
          <>
            {gestiona && <p className="page-header-sub">Solo Cabeza de Jurídico o la persona asignada pueden dar seguimiento. Pide que te asignen el caso.</p>}
            <p style={{ margin: 0 }}><strong>Estatus:</strong> {ESTATUS_LABELS[solicitud.estatus]}</p>
            <p style={{ whiteSpace: 'pre-wrap' }}>{solicitud.respuestaJuridico || 'Todavía no hay respuesta de Jurídico.'}</p>
          </>
        )}
        {venTodo && solicitud.atendidoPorNombre && <p className="page-header-sub" style={{ marginBottom: 0 }}>Atendida por {solicitud.atendidoPorNombre}.</p>}
      </div>
    </div>
  );
}
