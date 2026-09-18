import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, unwrap } from '../../api.js';
import ContratoForm, { contratoFormVacio, validarContrato } from '../../components/ContratoForm.jsx';

// Mismas categorías que en el expediente (DocumentosContrato.jsx) — se duplican aquí porque
// esa lista no se exporta y este formulario no depende de un contrato ya creado.
const CATEGORIAS_DOCUMENTO = [
  { value: 'borrador', label: 'Borrador' },
  { value: 'anexo', label: 'Anexo' },
  { value: 'evidencia', label: 'Evidencia' },
  { value: 'otro', label: 'Otro' },
  ];

function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function NuevaSolicitud() {
    const navigate = useNavigate();
    const [tipos, setTipos] = useState([]);
    const [valores, setValores] = useState(contratoFormVacio());
    const [errores, setErrores] = useState({});
    const [enviando, setEnviando] = useState(false);
    const [errorGeneral, setErrorGeneral] = useState('');

  // Documentos que el usuario quiere adjuntar desde esta misma pantalla. El backend no tiene
  // (todavía) un endpoint para subir archivos antes de que exista el contrato, así que estos
  // se guardan solo en memoria aquí y se suben uno por uno justo después de crear el borrador
  // (POST /contratos), reutilizando el mismo endpoint que ya usa el expediente
  // (POST /contratos/:id/documentos).
  const [archivos, setArchivos] = useState([]);
    const [categoriaArchivos, setCategoriaArchivos] = useState(CATEGORIAS_DOCUMENTO[0].value);
    const [contratoCreadoId, setContratoCreadoId] = useState(null);
    const [fallidos, setFallidos] = useState([]); // [{ archivo, error }]
  const [subiendoAdjuntos, setSubiendoAdjuntos] = useState(false);

  useEffect(() => {
        api.get('/tipos-contrato')
          .then((data) => setTipos(
                    // Los tipos de franquicia se solicitan desde su propio módulo (Franquicias), no aquí.
                        (unwrap(data, 'tiposContrato') || []).filter((t) => t.activo !== false && !t.esFranquicia)
                  ))
          .catch(() => {});
  }, []);

  function agregarArchivos(fileList) {
        const nuevos = Array.from(fileList || []);
                if (nuevos.length === 0) return;
        setArchivos((actuales) => {
                // Evita duplicados obvios (mismo nombre + tamaño) si el usuario abre el selector dos veces.
                          const claves = new Set(actuales.map((f) => `${f.name}__${f.size}`));
                const filtrados = nuevos.filter((f) => !claves.has(`${f.name}__${f.size}`));
                return [...actuales, ...filtrados];
        });
  }

  function quitarArchivo(idx) {
        setArchivos((actuales) => actuales.filter((_, i) => i !== idx));
  }

  // Sube, uno por uno, la lista de archivos dada al contrato ya creado. Devuelve los que
  // fallaron (no revienta el flujo por un solo archivo con problemas).
  async function subirAdjuntos(id, lista) {
        const pendientesFallidos = [];
        for (const archivo of lista) {
                try {
                          const formData = new FormData();
                          formData.append('archivo', archivo);
                          formData.append('categoria', categoriaArchivos);
                          await api.post(`/contratos/${id}/documentos`, formData);
                } catch (err) {
                          pendientesFallidos.push({ archivo, error: err.message || 'No se pudo subir.' });
                }
        }
        return pendientesFallidos;
  }

  async function handleSubmit(e) {
        e.preventDefault();
        setErrorGeneral('');
        const erroresValidacion = validarContrato(valores);
        setErrores(erroresValidacion);
        if (Object.keys(erroresValidacion).length > 0) return;

      setEnviando(true);
        try {
                const payload = {
                          ...valores,
                          monto: valores.monto === '' ? null : Number(valores.monto),
                          diasAvisoVencimiento: valores.diasAvisoVencimiento === '' ? null : Number(valores.diasAvisoVencimiento),
                };
                const contrato = await api.post('/contratos', payload);
                const id = contrato?.id || contrato?.contrato?.id;

          if (id && archivos.length > 0) {
                    setContratoCreadoId(id);
                    setSubiendoAdjuntos(true);
                    const conError = await subirAdjuntos(id, archivos);
                    setSubiendoAdjuntos(false);
                    if (conError.length > 0) {
                                // El borrador ya existe; no perdemos ese avance por un adjunto fallido. Dejamos al
                      // usuario reintentar solo esos archivos o seguir al expediente sin ellos.
                      setFallidos(conError);
                                setArchivos(conError.map((f) => f.archivo));
                                setEnviando(false);
                                return;
                    }
          }

          navigate(id ? `/contratos/${id}` : '/solicitudes');
        } catch (err) {
                setErrorGeneral(err.message || 'No se pudo crear la solicitud.');
                setEnviando(false);
        }
  }

  async function reintentarFallidos() {
        if (!contratoCreadoId) return;
        setSubiendoAdjuntos(true);
        const conError = await subirAdjuntos(contratoCreadoId, archivos);
        setSubiendoAdjuntos(false);
        setFallidos(conError);
        setArchivos(conError.map((f) => f.archivo));
        if (conError.length === 0) {
                navigate(`/contratos/${contratoCreadoId}`);
        }
  }

  // El borrador ya se guardó y solo estamos esperando resolver los adjuntos fallidos: se
  // muestra una pantalla distinta (más simple) en vez del formulario completo, para no dar la
  // impresión de que se puede "editar" un contrato que ya existe desde aquí.
  if (contratoCreadoId) {
        return (
                <div>
                        <div className="page-header">
                                  <div>
                                              <h1>Nueva solicitud de contrato</h1>
                                              <p className="page-header-sub">El borrador ya se guardó. Faltó adjuntar {archivos.length} documento(s).</p>
                                  </div>
                        </div>
                        <div className="card" style={{ maxWidth: 820 }}>
                                  <div className="alert alert-error">
                                              No se pudieron adjuntar los siguientes archivos:
                                              <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                                                {fallidos.map((f, idx) => (
                                  <li key={idx}>{f.archivo.name} — {f.error}</li>
                                ))}
                                              </ul>
                                  </div>
                                  <div className="form-actions">
                                              <button type="button" className="btn btn-primary" onClick={reintentarFallidos} disabled={subiendoAdjuntos}>
                                                {subiendoAdjuntos ? 'Reintentando…' : 'Reintentar adjuntos'}
                                              </button>
                                              <button type="button" className="btn btn-secondary" onClick={() => navigate(`/contratos/${contratoCreadoId}`)}>
                                                            Ir al expediente sin ellos
                                              </button>
                                  </div>
                        </div>
                </div>
              );
  }
  
    return (
          <div>
                <div className="page-header">
                        <div>
                                  <h1>Nueva solicitud de contrato</h1>
                                  <p className="page-header-sub">Se creará como borrador. Podrás enviarlo a autorización desde el expediente.</p>
                        </div>
                </div>
          
                <div className="card" style={{ maxWidth: 820 }}>
                  {errorGeneral && <div className="alert alert-error">{errorGeneral}</div>}
                        <form onSubmit={handleSubmit}>
                                  <ContratoForm valores={valores} onChange={setValores} errores={errores} tipos={tipos} />
                        
                                  <div style={{ marginTop: 8, marginBottom: 18 }}>
                                              <label htmlFor="ns-archivos">Documentos (opcional)</label>
                                              <p className="muted" style={{ marginTop: 0, marginBottom: 8, fontSize: 13 }}>
                                                            Adjunta aquí el borrador del contrato u otros archivos de referencia. También podrás
                                                            agregar o reemplazar documentos después, desde el expediente.
                                              </p>
                                              <div className="form-row" style={{ alignItems: 'end' }}>
                                                            <div className="field" style={{ marginBottom: 0 }}>
                                                                            <input
                                                                                                id="ns-archivos"
                                                                                                type="file"
                                                                                                multiple
                                                                                                onChange={(e) => {
                                                                                                                      agregarArchivos(e.target.files);
                                                                                                                      e.target.value = '';
                                                                                                  }}
                                                                                                disabled={enviando}
                                                                                              />
                                                            </div>
                                                            <div className="field" style={{ marginBottom: 0 }}>
                                                                            <label htmlFor="ns-categoria">Categoría</label>
                                                                            <select
                                                                                                id="ns-categoria"
                                                                                                value={categoriaArchivos}
                                                                                                onChange={(e) => setCategoriaArchivos(e.target.value)}
                                                                                                disabled={enviando}
                                                                                              >
                                                                              {CATEGORIAS_DOCUMENTO.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                                                                            </select>
                                                            </div>
                                              </div>
                                  
                                    {archivos.length > 0 && (
                          <ul style={{ margin: '10px 0 0', paddingLeft: 0, listStyle: 'none' }}>
                            {archivos.map((archivo, idx) => (
                                              <li
                                                                    key={`${archivo.name}-${archivo.size}-${idx}`}
                                                                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}
                                                                  >
                                                                  <span style={{ flex: 1 }}>
                                                                    {archivo.name} <span className="muted" style={{ fontSize: 12 }}>({formatBytes(archivo.size)})</span>
                                                                  </span>
                                                                  <button
                                                                                          type="button"
                                                                                          className="icon-btn"
                                                                                          onClick={() => quitarArchivo(idx)}
                                                                                          disabled={enviando}
                                                                                        >
                                                                                        Quitar
                                                                  </button>
                                              </li>
                                            ))}
                          </ul>
                        )}
                                  </div>
                        
                                  <div className="form-actions">
                                              <button type="submit" className="btn btn-primary" disabled={enviando}>
                                                {enviando
                                                                  ? (subiendoAdjuntos ? 'Adjuntando documentos…' : 'Guardando…')
                                                                  : 'Guardar borrador'}
                                              </button>
                                              <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)} disabled={enviando}>
                                                            Cancelar
                                              </button>
                                  </div>
                        </form>
                </div>
          </div>
        );
}
