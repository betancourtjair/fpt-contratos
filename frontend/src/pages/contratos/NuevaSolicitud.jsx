import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, unwrap } from '../../api.js';
import ContratoForm, {
  contratoFormVacio,
  validarContrato,
  contraparteDetallePayload,
  ndaPayload,
  serviciosPayload,
  documentosRequeridos,
} from '../../components/ContratoForm.jsx';

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

  // Checklist con nombre para NDA / prestación de servicios (ver documentosRequeridos en
  // ContratoForm.jsx): un archivo por "etiqueta", independiente de los documentos genéricos
  // de arriba. Aparece y desaparece según el tipo elegido y, en servicios, según el lugar de
  // prestación (servicios especializados pide REPSE y registro patronal).
  const [archivosChecklist, setArchivosChecklist] = useState({}); // { [etiqueta]: File }
  const [erroresChecklist, setErroresChecklist] = useState({}); // { [etiqueta]: mensaje }

    const [contratoCreadoId, setContratoCreadoId] = useState(null);
    const [fallidos, setFallidos] = useState([]); // [{ archivo, categoria, etiqueta, label, error }]
    const [erroresDetalle, setErroresDetalle] = useState([]); // [mensaje] — PUT de contraparte-detalle/nda/servicios
  const [subiendoAdjuntos, setSubiendoAdjuntos] = useState(false);

  useEffect(() => {
        api.get('/tipos-contrato')
          .then((data) => setTipos(
                    // Los tipos de franquicia se solicitan desde su propio módulo (Franquicias), no aquí.
                        (unwrap(data, 'tiposContrato') || []).filter((t) => t.activo !== false && !t.esFranquicia)
                  ))
          .catch(() => {});
  }, []);

  const tipoSeleccionado = tipos.find((t) => t.id === valores.tipoContratoId);
  const esNda = !!tipoSeleccionado?.esNda;
  const esServicios = !!tipoSeleccionado?.esServicios;
  const documentosReq = documentosRequeridos(valores, tipoSeleccionado);

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

  function elegirArchivoChecklist(etiqueta, file) {
    setArchivosChecklist((actuales) => ({ ...actuales, [etiqueta]: file }));
    setErroresChecklist((actuales) => {
      if (!actuales[etiqueta]) return actuales;
      const copia = { ...actuales };
      delete copia[etiqueta];
      return copia;
    });
  }

  function quitarArchivoChecklist(etiqueta) {
    setArchivosChecklist((actuales) => {
      const copia = { ...actuales };
      delete copia[etiqueta];
      return copia;
    });
  }

  // Sube, uno por uno, la lista de items dada al contrato ya creado (genéricos y del checklist
  // con nombre por igual — cada item ya trae su propia categoría y, si aplica, su etiqueta).
  // Devuelve los que fallaron (no revienta el flujo por un solo archivo con problemas).
  async function subirAdjuntos(id, lista) {
        const pendientesFallidos = [];
        for (const item of lista) {
                try {
                          const formData = new FormData();
                          formData.append('archivo', item.archivo);
                          formData.append('categoria', item.categoria);
                          if (item.etiqueta) formData.append('etiqueta', item.etiqueta);
                          await api.post(`/contratos/${id}/documentos`, formData);
                } catch (err) {
                          pendientesFallidos.push({ ...item, error: err.message || 'No se pudo subir.' });
                }
        }
        return pendientesFallidos;
  }

  // Guarda, para NDA / prestación de servicios, el detalle ampliado de la contraparte y los
  // campos propios de la solicitud (PUT /contratos/:id/contraparte-detalle, /nda, /servicios).
  // Los tres endpoints son upsert (ON CONFLICT DO UPDATE), así que reintentar es seguro.
  async function guardarDetalles(id, tipo) {
    const errores = [];
    const tipoEsNda = !!tipo?.esNda;
    const tipoEsServicios = !!tipo?.esServicios;
    if (tipoEsNda || tipoEsServicios) {
      try {
        await api.put(`/contratos/${id}/contraparte-detalle`, contraparteDetallePayload(valores));
      } catch (err) {
        errores.push(err.message || 'No se pudo guardar el detalle de la contraparte.');
      }
    }
    if (tipoEsNda) {
      try {
        await api.put(`/contratos/${id}/nda`, ndaPayload(valores));
      } catch (err) {
        errores.push(err.message || 'No se pudo guardar la solicitud de NDA.');
      }
    }
    if (tipoEsServicios) {
      try {
        await api.put(`/contratos/${id}/servicios`, serviciosPayload(valores));
      } catch (err) {
        errores.push(err.message || 'No se pudo guardar la solicitud de prestación de servicios.');
      }
    }
    return errores;
  }

  async function handleSubmit(e) {
        e.preventDefault();
        setErrorGeneral('');
        const erroresValidacion = validarContrato(valores, { esNda, esServicios });
        setErrores(erroresValidacion);

        const nuevosErroresChecklist = {};
        for (const item of documentosReq) {
                if (!item.opcional && !archivosChecklist[item.etiqueta]) {
                        nuevosErroresChecklist[item.etiqueta] = 'Este documento es obligatorio.';
                }
        }
        setErroresChecklist(nuevosErroresChecklist);

        if (Object.keys(erroresValidacion).length > 0 || Object.keys(nuevosErroresChecklist).length > 0) return;

      setEnviando(true);
        try {
                const payload = {
                          ...valores,
                          monto: valores.monto === '' ? null : Number(valores.monto),
                          diasAvisoVencimiento: valores.diasAvisoVencimiento === '' ? null : Number(valores.diasAvisoVencimiento),
                };
                const contrato = await api.post('/contratos', payload);
                const id = contrato?.id || contrato?.contrato?.id;

          if (id) {
                    setContratoCreadoId(id);

                    const erroresDeDetalle = await guardarDetalles(id, tipoSeleccionado);

                    const itemsChecklist = documentosReq
                              .filter((item) => archivosChecklist[item.etiqueta])
                              .map((item) => ({ archivo: archivosChecklist[item.etiqueta], categoria: 'anexo', etiqueta: item.etiqueta, label: item.label }));
                    const itemsGenericos = archivos.map((archivo) => (
                              { archivo, categoria: categoriaArchivos, etiqueta: null, label: archivo.name }
                    ));

                    setSubiendoAdjuntos(true);
                    const conError = await subirAdjuntos(id, [...itemsChecklist, ...itemsGenericos]);
                    setSubiendoAdjuntos(false);

                    if (erroresDeDetalle.length > 0 || conError.length > 0) {
                                // El borrador ya existe; no perdemos ese avance por un detalle o adjunto fallido.
                      // Dejamos al usuario reintentar solo lo pendiente o seguir al expediente sin ello.
                      setErroresDetalle(erroresDeDetalle);
                      setFallidos(conError);
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
        const erroresDeDetalle = erroresDetalle.length > 0
                ? await guardarDetalles(contratoCreadoId, tipoSeleccionado)
                : [];
        const conError = await subirAdjuntos(contratoCreadoId, fallidos);
        setSubiendoAdjuntos(false);
        setErroresDetalle(erroresDeDetalle);
        setFallidos(conError);
        if (erroresDeDetalle.length === 0 && conError.length === 0) {
                navigate(`/contratos/${contratoCreadoId}`);
        }
  }

  // El borrador ya se guardó y solo estamos esperando resolver detalles o adjuntos fallidos: se
  // muestra una pantalla distinta (más simple) en vez del formulario completo, para no dar la
  // impresión de que se puede "editar" un contrato que ya existe desde aquí.
  if (contratoCreadoId) {
        return (
                <div>
                        <div className="page-header">
                                  <div>
                                              <h1>Nueva solicitud de contrato</h1>
                                              <p className="page-header-sub">
                                                            El borrador ya se guardó. Falta resolver {fallidos.length} documento(s)
                                                            {erroresDetalle.length > 0 ? ' y algunos datos de la solicitud' : ''}.
                                              </p>
                                  </div>
                        </div>
                        <div className="card" style={{ maxWidth: 820 }}>
                                  {erroresDetalle.length > 0 && (
                                              <div className="alert alert-error">
                                                            No se pudieron guardar los siguientes datos de la solicitud:
                                                            <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                                                                {erroresDetalle.map((msg, idx) => <li key={idx}>{msg}</li>)}
                                                            </ul>
                                              </div>
                                  )}
                                  {fallidos.length > 0 && (
                                              <div className="alert alert-error" style={{ marginTop: erroresDetalle.length > 0 ? 12 : 0 }}>
                                                            No se pudieron adjuntar los siguientes archivos:
                                                            <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                                                              {fallidos.map((f, idx) => (
                                                <li key={idx}>{f.label} — {f.error}</li>
                                              ))}
                                                            </ul>
                                              </div>
                                  )}
                                  <div className="form-actions">
                                              <button type="button" className="btn btn-primary" onClick={reintentarFallidos} disabled={subiendoAdjuntos}>
                                                {subiendoAdjuntos ? 'Reintentando…' : 'Reintentar'}
                                              </button>
                                              <button type="button" className="btn btn-secondary" onClick={() => navigate(`/contratos/${contratoCreadoId}`)}>
                                                            Ir al expediente sin esto
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

                                  {documentosReq.length > 0 && (
                                              <div style={{ marginTop: 8, marginBottom: 18 }}>
                                                            <label>Documentos requeridos para este tipo de solicitud</label>
                                                            <p className="muted" style={{ marginTop: 0, marginBottom: 8, fontSize: 13 }}>
                                                                            Jurídico pide estos documentos específicos para revisar la solicitud. Los marcados
                                                                            como "opcional" solo aplican si cuentas con ellos.
                                                            </p>
                                                            <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
                                                              {documentosReq.map((item) => {
                                                                              const archivo = archivosChecklist[item.etiqueta];
                                                                              return (
                                                                  <li key={item.etiqueta} style={{ padding: '8px 0', borderBottom: '1px solid #e5e5e5' }}>
                                                                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                                                                                    <span>
                                                                                                      {item.label}
                                                                                                      {item.opcional && <span className="muted" style={{ fontSize: 12 }}> (opcional)</span>}
                                                                                                    </span>
                                                                                                    {archivo && (
                                                                                    <button
                                                                                                        type="button"
                                                                                                        className="icon-btn"
                                                                                                        onClick={() => quitarArchivoChecklist(item.etiqueta)}
                                                                                                        disabled={enviando}
                                                                                                      >
                                                                                                      Quitar
                                                                                    </button>
                                                                                  )}
                                                                                  </div>
                                                                                  {archivo ? (
                                                                    <span className="muted" style={{ fontSize: 13 }}>
                                                                                        {archivo.name} ({formatBytes(archivo.size)})
                                                                    </span>
                                                                  ) : (
                                                                    <input
                                                                                        type="file"
                                                                                        onChange={(e) => {
                                                                                                            const file = e.target.files?.[0];
                                                                                                            if (file) elegirArchivoChecklist(item.etiqueta, file);
                                                                                                            e.target.value = '';
                                                                                        }}
                                                                                        disabled={enviando}
                                                                    />
                                                                  )}
                                                                                  {erroresChecklist[item.etiqueta] && (
                                                                    <div className="error-text">{erroresChecklist[item.etiqueta]}</div>
                                                                  )}
                                                                  </li>
                                                                              );
                                                              })}
                                                            </ul>
                                              </div>
                                  )}

                                  <div style={{ marginTop: 8, marginBottom: 18 }}>
                                              <label htmlFor="ns-archivos">Otros documentos (opcional)</label>
                                              <p className="muted" style={{ marginTop: 0, marginBottom: 8, fontSize: 13 }}>
                                                            Adjunta aquí cualquier otro archivo de referencia. También podrás
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
