import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, unwrap } from '../../api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import Spinner from '../../components/Spinner.jsx';
import EstatusBadge from '../../components/EstatusBadge.jsx';
import ContratoForm, { validarContrato } from '../../components/ContratoForm.jsx';
import AutorizacionTimeline from '../../components/AutorizacionTimeline.jsx';
import DocumentosContrato from '../../components/DocumentosContrato.jsx';
import { formatMonto, formatFecha } from '../../utils.js';

function normalizarDecision(aprobacion) {
  const d = (aprobacion.decision || '').toLowerCase();
  if (d === 'aprobado' || d === 'rechazado' || d === 'omitido') return d;
  return 'pendiente';
}

function contratoAValores(c) {
  return {
    titulo: c.titulo || '',
    descripcion: c.descripcion || '',
    tipoContratoId: c.tipoContrato?.id || c.tipoContratoId || '',
    parte: c.parte || '',
    contraparteNombre: c.contraparteNombre || '',
    contraparteRFC: c.contraparteRFC || '',
    contraparteContacto: c.contraparteContacto || '',
    contraparteEmail: c.contraparteEmail || '',
    monto: c.monto ?? '',
    moneda: c.moneda || 'MXN',
    fechaInicio: c.fechaInicio ? c.fechaInicio.substring(0, 10) : '',
    fechaFin: c.fechaFin ? c.fechaFin.substring(0, 10) : '',
    renovacionAutomatica: !!c.renovacionAutomatica,
    diasAvisoVencimiento: c.diasAvisoVencimiento ?? '',
  };
}

export default function DetalleContrato() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { usuario, esAdmin } = useAuth();

  const [contrato, setContrato] = useState(null);
  const [tipos, setTipos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [editando, setEditando] = useState(false);
  const [valoresEdit, setValoresEdit] = useState(null);
  const [erroresEdit, setErroresEdit] = useState({});
  const [guardando, setGuardando] = useState(false);

  const [enviandoAutorizacion, setEnviandoAutorizacion] = useState(false);
  const [accionMsg, setAccionMsg] = useState('');
  const [accionErr, setAccionErr] = useState('');

  const [comentarios, setComentarios] = useState('');
  const [decidiendo, setDecidiendo] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const data = await api.get(`/contratos/${id}`);
      // El backend real regresa { contrato, aprobaciones, documentos } como llaves
      // hermanas (no anidadas dentro de contrato); soportamos también la forma plana
      // por si el backend evoluciona a devolver todo dentro de un solo objeto.
      const base = unwrap(data, 'contrato');
      const normalizado = {
        ...base,
        aprobaciones: data?.aprobaciones ?? base?.aprobaciones ?? [],
        documentos: data?.documentos ?? base?.documentos ?? [],
      };
      setContrato(normalizado);
    } catch (err) {
      setError(err.message || 'No se pudo cargar el contrato.');
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    api.get('/tipos-contrato', { activo: 'false' })
      .then((data) => setTipos(unwrap(data, 'tiposContrato') || []))
      .catch(() => {});
  }, []);

  const aprobaciones = contrato?.aprobaciones || [];
  const documentos = contrato?.documentos || [];
  const isBorrador = contrato?.estatus === 'borrador';
  const fueEnviado = !!contrato && contrato.estatus !== 'borrador';

  const solicitanteId =
    contrato?.solicitante?.id ??
    contrato?.solicitanteId ??
    contrato?.solicitadoPorId ??
    contrato?.creadoPor?.id ??
    contrato?.creadoPorId;
  const esSolicitante = usuario && solicitanteId && String(solicitanteId) === String(usuario.id);
  const puedeEnviar = isBorrador && (esSolicitante || esAdmin);
  const puedeEditar = isBorrador && (esSolicitante || esAdmin);

  const pasoActual = useMemo(() => {
    const ordenadas = [...aprobaciones].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    return ordenadas.find((a) => normalizarDecision(a) === 'pendiente') || null;
  }, [aprobaciones]);

  const puedeDecidir = useMemo(() => {
    if (!pasoActual || !usuario) return false;
    const aprobadorId = pasoActual.aprobador?.id ?? pasoActual.aprobadorId;
    const rolRequerido = pasoActual.rolAprobador ?? pasoActual.rolRequerido;
    const porUsuario = aprobadorId && String(aprobadorId) === String(usuario.id);
    const porRol = rolRequerido && rolRequerido === usuario.rol;
    return Boolean(porUsuario || porRol);
  }, [pasoActual, usuario]);

  function iniciarEdicion() {
    setValoresEdit(contratoAValores(contrato));
    setErroresEdit({});
    setEditando(true);
  }

  async function guardarEdicion(e) {
    e.preventDefault();
    const erroresValidacion = validarContrato(valoresEdit);
    setErroresEdit(erroresValidacion);
    if (Object.keys(erroresValidacion).length > 0) return;

    setGuardando(true);
    setAccionErr('');
    try {
      const payload = {
        ...valoresEdit,
        monto: valoresEdit.monto === '' ? null : Number(valoresEdit.monto),
        diasAvisoVencimiento: valoresEdit.diasAvisoVencimiento === '' ? null : Number(valoresEdit.diasAvisoVencimiento),
      };
      await api.patch(`/contratos/${id}`, payload);
      // Recargamos el detalle completo en vez de usar la respuesta del PATCH directamente:
      // esta última solo trae la fila del contrato, sin el tipoContrato ni las aprobaciones/documentos.
      await cargar();
      setEditando(false);
    } catch (err) {
      setAccionErr(err.message || 'No se pudo guardar el contrato.');
    } finally {
      setGuardando(false);
    }
  }

  async function handleEnviarAutorizacion() {
    setAccionMsg('');
    setAccionErr('');
    setEnviandoAutorizacion(true);
    try {
      await api.post(`/contratos/${id}/enviar-autorizacion`);
      setAccionMsg('El contrato se envió a autorización.');
      await cargar();
    } catch (err) {
      setAccionErr(err.message || 'No se pudo enviar a autorización.');
    } finally {
      setEnviandoAutorizacion(false);
    }
  }

  async function handleDecidir(decision) {
    if (!pasoActual) return;
    setAccionMsg('');
    setAccionErr('');
    setDecidiendo(true);
    try {
      await api.post(`/contratos/${id}/aprobaciones/${pasoActual.id}/decidir`, { decision, comentarios });
      setAccionMsg(decision === 'aprobado' ? 'Decisión registrada: aprobado.' : 'Decisión registrada: rechazado.');
      setComentarios('');
      await cargar();
    } catch (err) {
      setAccionErr(err.message || 'No se pudo registrar la decisión.');
    } finally {
      setDecidiendo(false);
    }
  }

  if (cargando) return <Spinner label="Cargando expediente…" />;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!contrato) return null;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>
            {contrato.folio} · {contrato.titulo}
          </h1>
          <p className="page-header-sub">
            {contrato.tipoContrato?.nombre || 'Sin tipo'} · {contrato.parte}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <EstatusBadge estatus={contrato.estatus} />
          {puedeEnviar && (
            <button className="btn btn-primary" onClick={handleEnviarAutorizacion} disabled={enviandoAutorizacion}>
              {enviandoAutorizacion ? 'Enviando…' : 'Enviar a autorización'}
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => navigate('/contratos')}>Volver al listado</button>
        </div>
      </div>

      {accionMsg && <div className="alert alert-success">{accionMsg}</div>}
      {accionErr && <div className="alert alert-error">{accionErr}</div>}

      <div className="grid-2">
        <div>
          <div className="card">
            <div className="card-title">
              Datos del contrato
              {puedeEditar && !editando && (
                <button className="btn btn-secondary btn-sm" onClick={iniciarEdicion}>Editar</button>
              )}
            </div>

            {editando ? (
              <form onSubmit={guardarEdicion}>
                <ContratoForm valores={valoresEdit} onChange={setValoresEdit} errores={erroresEdit} tipos={tipos} />
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" disabled={guardando}>
                    {guardando ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setEditando(false)} disabled={guardando}>
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <>
                {contrato.descripcion && <p style={{ marginBottom: 16 }}>{contrato.descripcion}</p>}
                <dl className="definition-grid">
                  <div>
                    <dt>Parte (FPT)</dt>
                    <dd>{contrato.parte || '—'}</dd>
                  </div>
                  <div>
                    <dt>Tipo de contrato</dt>
                    <dd>{contrato.tipoContrato?.nombre || '—'}</dd>
                  </div>
                  <div>
                    <dt>Contraparte</dt>
                    <dd>{contrato.contraparteNombre || '—'}</dd>
                  </div>
                  <div>
                    <dt>RFC contraparte</dt>
                    <dd>{contrato.contraparteRFC || '—'}</dd>
                  </div>
                  <div>
                    <dt>Contacto</dt>
                    <dd>{contrato.contraparteContacto || '—'}</dd>
                  </div>
                  <div>
                    <dt>Correo de contacto</dt>
                    <dd>{contrato.contraparteEmail || '—'}</dd>
                  </div>
                  <div>
                    <dt>Monto</dt>
                    <dd>{formatMonto(contrato.monto, contrato.moneda)}</dd>
                  </div>
                  <div>
                    <dt>Vigencia</dt>
                    <dd>{formatFecha(contrato.fechaInicio)} — {formatFecha(contrato.fechaFin)}</dd>
                  </div>
                  <div>
                    <dt>Renovación automática</dt>
                    <dd>{contrato.renovacionAutomatica ? 'Sí' : 'No'}</dd>
                  </div>
                  <div>
                    <dt>Aviso de vencimiento</dt>
                    <dd>{contrato.diasAvisoVencimiento ? `${contrato.diasAvisoVencimiento} días antes` : '—'}</dd>
                  </div>
                </dl>
              </>
            )}
          </div>

          <div className="card">
            <div className="card-title">Documentos del expediente</div>
            <DocumentosContrato contratoId={contrato.id} documentos={documentos} onSubido={cargar} />
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-title">Flujo de autorización</div>
            <AutorizacionTimeline aprobaciones={aprobaciones} enviado={fueEnviado} />

            {puedeDecidir && (
              <>
                <hr className="divider" />
                <h3 style={{ fontSize: 15 }}>Tu decisión: {pasoActual?.nombrePaso}</h3>
                <div className="field">
                  <label htmlFor="comentarios">Comentarios</label>
                  <textarea
                    id="comentarios"
                    value={comentarios}
                    onChange={(e) => setComentarios(e.target.value)}
                    placeholder="Opcional: justifica tu decisión…"
                  />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-success" disabled={decidiendo} onClick={() => handleDecidir('aprobado')}>
                    Aprobar
                  </button>
                  <button className="btn btn-danger" disabled={decidiendo} onClick={() => handleDecidir('rechazado')}>
                    Rechazar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
