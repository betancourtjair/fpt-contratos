import { useState } from 'react';
import { api, API_URL } from '../api.js';
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

export default function DocumentosContrato({ contratoId, documentos = [], onSubido }) {
  const [archivo, setArchivo] = useState(null);
  const [categoria, setCategoria] = useState(CATEGORIAS[0].value);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');

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
      await api.post(`/contratos/${contratoId}/documentos`, formData);
      setArchivo(null);
      e.target.reset?.();
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
                <th>Versión</th>
                <th>Subido por</th>
                <th>Fecha</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {documentos.map((doc, idx) => {
                const url = resolverUrl(doc.url);
                return (
                  <tr key={doc.id ?? idx}>
                    <td>{doc.nombreArchivo}</td>
                    <td><span className="tag-pill">{categoriaLabel(doc.categoria)}</span></td>
                    <td>v{doc.version ?? 1}</td>
                    <td>{doc.subidoPor?.nombre || doc.subidoPorNombre || (typeof doc.subidoPor === 'string' ? doc.subidoPor : null) || '—'}</td>
                    <td>{formatFechaHora(doc.createdAt)}</td>
                    <td>
                      {url && (
                        <a href={url} target="_blank" rel="noreferrer">Ver</a>
                      )}
                    </td>
                  </tr>
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
