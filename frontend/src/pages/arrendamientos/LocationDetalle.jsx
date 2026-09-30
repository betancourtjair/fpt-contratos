import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, unwrap, API_URL } from '../../api.js';
import Spinner from '../../components/Spinner.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { formatFecha, formatFechaHora } from '../../utils.js';
import CamposForm from './CamposForm.jsx';
import { GRUPOS_LOCATION, ESTATUS_LEASE, valoresIniciales } from './campos.js';

function resolverUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const base = API_URL.replace(/\/api\/?$/, '');
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}

export default function LocationDetalle() {
  const { id } = useParams();
  const { usuario, esAdmin } = useAuth();

  const [location, setLocation] = useState(null);
  const [leases, setLeases] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [comentarios, setComentarios] = useState([]);
  const [brands, setBrands] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [mostrarEditar, setMostrarEditar] = useState(false);
  const [form, setForm] = useState(null);
  const [errorEditar, setErrorEditar] = useState('');
  const [guardandoEditar, setGuardandoEditar] = useState(false);

  const [mostrarNuevoLease, setMostrarNuevoLease] = useState(false);
  const [nuevoLease, setNuevoLease] = useState({ leaseName: '', estatus: 'activo', expirationDate: '' });
  const [errorLease, setErrorLease] = useState('');
  const [guardandoLease, setGuardandoLease] = useState(false);

  const [archivo, setArchivo] = useState(null);
  const [categoriaArchivo, setCategoriaArchivo] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [errorArchivo, setErrorArchivo] = useState('');

  const [comentario, setComentario] = useState('');
  const [enviandoComentario, setEnviandoComentario] = useState(false);

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      const [d, dDocs, dComs, db, dc] = await Promise.all([
        api.get(`/arrendamientos/locations/${id}`),
        api.get(`/arrendamientos/locations/${id}/documentos`),
        api.get(`/arrendamientos/locations/${id}/comentarios`),
        api.get('/arrendamientos/brands'),
        api.get('/arrendamientos/companies'),
      ]);
      setLocation(d.location);
      setLeases(d.leases || []);
      setDocumentos(unwrap(dDocs, 'documentos') || []);
      setComentarios(unwrap(dComs, 'comentarios') || []);
      setBrands(unwrap(db, 'brands') || []);
      setCompanies(unwrap(dc, 'companies') || []);
    } catch (err) {
      setError(err.message || 'No se pudo cargar la ubicación.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const opciones = useMemo(() => ({
    brands: brands.map((b) => ({ value: b.id, label: b.nombre })),
    companies: companies.map((c) => ({ value: c.id, label: c.nombre })),
  }), [brands, companies]);

  function abrirEditar() {
    setForm(valoresIniciales(GRUPOS_LOCATION, location));
    setErrorEditar('');
    setMostrarEditar(true);
  }

  async function guardarEdicion(e) {
    e.preventDefault();
    setErrorEditar('');
    setGuardandoEditar(true);
    try {
      const data = await api.patch(`/arrendamientos/locations/${id}`, form);
      setLocation(data.location);
      setMostrarEditar(false);
    } catch (err) {
      setErrorEditar(err.message || 'No se pudo guardar la ubicación.');
    } finally {
      setGuardandoEditar(false);
    }
  }

  async function crearLease(e) {
    e.preventDefault();
    setErrorLease('');
    if (!nuevoLease.expirationDate && nuevoLease.estatus !== 'mes_a_mes') {
      // No es obligatorio, pero se avisa: la mayoría de los leases sí tienen vencimiento.
    }
    setGuardandoLease(true);
    try {
      await api.post('/arrendamientos/leases', { locationId: id, ...nuevoLease });
      setMostrarNuevoLease(false);
      setNuevoLease({ leaseName: '', estatus: 'activo', expirationDate: '' });
      await cargar();
    } catch (err) {
      setErrorLease(err.message || 'No se pudo crear el lease.');
    } finally {
      setGuardandoLease(false);
    }
  }

  async function subirArchivo(e) {
    e.preventDefault();
    setErrorArchivo('');
    if (!archivo) { setErrorArchivo('Selecciona un archivo.'); return; }
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.append('archivo', archivo);
      if (categoriaArchivo) fd.append('categoria', categoriaArchivo);
      await api.post(`/arrendamientos/locations/${id}/documentos`, fd);
      setArchivo(null);
      setCategoriaArchivo('');
      const dDocs = await api.get(`/arrendamientos/locations/${id}/documentos`);
      setDocumentos(unwrap(dDocs, 'documentos') || []);
    } catch (err) {
      setErrorArchivo(err.message || 'No se pudo subir el archivo.');
    } finally {
      setSubiendo(false);
    }
  }

  async function borrarArchivo(docId) {
    if (!window.confirm('¿Eliminar este documento?')) return;
    try {
      await api.del(`/arrendamientos/documentos/${docId}`);
      setDocumentos((prev) => prev.filter((d) => d.id !== docId));
    } catch (err) {
      window.alert(err.message || 'No se pudo eliminar el documento.');
    }
  }

  async function enviarComentario(e) {
    e.preventDefault();
    if (!comentario.trim()) return;
    setEnviandoComentario(true);
    try {
      const data = await api.post(`/arrendamientos/locations/${id}/comentarios`, { comentario });
      setComentarios((prev) => [...prev, data.comentario]);
      setComentario('');
    } catch (err) {
      window.alert(err.message || 'No se pudo enviar el comentario.');
    } finally {
      setEnviandoComentario(false);
    }
  }

  if (cargando) return <Spinner label="Cargando ubicación…" />;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!location) return null;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{location.nombre}</h1>
          <p className="page-header-sub">
            {location.brandNombre && <>{location.brandNombre} · </>}
            {[location.city, location.state].filter(Boolean).join(', ') || 'Sin dirección registrada'}
          </p>
        </div>
        {esAdmin && <button className="btn btn-secondary" onClick={abrirEditar}>Editar</button>}
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">{location.squareMeters ?? '—'}</div>
          <div className="stat-label">m² totales</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{location.locationType || '—'}</div>
          <div className="stat-label">Tipo</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{location.companyNombre || '—'}</div>
          <div className="stat-label">Company (tenant)</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{leases.filter((l) => l.estatus === 'activo').length}</div>
          <div className="stat-label">Leases activos</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          Leases
          {esAdmin && (
            <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setMostrarNuevoLease(true)}>
              + Nuevo lease
            </button>
          )}
        </div>
        {leases.length === 0 ? (
          <div className="empty-state">Esta ubicación no tiene leases registrados.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Nombre</th><th>Estatus</th><th>Vence</th><th></th></tr>
              </thead>
              <tbody>
                {leases.map((l) => (
                  <tr key={l.id}>
                    <td>{l.leaseName || '(sin nombre)'}</td>
                    <td><span className={`badge badge-${l.estatus}`}>{l.estatus}</span></td>
                    <td>{formatFecha(l.expirationDate)}</td>
                    <td><Link className="btn btn-secondary btn-sm" to={`/arrendamientos/leases/${l.id}`}>Ver</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Archivos</div>
        {errorArchivo && <div className="alert alert-error">{errorArchivo}</div>}
        <form onSubmit={subirArchivo} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <input type="file" onChange={(e) => setArchivo(e.target.files?.[0] || null)} />
          <input
            type="text"
            placeholder="Categoría (opcional)"
            value={categoriaArchivo}
            onChange={(e) => setCategoriaArchivo(e.target.value)}
            style={{ maxWidth: 220 }}
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={subiendo}>{subiendo ? 'Subiendo…' : 'Subir archivo'}</button>
        </form>
        {documentos.length === 0 ? (
          <div className="empty-state">Sin archivos subidos.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Archivo</th><th>Categoría</th><th>Subido por</th><th>Fecha</th><th></th></tr></thead>
              <tbody>
                {documentos.map((d) => (
                  <tr key={d.id}>
                    <td><a href={resolverUrl(d.url)} target="_blank" rel="noreferrer">{d.nombreArchivo}</a></td>
                    <td>{d.categoria ? <span className="tag-pill">{d.categoria}</span> : '—'}</td>
                    <td>{d.subidoPorNombre || '—'}</td>
                    <td>{formatFechaHora(d.createdAt)}</td>
                    <td>
                      {(esAdmin || d.subidoPorId === usuario?.id) && (
                        <button className="icon-btn" onClick={() => borrarArchivo(d.id)}>Eliminar</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Comentarios</div>
        {comentarios.length === 0 ? (
          <div className="empty-state">Sin comentarios todavía.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
            {comentarios.map((c) => (
              <div key={c.id} style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 8 }}>
                <strong>{c.usuarioNombre}</strong>
                <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>{formatFechaHora(c.createdAt)}</span>
                <div>{c.comentario}</div>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={enviarComentario} style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder="Escribe un comentario…"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={enviandoComentario}>Enviar</button>
        </form>
      </div>

      {mostrarEditar && form && (
        <div className="modal-backdrop" onClick={() => !guardandoEditar && setMostrarEditar(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Editar ubicación</h3>
            {errorEditar && <div className="alert alert-error">{errorEditar}</div>}
            <form onSubmit={guardarEdicion}>
              <CamposForm
                grupos={GRUPOS_LOCATION}
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

      {mostrarNuevoLease && (
        <div className="modal-backdrop" onClick={() => !guardandoLease && setMostrarNuevoLease(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Nuevo lease</h3>
            <p className="muted" style={{ marginTop: -6 }}>Después de crearlo, entra a su detalle para llenar el resto de los campos (fechas, renovación, landlord, renta, etc.)</p>
            {errorLease && <div className="alert alert-error">{errorLease}</div>}
            <form onSubmit={crearLease}>
              <div className="field">
                <label htmlFor="nuevo-lease-nombre">Nombre del lease</label>
                <input id="nuevo-lease-nombre" type="text" value={nuevoLease.leaseName} onChange={(e) => setNuevoLease((p) => ({ ...p, leaseName: e.target.value }))} autoFocus />
              </div>
              <div className="field">
                <label htmlFor="nuevo-lease-estatus">Estatus</label>
                <select id="nuevo-lease-estatus" value={nuevoLease.estatus} onChange={(e) => setNuevoLease((p) => ({ ...p, estatus: e.target.value }))}>
                  {ESTATUS_LEASE.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="nuevo-lease-vencimiento">Vencimiento</label>
                <input id="nuevo-lease-vencimiento" type="date" value={nuevoLease.expirationDate} onChange={(e) => setNuevoLease((p) => ({ ...p, expirationDate: e.target.value }))} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setMostrarNuevoLease(false)} disabled={guardandoLease}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={guardandoLease}>{guardandoLease ? 'Creando…' : 'Crear lease'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
