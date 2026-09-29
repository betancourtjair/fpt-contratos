import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, unwrap } from '../../api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import Spinner from '../../components/Spinner.jsx';
import EstatusBadge from '../../components/EstatusBadge.jsx';
import FirmaContratoBadge from '../../components/FirmaContratoBadge.jsx';
import ContratoForm, { validarContrato, franquiciaPayload } from '../../components/ContratoForm.jsx';
import { rutaListaParaEstatus } from './ListaContratos.jsx';
import AutorizacionTimeline from '../../components/AutorizacionTimeline.jsx';
import DocumentosContrato from '../../components/DocumentosContrato.jsx';
import { formatMonto, formatFecha, formatFechaHora } from '../../utils.js';

function normalizarDecision(aprobacion) {
  const d = (aprobacion.decision || '').toLowerCase();
  if (d === 'aprobado' || d === 'rechazado' || d === 'omitido' || d === 'regresado') return d;
  return 'pendiente';
}

function fecha10(v) {
  return v ? String(v).substring(0, 10) : '';
}

// Mismos bloques de estatus que ListaContratos.jsx (VISTAS.solicitudes / VISTAS.vigentes):
// una solicitud (borrador/en_revision/en_autorizacion) se cancela distinto a un contrato ya
// vigente/activo (autorizado/activo/por_vencer) — ver POST .../cancelar-solicitud y
// .../cancelar-contrato en el backend.
const ESTATUS_SOLICITUD = ['borrador', 'en_revision', 'en_autorizacion'];
const ESTATUS_VIGENTE = ['autorizado', 'activo', 'por_vencer'];

function contratoAValores(c, fd) {
  fd = fd || {};
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
    fechaInicio: fecha10(c.fechaInicio),
    fechaFin: fecha10(c.fechaFin),
    renovacionAutomatica: !!c.renovacionAutomatica,
    diasAvisoVencimiento: c.diasAvisoVencimiento ?? '',
    // Datos de franquicia (si el contrato no es de franquicia, fd viene vacío y se usan defaults).
    clubId: fd.clubId || '',
    cuotaInicial: fd.cuotaInicial ?? '',
    regaliasPorcentaje: fd.regaliasPorcentaje ?? '',
    fondoMercadeoPorcentaje: fd.fondoMercadeoPorcentaje ?? '',
    periodicidadPagoRegalias: fd.periodicidadPagoRegalias || 'mensual',
    fechaProximoPagoRegalias: fecha10(fd.fechaProximoPagoRegalias),
    diasAvisoPagoRegalias: fd.diasAvisoPagoRegalias ?? '7',
    territorio: fd.territorio || '',
    radioExclusividadKm: fd.radioExclusividadKm ?? '',
    direccionPunto: fd.direccionPunto || '',
    fechaLimiteApertura: fecha10(fd.fechaLimiteApertura),
    diasAvisoApertura: fd.diasAvisoApertura ?? '30',
    numeroRenovacionesPermitidas: fd.numeroRenovacionesPermitidas ?? '',
    condicionesRenovacion: fd.condicionesRenovacion || '',
    diasAvisoRenovacion: fd.diasAvisoRenovacion ?? '60',
    fechaProximaAuditoria: fecha10(fd.fechaProximaAuditoria),
    diasAvisoAuditoria: fd.diasAvisoAuditoria ?? '15',
    polizasSeguroRequeridas: fd.polizasSeguroRequeridas || '',
    garantiaPersonal: !!fd.garantiaPersonal,
    garanteNombre: fd.garanteNombre || '',
  };
}

export default function DetalleContrato() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { usuario, esAdmin } = useAuth();

  const [contrato, setContrato] = useState(null);
  const [franquicia, setFranquicia] = useState(null);
  const [tipos, setTipos] = useState([]);
  const [clubes, setClubes] = useState([]);
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

  const [generandoDocumento, setGenerandoDocumento] = useState(false);
  const [errorGenerarDocumento, setErrorGenerarDocumento] = useState('');

  const [cancelandoSolicitud, setCancelandoSolicitud] = useState(false);
  const [mostrarCancelarContrato, setMostrarCancelarContrato] = useState(false);
  const [motivoCancelacion, setMotivoCancelacion] = useState('');
  const [cancelandoContrato, setCancelandoContrato] = useState(false);

  // Jurídico asignado a este contrato (dropdown editable solo por Cabeza de Jurídico/super_admin).
  const [juridicoOpciones, setJuridicoOpciones] = useState([]);
  const [guardandoAsignado, setGuardandoAsignado] = useState(false);
  const [errorAsignado, setErrorAsignado] = useState('');

  // Hilo de comentarios internos (distinto del comentario de decisión de arriba, que ya usa el
  // estado "comentarios").
  const [comentariosLista, setComentariosLista] = useState([]);
  const [cargandoComentarios, setCargandoComentarios] = useState(false);
  const [nuevoComentario, setNuevoComentario] = useState('');
  const [enviandoComentario, setEnviandoComentario] = useState(false);
  const [errorComentario, setErrorComentario] = useState('');

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
      setFranquicia(data?.franquicia ?? null);
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
  // Solo se necesita el catálogo de clubes si este contrato es de franquicia (para el selector
  // de club al editar sus datos).
  useEffect(() => {
    if (!contrato?.tipoContrato?.esFranquicia) return;
    api.get('/clubes')
      .then((data) => setClubes(unwrap(data, 'clubes') || []))
      .catch(() => {});
  }, [contrato?.tipoContrato?.esFranquicia]);

  const aprobaciones = contrato?.aprobaciones || [];
  const documentos = contrato?.documentos || [];
  const isBorrador = contrato?.estatus === 'borrador';
  // 'en_revision' = el contrato fue "regresado" por un aprobador para que el solicitante lo
  // corrija; se trata igual que borrador para efectos de poder editarlo y reenviarlo a
  // autorización (ver POST .../enviar-autorizacion y PATCH en el backend).
  const puedeEditarEstatus = contrato?.estatus === 'borrador' || contrato?.estatus === 'en_revision';
  const fueEnviado = !!contrato && contrato.estatus !== 'borrador';

  const solicitanteId =
    contrato?.solicitante?.id ??
    contrato?.solicitanteId ??
    contrato?.solicitadoPorId ??
    contrato?.creadoPor?.id ??
    contrato?.creadoPorId;
  const esSolicitante = usuario && solicitanteId && String(solicitanteId) === String(usuario.id);
  const puedeEnviar = puedeEditarEstatus && (esSolicitante || esAdmin);
  const puedeEditar = puedeEditarEstatus && (esSolicitante || esAdmin);
  const puedeCancelarSolicitud = ESTATUS_SOLICITUD.includes(contrato?.estatus) && (esSolicitante || esAdmin);
  // Antes era cualquier persona con rol "juridico"; ahora es autoridad exclusiva de Cabeza de
  // Jurídico (con super_admin de respaldo) — ver ROLES_AUTORIDAD_JURIDICA en el backend.
  const puedeCancelarContrato = ESTATUS_VIGENTE.includes(contrato?.estatus)
    && usuario && ['super_admin', 'cabeza_juridico'].includes(usuario.rol);
  const esVigente = ESTATUS_VIGENTE.includes(contrato?.estatus);

  // Solo Cabeza de Jurídico (o super_admin) puede llenar el dropdown de "Jurídico asignado";
  // jurídico normal (y el resto) solo ve el nombre ya asignado.
  const puedeAsignarJuridico = usuario && ['super_admin', 'cabeza_juridico'].includes(usuario.rol);
  // Los roles de nivel admin (esAdmin, incluye Cabeza de Jurídico) pueden comentar siempre;
  // jurídico normal solo mientras la solicitud sigue en borrador/en_revision/en_autorizacion.
  const puedeComentar = esAdmin || (usuario?.rol === 'juridico' && ESTATUS_SOLICITUD.includes(contrato?.estatus));

  // Directorio de personas con rol "juridico" (y cabeza_juridico) para llenar el dropdown de
  // asignación — solo se necesita si este usuario puede editarlo.
  useEffect(() => {
    if (!puedeAsignarJuridico) return;
    api.get('/usuarios/directorio', { rol: 'juridico,cabeza_juridico' })
      .then((data) => setJuridicoOpciones(unwrap(data, 'usuarios') || []))
      .catch(() => {});
  }, [puedeAsignarJuridico]);

  // Hilo de comentarios internos del contrato (distinto del comentario de decisión de arriba).
  const cargarComentarios = useCallback(async () => {
    if (!contrato?.id) return;
    setCargandoComentarios(true);
    try {
      const data = await api.get(`/contratos/${contrato.id}/comentarios`);
      setComentariosLista(unwrap(data, 'comentarios') || []);
    } catch {
      // No es crítico si no cargan; se deja la lista vacía.
    } finally {
      setCargandoComentarios(false);
    }
  }, [contrato?.id]);

  useEffect(() => { cargarComentarios(); }, [cargarComentarios]);

  async function handleCambiarJuridicoAsignado(e) {
    const nuevoId = e.target.value || null;
    setErrorAsignado('');
    setGuardandoAsignado(true);
    try {
      await api.patch(`/contratos/${id}/juridico-asignado`, { juridicoAsignadoId: nuevoId });
      await cargar();
    } catch (err) {
      setErrorAsignado(err.message || 'No se pudo actualizar el jurídico asignado.');
    } finally {
      setGuardandoAsignado(false);
    }
  }

  async function handleAgregarComentario(e) {
    e.preventDefault();
    if (!nuevoComentario.trim()) return;
    setErrorComentario('');
    setEnviandoComentario(true);
    try {
      await api.post(`/contratos/${id}/comentarios`, { comentario: nuevoComentario.trim() });
      setNuevoComentario('');
      await cargarComentarios();
    } catch (err) {
      setErrorComentario(err.message || 'No se pudo agregar el comentario.');
    } finally {
      setEnviandoComentario(false);
    }
  }

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
    setValoresEdit(contratoAValores(contrato, franquicia));
    setErroresEdit({});
    setEditando(true);
  }

  async function guardarEdicion(e) {
    e.preventDefault();
    const tipoElegidoValidacion = tipos.find((t) => t.id === valoresEdit.tipoContratoId);
    const erroresValidacion = validarContrato(valoresEdit, { requiereClub: !!tipoElegidoValidacion?.esFranquicia });
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

      const tipoElegido = tipos.find((t) => t.id === valoresEdit.tipoContratoId);
      if (tipoElegido?.esFranquicia) {
        await api.put(`/contratos/${id}/franquicia`, franquiciaPayload(valoresEdit));
      }

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
    // "Regresar" exige justificar por qué se regresa, para que el solicitante sepa qué corregir
    // (el backend también lo valida y rechaza la solicitud si comentarios viene vacío).
    if (decision === 'regresado' && !comentarios.trim()) {
      setAccionErr('Indica qué debe corregir el solicitante antes de regresarle el contrato.');
      return;
    }
    setAccionMsg('');
    setAccionErr('');
    setDecidiendo(true);
    try {
      await api.post(`/contratos/${id}/aprobaciones/${pasoActual.id}/decidir`, { decision, comentarios });
      const mensajes = {
        aprobado: 'Decisión registrada: aprobado.',
        rechazado: 'Decisión registrada: rechazado.',
        regresado: 'El contrato fue regresado al solicitante para su corrección.',
      };
      setAccionMsg(mensajes[decision] || 'Decisión registrada.');
      setComentarios('');
      await cargar();
    } catch (err) {
      setAccionErr(err.message || 'No se pudo registrar la decisión.');
    } finally {
      setDecidiendo(false);
    }
  }

  async function handleGenerarDocumento() {
    setErrorGenerarDocumento('');
    setGenerandoDocumento(true);
    try {
      await api.post(`/contratos/${id}/generar-documento`);
      await cargar();
    } catch (err) {
      setErrorGenerarDocumento(err.message || 'No se pudo generar el documento.');
    } finally {
      setGenerandoDocumento(false);
    }
  }

  async function handleCancelarSolicitud() {
    const confirmado = window.confirm(
      `¿Cancelar la solicitud "${contrato.folio} - ${contrato.titulo}"? Ya no se podrá continuar su autorización.`
    );
    if (!confirmado) return;
    const motivo = window.prompt('Motivo de la cancelación (opcional):', '') || undefined;
    setAccionMsg('');
    setAccionErr('');
    setCancelandoSolicitud(true);
    try {
      await api.post(`/contratos/${id}/cancelar-solicitud`, { motivo });
      setAccionMsg('La solicitud fue cancelada.');
      await cargar();
    } catch (err) {
      setAccionErr(err.message || 'No se pudo cancelar la solicitud.');
    } finally {
      setCancelandoSolicitud(false);
    }
  }

  async function handleCancelarContrato(e) {
    e.preventDefault();
    if (!motivoCancelacion.trim()) return;
    setAccionMsg('');
    setAccionErr('');
    setCancelandoContrato(true);
    try {
      await api.post(`/contratos/${id}/cancelar-contrato`, { motivo: motivoCancelacion.trim() });
      setAccionMsg('El contrato fue cancelado.');
      setMostrarCancelarContrato(false);
      setMotivoCancelacion('');
      await cargar();
    } catch (err) {
      setAccionErr(err.message || 'No se pudo cancelar el contrato.');
    } finally {
      setCancelandoContrato(false);
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
          {esVigente && <FirmaContratoBadge firmado={contrato.firmado} />}
          {puedeEnviar && (
            <button className="btn btn-primary" onClick={handleEnviarAutorizacion} disabled={enviandoAutorizacion}>
              {enviandoAutorizacion ? 'Enviando…' : 'Enviar a autorización'}
            </button>
          )}
          {puedeCancelarSolicitud && (
            <button className="btn btn-danger" onClick={handleCancelarSolicitud} disabled={cancelandoSolicitud}>
              {cancelandoSolicitud ? 'Cancelando…' : 'Cancelar solicitud'}
            </button>
          )}
          {puedeCancelarContrato && !mostrarCancelarContrato && (
            <button className="btn btn-danger" onClick={() => setMostrarCancelarContrato(true)}>
              Cancelar contrato
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => navigate(rutaListaParaEstatus(contrato.estatus))}>Volver al listado</button>
        </div>
      </div>

      {accionMsg && <div className="alert alert-success">{accionMsg}</div>}
      {accionErr && <div className="alert alert-error">{accionErr}</div>}

      {mostrarCancelarContrato && (
        <div className="card" style={{ borderColor: 'var(--color-danger, #c0392b)' }}>
          <div className="card-title">Cancelar este contrato vigente</div>
          <p className="muted" style={{ fontSize: 13, marginTop: -8 }}>
            Esta acción es solo para Cabeza de Jurídico y no se puede deshacer. El motivo queda
            guardado en el expediente del contrato.
          </p>
          <form onSubmit={handleCancelarContrato}>
            <div className="field">
              <label htmlFor="motivo-cancelacion">Motivo de la cancelación *</label>
              <textarea
                id="motivo-cancelacion"
                value={motivoCancelacion}
                onChange={(e) => setMotivoCancelacion(e.target.value)}
                placeholder="Explica por qué se cancela este contrato…"
                required
              />
            </div>
            <div className="form-actions">
              <button
                type="submit"
                className="btn btn-danger"
                disabled={cancelandoContrato || !motivoCancelacion.trim()}
              >
                {cancelandoContrato ? 'Cancelando…' : 'Confirmar cancelación'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { setMostrarCancelarContrato(false); setMotivoCancelacion(''); }}
                disabled={cancelandoContrato}
              >
                Cerrar
              </button>
            </div>
          </form>
        </div>
      )}

      {contrato.estatus === 'cancelado' && contrato.motivoCancelacion && (
        <div className="alert alert-error">
          <strong>Cancelado{contrato.canceladoEn ? ` el ${formatFechaHora(contrato.canceladoEn)}` : ''}.</strong>{' '}
          Motivo: {contrato.motivoCancelacion}
        </div>
      )}

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
                <ContratoForm valores={valoresEdit} onChange={setValoresEdit} errores={erroresEdit} tipos={tipos} clubes={clubes} />
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

          {!editando && contrato.tipoContrato?.esFranquicia && (
            <div className="card">
              <div className="card-title">Datos de franquicia</div>
              {!franquicia ? (
                <div className="empty-state">
                  Este contrato es de franquicia pero aún no tiene datos capturados.
                  {puedeEditar && ' Usa "Editar" arriba para agregarlos.'}
                </div>
              ) : (
                <dl className="definition-grid">
                  <div>
                    <dt>Club</dt>
                    <dd>{franquicia.clubNombre || '—'}</dd>
                  </div>
                  <div>
                    <dt>Cuota inicial</dt>
                    <dd>{formatMonto(franquicia.cuotaInicial, contrato.moneda)}</dd>
                  </div>
                  <div>
                    <dt>Regalías</dt>
                    <dd>{franquicia.regaliasPorcentaje != null ? `${franquicia.regaliasPorcentaje}%` : '—'}</dd>
                  </div>
                  <div>
                    <dt>Fondo de mercadeo</dt>
                    <dd>{franquicia.fondoMercadeoPorcentaje != null ? `${franquicia.fondoMercadeoPorcentaje}%` : '—'}</dd>
                  </div>
                  <div>
                    <dt>Próximo pago de regalías</dt>
                    <dd>
                      {formatFecha(franquicia.fechaProximoPagoRegalias)}
                      {franquicia.periodicidadPagoRegalias && ` (${franquicia.periodicidadPagoRegalias})`}
                    </dd>
                  </div>
                  <div>
                    <dt>Territorio</dt>
                    <dd>{franquicia.territorio || '—'}</dd>
                  </div>
                  <div>
                    <dt>Radio de exclusividad</dt>
                    <dd>{franquicia.radioExclusividadKm != null ? `${franquicia.radioExclusividadKm} km` : '—'}</dd>
                  </div>
                  <div>
                    <dt>Dirección del punto</dt>
                    <dd>{franquicia.direccionPunto || '—'}</dd>
                  </div>
                  <div>
                    <dt>Fecha límite de apertura</dt>
                    <dd>{formatFecha(franquicia.fechaLimiteApertura)}</dd>
                  </div>
                  <div>
                    <dt>Renovaciones permitidas</dt>
                    <dd>{franquicia.numeroRenovacionesPermitidas ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Próxima auditoría</dt>
                    <dd>{formatFecha(franquicia.fechaProximaAuditoria)}</dd>
                  </div>
                  <div>
                    <dt>Pólizas de seguro requeridas</dt>
                    <dd>{franquicia.polizasSeguroRequeridas || '—'}</dd>
                  </div>
                  <div>
                    <dt>Garantía personal</dt>
                    <dd>{franquicia.garantiaPersonal ? (franquicia.garanteNombre || 'Sí') : 'No'}</dd>
                  </div>
                  {franquicia.condicionesRenovacion && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <dt>Condiciones de renovación</dt>
                      <dd>{franquicia.condicionesRenovacion}</dd>
                    </div>
                  )}
                </dl>
              )}
            </div>
          )}

          <div className="card">
            <div className="card-title">
              Documentos del expediente
              {contrato.tipoContrato?.plantillaNombreArchivo && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleGenerarDocumento}
                  disabled={generandoDocumento}
                  title={`Genera el documento desde la plantilla "${contrato.tipoContrato.plantillaNombreArchivo}" con los datos de este contrato.`}
                >
                  {generandoDocumento ? 'Generando…' : 'Generar documento desde plantilla'}
                </button>
              )}
            </div>
            {errorGenerarDocumento && <div className="alert alert-error">{errorGenerarDocumento}</div>}
            <DocumentosContrato
              contratoId={contrato.id}
              documentos={documentos}
              onSubido={cargar}
              contraparteNombre={contrato.contraparteNombre}
              contraparteEmail={contrato.contraparteEmail}
              />
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-title">Jurídico asignado</div>
            {errorAsignado && <div className="alert alert-error">{errorAsignado}</div>}
            {puedeAsignarJuridico ? (
              <div className="field">
                <label htmlFor="juridico-asignado">
                  Persona de jurídico dando seguimiento a este contrato
                </label>
                <select
                  id="juridico-asignado"
                  value={contrato.juridicoAsignado?.id || ''}
                  onChange={handleCambiarJuridicoAsignado}
                  disabled={guardandoAsignado}
                >
                  <option value="">Sin asignar</option>
                  {juridicoOpciones.map((op) => (
                    <option key={op.id} value={op.id}>{op.nombre}</option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                {contrato.juridicoAsignado?.nombre || 'Sin asignar todavía.'}
              </p>
            )}
          </div>

          <div className="card">
            <div className="card-title">Flujo de autorización</div>
            <AutorizacionTimeline aprobaciones={aprobaciones} enviado={fueEnviado} />

            {puedeDecidir && (
              <>
                <hr className="divider" />
                <h3 style={{ fontSize: 15 }}>Tu decisión: {pasoActual?.nombrePaso}</h3>
                <div className="field">
                  <label htmlFor="comentarios">
                    Comentarios{pasoActual?.permiteRegresar !== false && ' (requeridos para regresar)'}
                  </label>
                  <textarea
                    id="comentarios"
                    value={comentarios}
                    onChange={(e) => setComentarios(e.target.value)}
                    placeholder="Opcional para aprobar/rechazar; explica qué corregir si regresas el contrato…"
                  />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-success" disabled={decidiendo} onClick={() => handleDecidir('aprobado')}>
                    Aprobar
                  </button>
                  {pasoActual?.permiteRegresar !== false && (
                    <button
                      className="btn btn-secondary"
                      disabled={decidiendo}
                      onClick={() => handleDecidir('regresado')}
                      title="Regresa el contrato al solicitante para que lo corrija, en vez de rechazarlo."
                    >
                      Regresar
                    </button>
                  )}
                  <button className="btn btn-danger" disabled={decidiendo} onClick={() => handleDecidir('rechazado')}>
                    Rechazar
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="card">
            <div className="card-title">Comentarios internos</div>
            {cargandoComentarios ? (
              <Spinner label="Cargando comentarios…" />
            ) : comentariosLista.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>Aún no hay comentarios.</p>
            ) : (
              <ul className="comment-list" style={{ listStyle: 'none', padding: 0, margin: '0 0 16px' }}>
                {comentariosLista.map((c) => (
                  <li key={c.id} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 13 }}>
                      <strong>{c.usuarioNombre}</strong>{' '}
                      <span className="muted">· {formatFechaHora(c.createdAt)}</span>
                    </div>
                    <div>{c.comentario}</div>
                  </li>
                ))}
              </ul>
            )}
            {errorComentario && <div className="alert alert-error">{errorComentario}</div>}
            {puedeComentar && (
              <form onSubmit={handleAgregarComentario}>
                <div className="field">
                  <label htmlFor="nuevo-comentario">Agregar comentario</label>
                  <textarea
                    id="nuevo-comentario"
                    value={nuevoComentario}
                    onChange={(e) => setNuevoComentario(e.target.value)}
                    placeholder="Escribe un comentario para este contrato…"
                  />
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn btn-secondary" disabled={enviandoComentario || !nuevoComentario.trim()}>
                    {enviandoComentario ? 'Enviando…' : 'Comentar'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
