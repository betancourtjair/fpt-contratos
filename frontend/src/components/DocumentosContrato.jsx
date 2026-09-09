import { Fragment, useState } from 'react';
import { api, API_URL, unwrap } from '../api.js';
import { formatFechaHora } from '../utils.js';

const CATEGORIAS = [
  { value: 'borrador', label: 'Borrador' },
  { value: 'version_firmada', label: 'Versión firmada' },
  { value: 'anexo', label: 'Anexo' },
  { value: 'evidencia', label: 'Evidencia' },
  { value: 'otro', label: 'Otro' },
];

function categoriaLabel(valor) {
  return CATEGORIAS.find((c) => c.value === valor)?.label || valor || 'Sin categoría';
}

function resolverUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const base = API_URL.replace(/\/api\/?$/, '');
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}

function FilaVersion({ doc }) {
  const url = resolverUrl(doc.url);
  return (
    <tr className="fila-version-historial">
      <td style={{ paddingLeft: 28 }}>v{doc.version} — {doc.nombreArchivo}</td>
      <td><span className="tag-pill">{categoriaLabel(doc.categoria)}</span></td>
      <td>{doc.subidoPorNombre || '—'}</td>
      <td>{formatFechaHora(doc.createdAt)}</td>
      <td>{url && <a href={url} target="_blank" rel="noreferrer">Ver</a>}</td>
    </tr>
  );
}

export default function DocumentosContrato({ contratoId, documentos = [], onSubido }) {
  const [archivo, setArchivo] = useState(null);
  const [categoria, setCategoria] = useState(CATEGORIAS[0].value);
  const [grupoDestino, setGrupoDestino] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');

  const [historiales, setHistoriales] = useState({}); // grupoId -> versiones[]
  const [expandidos, setExpandidos] = useState({}); // grupoId -> bool
  const [cargandoHistorial, setCargandoHistorial] = useState({}); // grupoId -> bool

  async function toggleHistorial(grupoId) {
    if (expandidos[grupoId]) {
      setExpandidos((e) => ({ ...e, [grupoId]: false }));
      return;
    }
    if (!historiales[grupoId]) {
      setCargandoHistorial((c) => ({ ...c, [grupoId]: true }));
      try {
        const data = await api.get(`/contratos/${contratoId}/documentos/grupo/${grupoId}`);
        setHistoriales((h) => ({ ...h, [grupoId]: unwrap(data, 'versiones') || [] }));
      } catch (err) {
        setError(err.message || 'No se pudo cargar el historial de versiones.');
      } finally {
        setCargandoHistorial((c) => ({ ...c, [grupoId]: false }));
      }
    }
    setExpandidos((e) => ({ ...e, [grupoId]: true }));
  }

  async function handleSubir(e) {
    e.preventDefault();
    setError('');
    if (!archivo) {
      setError('Selecciona un archivo primero.');
      return;
    }
    setSubiendo(true);
    try {
      const formData = new FormData();
      formData.append('archivo', archivo);
      formData.append('categoria', categoria);
      if (grupoDestino) formData.append('grupoId', grupoDestino);
      await api.post(`/contratos/${contratoId}/documentos`, formData);
      setArchivo(null);
      setGrupoDestino('');
      e.target.reset?.();
      // Si se subió como nueva versión de un documento existente, su historial en caché
      // queda obsoleto: lo limpiamos para que se recargue la próxima vez que se expanda.
      if (grupoDestino) {
        setHistoriales((h) => {
          const copia = { ...h };
          delete copia[grupoDestino];
          return copia;
        });
        setExpandidos((ex) => ({ ...ex, [grupoDestino]: false }));
      }
      onSubido?.();
    } catch (err) {
      setError(err.message || 'No se pudo subir el documento.');
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div>
      {documentos.length === 0 ? (
        <div className="empty-state">Aún no se han subido documentos a este expediente.</div>
      ) : (
        <div className="table-wrap" style={{ marginBottom: 18 }}>
          <table>
            <thead>
              <tr>
                <th>Archivo</th>
                <th>Categoría</th>
                <th>Subido por</th>
                <th>Fecha</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {documentos.map((doc, idx) => {
                const url = resolverUrl(doc.url);
                const tieneHistorial = (doc.totalVersiones ?? 1) > 1;
                return (
                  <Fragment key={doc.id ?? idx}>
                    <tr>
                      <td>
                        {doc.nombreArchivo}
                        {doc.origen === 'plantilla' && <span className="tag-pill" style={{ marginLeft: 6 }}>Generado</span>}
                      </td>
                      <td><span className="tag-pill">{categoriaLabel(doc.categoria)}</span></td>
                      <td>{doc.subidoPorNombre || '—'}</td>
                      <td>{formatFechaHora(doc.createdAt)}</td>
                      <td style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        {url && <a href={url} target="_blank" rel="noreferrer">Ver</a>}
                        {tieneHistorial && (
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => toggleHistorial(doc.grupoId)}
                          >
                            {cargandoHistorial[doc.grupoId]
                              ? 'Cargando…'
                              : expandidos[doc.grupoId]
                                ? 'Ocultar versiones'
                                : `v${doc.version} · ver ${doc.totalVersiones} versiones`}
                          </button>
                        )}
                        {!tieneHistorial && <span className="muted" style={{ fontSize: 12 }}>v{doc.version}</span>}
                      </td>
                    </tr>
                    {tieneHistorial && expandidos[doc.grupoId] &&
                      (historiales[doc.grupoId] || []).map((v) => <FilaVersion key={v.id} doc={v} />)}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <form onSubmit={handleSubir} className="form-row" style={{ alignItems: 'end' }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="doc-archivo">Archivo</label>
          <input
            id="doc-archivo"
            type="file"
            onChange={(e) => setArchivo(e.target.files?.[0] || null)}
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="doc-categoria">Categoría</label>
          <select id="doc-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {CATEGORIAS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        {documentos.length > 0 && (
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="doc-grupo">Carga como</label>
            <select id="doc-grupo" value={grupoDestino} onChange={(e) => setGrupoDestino(e.target.value)}>
              <option value="">Documento nuevo</option>
              {documentos.map((d) => (
                <option key={d.grupoId} value={d.grupoId}>
                  Nueva versión de: {d.nombreArchivo} ({categoriaLabel(d.categoria)})
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field" style={{ marginBottom: 0 }}>
          <button type="submit" className="btn btn-primary" disabled={subiendo}>
            {subiendo ? 'Subiendo…' : 'Subir documento'}
          </button>
        </div>
      </form>
      {error && <div className="error-text" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}
