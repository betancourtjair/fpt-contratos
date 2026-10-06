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
  const { gestionaOperaciones } = useAuth();
  const [solicitud, setSolicitud] = useState(null);
  const [documentos, setDocumentos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [estatus, setEstatus] = useState('');
  const [respuesta, setRespuesta] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

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
      })
      .catch((err) => { if (activo) setError(err.message || 'No se pudo cargar la solicitud.'); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, [id]);

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
        <div className="card-title">{tipo?.archivos?.label || 'Archivos'}{documentos.length > 0 && <span className="tag-pill">{documentos.length}</span>}</div>
        {documentos.length === 0 ? (
          <p className="page-header-sub" style={{ margin: 0 }}>Sin archivos adjuntos.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {documentos.map((d) => (
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
        <div className="card-title">Seguimiento de Jurídico</div>
        {gestionaOperaciones ? (
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
