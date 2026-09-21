const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { query, withTransaction } = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { badRequest, notFound, forbidden, conflict, traducirErrorPostgres } = require('../utils/errors');
const { requireAuth } = require('../middleware/auth');
const { registrarAuditoria } = require('../utils/audit');
const { generarFolio } = require('../utils/folio');
const {
  resolverPlantillaAplicable,
  generarAprobaciones,
  siguienteOrdenPendiente,
  destinatariosDePaso,
} = require('../utils/flujoEngine');
const { enviarCorreo } = require('../email');
// storage: solo para leer la plantilla Word del tipo de contrato (tipos_contrato), sin cambios.
const storage = require('../storage');
// storageContratos: documentos del EXPEDIENTE (contrato_documentos) — local o SharePoint según
// CONTRATOS_STORAGE_DRIVER, ver storageContratos.js.
const storageContratos = require('../storageContratos');
const { condicionVisibilidad } = require('../utils/visibilidad');
const { datosParaPlantilla, renderizarPlantilla } = require('../utils/plantillas');
const { estatusLabel } = require('../utils/estatusLabels');
const { sincronizarEstatusEnDocumentos } = require('../utils/documentosMetadatos');
const documenso = require('../documensoClient');
const firmaElectronica = require('../utils/firmaElectronica');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const CAMPOS_EDITABLES = [
  'titulo', 'descripcion', 'tipoContratoId', 'parte', 'contraparteNombre', 'contraparteRFC',
  'contraparteContacto', 'contraparteEmail', 'monto', 'moneda', 'fechaInicio', 'fechaFin',
  'renovacionAutomatica', 'diasAvisoVencimiento',
];

const MAPA_COLUMNAS = {
  titulo: 'titulo',
  descripcion: 'descripcion',
  tipoContratoId: 'tipo_contrato_id',
  parte: 'parte',
  contraparteNombre: 'contraparte_nombre',
  contraparteRFC: 'contraparte_rfc',
  contraparteContacto: 'contraparte_contacto',
  contraparteEmail: 'contraparte_email',
  monto: 'monto',
  moneda: 'moneda',
  fechaInicio: 'fecha_inicio',
  fechaFin: 'fecha_fin',
  renovacionAutomatica: 'renovacion_automatica',
  diasAvisoVencimiento: 'dias_aviso_vencimiento',
};

function esRolPrivilegiado(rol) {
  return ['super_admin', 'admin', 'juridico'].includes(rol);
}

// Un contrato "vigente" (autorizado/activo/por_vencer) se muestra como Firmado o Pendiente de
// firma (ver ListaContratos.jsx y DetalleContrato.jsx) según si YA existe, en cualquier momento
// de su historial de documentos (no solo la versión vigente — un documento superado sigue
// contando como prueba de que sí se firmó), un documento que:
//   - Se firmó completo por Documenso (documenso_firmado_en se marca en el documento ORIGINAL que
//     se mandó a firmar — ver procesarDocumentoFirmado en utils/firmaElectronica.js — y ya no se
//     borra aunque después quede como versión superada), o
//   - Se adjuntó como "Documento firmado manual" (categoria = 'firmado_manual', solo lo puede
//     subir jurídico — ver POST .../documentos más abajo).
// Si ninguno de los dos existe, el contrato se considera "Pendiente de firma" (incluye el caso de
// que ni siquiera se haya mandado a firmar todavía).
const SQL_FIRMADO = `EXISTS (
        SELECT 1 FROM contrato_documentos fd
        WHERE fd.contrato_id = c.id
          AND (fd.documenso_firmado_en IS NOT NULL OR fd.categoria = 'firmado_manual')
      ) AS firmado`;

/**
 * Valida el área (page/positionX/positionY/width/height) que el usuario dibujó a mano sobre el
 * PDF en el editor visual de EnviarAFirmarModal.jsx para un firmante dado. Si no viene `area`
 * (p. ej. un cliente viejo, o un uso directo del API), se regresa `null` y quien llame debe caer
 * de vuelta a la posición automática (documensoClient.areaPorDefecto). Los rangos y el "1-indexed"
 * de `page` respetan tal cual el esquema de Documenso (positionX/Y/width/height son porcentajes
 * 0-100 del tamaño real de esa página, ver docs/developers/api/fields del API de Documenso).
 */
function validarArea(area, idxFirmante) {
  if (area === undefined || area === null) return null;
  const numero = (valor, campo) => {
    const n = Number(valor);
    if (!Number.isFinite(n)) {
      throw badRequest(`El área de firma del firmante #${idxFirmante + 1} tiene "${campo}" inválido.`);
    }
    return n;
  };
  const page = numero(area.page, 'page');
  const positionX = numero(area.positionX, 'positionX');
  const positionY = numero(area.positionY, 'positionY');
  const width = numero(area.width, 'width');
  const height = numero(area.height, 'height');
  if (!Number.isInteger(page) || page < 1) {
    throw badRequest(`El área de firma del firmante #${idxFirmante + 1} tiene una página inválida.`);
  }
  for (const [campo, valor] of [['positionX', positionX], ['positionY', positionY], ['width', width], ['height', height]]) {
    if (valor < 0 || valor > 100) {
      throw badRequest(`El área de firma del firmante #${idxFirmante + 1} tiene "${campo}" fuera de rango (0-100).`);
    }
  }
  return {
    page,
    // Se recorta para que el recuadro nunca se salga de la página, por si el navegador del
    // usuario mandó un recuadro pegado a una orilla (Documenso no lo valida de su lado).
    positionX: Math.min(positionX, 100 - width),
    positionY: Math.min(positionY, 100 - height),
    width,
    height,
  };
}

async function cargarContrato(id) {
  const { rows } = await query('SELECT * FROM contratos WHERE id = $1', [id]);
  return rows[0] || null;
}

function puedeVerContrato(contrato, usuario, tienePendiente) {
  if (esRolPrivilegiado(usuario.rol) || usuario.rol === 'lectura') return true;
  if (contrato.solicitado_por_id === usuario.id) return true;
  if (usuario.rol === 'aprobador' && tienePendiente) return true;
  return false;
}

// ---------------------------------------------------------------------------
// POST /api/contratos - crear borrador
// ---------------------------------------------------------------------------
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const { titulo, tipoContratoId, parte, contraparteNombre } = body;
    if (!titulo || !tipoContratoId || !parte || !contraparteNombre) {
      throw badRequest('titulo, tipoContratoId, parte y contraparteNombre son requeridos.');
    }

    try {
      const contrato = await withTransaction(async (client) => {
        const folio = await generarFolio(client);
        const { rows } = await client.query(
          `INSERT INTO contratos
             (folio, titulo, descripcion, tipo_contrato_id, parte, contraparte_nombre,
              contraparte_rfc, contraparte_contacto, contraparte_email, monto, moneda,
              fecha_inicio, fecha_fin, renovacion_automatica, dias_aviso_vencimiento,
              solicitado_por_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           RETURNING *`,
          [
            folio,
            titulo,
            body.descripcion || null,
            tipoContratoId,
            parte,
            contraparteNombre,
            body.contraparteRFC || null,
            body.contraparteContacto || null,
            body.contraparteEmail || null,
            body.monto ?? null,
            body.moneda || 'MXN',
            body.fechaInicio || null,
            body.fechaFin || null,
            Boolean(body.renovacionAutomatica),
            body.diasAvisoVencimiento ?? 30,
            req.usuario.id,
          ]
        );
        const nuevo = rows[0];
        await registrarAuditoria({
          contratoId: nuevo.id,
          usuarioId: req.usuario.id,
          accion: 'contrato_creado',
          detalle: `Folio ${nuevo.folio} creado en estatus borrador.`,
          db: client,
        });
        return nuevo;
      });
      res.status(201).json({ contrato });
    } catch (err) {
      const traducido = traducirErrorPostgres(err);
      if (traducido) throw traducido;
      throw err;
    }
  })
);

// ---------------------------------------------------------------------------
// GET /api/contratos - listado con filtros, role-aware
// ---------------------------------------------------------------------------
// Columnas por las que se puede ordenar el listado (whitelist: nunca se interpola
// directamente el valor de orderBy en el SQL, para evitar inyección).
const COLUMNAS_ORDEN = {
  folio: 'c.folio',
  titulo: 'c.titulo',
  contraparteNombre: 'c.contraparte_nombre',
  monto: 'c.monto',
  fechaInicio: 'c.fecha_inicio',
  fechaFin: 'c.fecha_fin',
  estatus: 'c.estatus',
  createdAt: 'c.created_at',
};

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const {
      estatus, estatusIn, tipoContratoId, texto, proximosAVencer,
      parte, moneda, montoMin, montoMax,
      fechaInicioDesde, fechaInicioHasta, fechaFinDesde, fechaFinHasta,
      orderBy, orderDir,
    } = req.query;
    const usuario = req.usuario;

    // Los contratos de franquicia viven en su propio módulo (GET /api/franquicias), separado
    // por completo del listado general de "Contratos" y del Dashboard principal.
    const condiciones = ['tc.es_franquicia = false'];
    const valores = [];
    let i = 1;

    const visibilidad = condicionVisibilidad(usuario, 0);
    if (visibilidad) {
      condiciones.push(visibilidad.condicion);
      valores.push(...visibilidad.valores);
      i += visibilidad.valores.length;
    }

    if (estatus) {
      condiciones.push(`c.estatus = $${i++}`);
      valores.push(estatus);
    }
    // estatusIn: lista separada por comas (p.ej. "activo,por_vencer") para las vistas de
    // Solicitudes / Contratos vigentes / Archivo, y para la búsqueda avanzada (multi-select).
    if (estatusIn) {
      const lista = String(estatusIn).split(',').map((s) => s.trim()).filter(Boolean);
      if (lista.length > 0) {
        condiciones.push(`c.estatus = ANY($${i++})`);
        valores.push(lista);
      }
    }
    if (tipoContratoId) {
      condiciones.push(`c.tipo_contrato_id = $${i++}`);
      valores.push(tipoContratoId);
    }
    if (texto) {
      condiciones.push(
        `(c.titulo ILIKE $${i} OR c.contraparte_nombre ILIKE $${i} OR c.folio ILIKE $${i} OR c.contraparte_rfc ILIKE $${i})`
      );
      valores.push(`%${texto}%`);
      i++;
    }
    if (parte) {
      condiciones.push(`c.parte = $${i++}`);
      valores.push(parte);
    }
    if (moneda) {
      condiciones.push(`c.moneda = $${i++}`);
      valores.push(moneda);
    }
    if (montoMin !== undefined && montoMin !== '') {
      const num = Number(montoMin);
      if (!Number.isNaN(num)) {
        condiciones.push(`c.monto >= $${i++}`);
        valores.push(num);
      }
    }
    if (montoMax !== undefined && montoMax !== '') {
      const num = Number(montoMax);
      if (!Number.isNaN(num)) {
        condiciones.push(`c.monto <= $${i++}`);
        valores.push(num);
      }
    }
    if (fechaInicioDesde) {
      condiciones.push(`c.fecha_inicio >= $${i++}`);
      valores.push(fechaInicioDesde);
    }
    if (fechaInicioHasta) {
      condiciones.push(`c.fecha_inicio <= $${i++}`);
      valores.push(fechaInicioHasta);
    }
    if (fechaFinDesde) {
      condiciones.push(`c.fecha_fin >= $${i++}`);
      valores.push(fechaFinDesde);
    }
    if (fechaFinHasta) {
      condiciones.push(`c.fecha_fin <= $${i++}`);
      valores.push(fechaFinHasta);
    }
    if (proximosAVencer === 'true') {
      condiciones.push(
        `c.fecha_fin IS NOT NULL AND c.estatus IN ('activo', 'por_vencer')
         AND c.fecha_fin <= (CURRENT_DATE + (c.dias_aviso_vencimiento || ' days')::interval)`
      );
    }

    const columnaOrden = COLUMNAS_ORDEN[orderBy] || 'c.created_at';
    const direccionOrden = String(orderDir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const { rows } = await query(
      `SELECT c.*, tc.nombre AS tipo_contrato_nombre, u.nombre AS solicitado_por_nombre,
              ${SQL_FIRMADO}
       FROM contratos c
       JOIN tipos_contrato tc ON tc.id = c.tipo_contrato_id
       JOIN usuarios u ON u.id = c.solicitado_por_id
       ${where}
       ORDER BY ${columnaOrden} ${direccionOrden} NULLS LAST`,
      valores
    );
    res.json({ contratos: rows });
  })
);

// ---------------------------------------------------------------------------
// GET /api/contratos/mis-pendientes-aprobar
// (declarado antes de /:id para que no choque con el parámetro dinámico)
// ---------------------------------------------------------------------------
router.get(
  '/mis-pendientes-aprobar',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT ca.*, c.folio, c.titulo, c.monto, c.moneda, c.contraparte_nombre, c.estatus AS contrato_estatus
       FROM contrato_aprobaciones ca
       JOIN contratos c ON c.id = ca.contrato_id
       WHERE ca.decision = 'pendiente'
         AND ca.orden = c.paso_actual_orden
         AND c.estatus = 'en_autorizacion'
         AND (ca.aprobador_id = $1 OR ca.rol_requerido = $2)
       ORDER BY c.created_at ASC`,
      [req.usuario.id, req.usuario.rol]
    );
    res.json({ pendientes: rows });
  })
);

// ---------------------------------------------------------------------------
// GET /api/contratos/:id - detalle con aprobaciones y documentos
// ---------------------------------------------------------------------------
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const contrato = await cargarContrato(req.params.id);
    if (!contrato) throw notFound('Contrato no encontrado.');

    const { rows: aprobaciones } = await query(
      'SELECT * FROM contrato_aprobaciones WHERE contrato_id = $1 ORDER BY orden ASC',
      [contrato.id]
    );

    const tienePendiente =
      req.usuario.rol === 'aprobador' &&
      aprobaciones.some(
        (a) =>
          a.decision === 'pendiente' &&
          a.orden === contrato.paso_actual_orden &&
          (a.aprobador_id === req.usuario.id || a.rol_requerido === req.usuario.rol)
      );

    if (!puedeVerContrato(contrato, req.usuario, tienePendiente)) {
      throw forbidden('No tienes acceso a este contrato.');
    }

    // Solo la versión vigente de cada documento (grupo_id); el historial completo de un
    // grupo se consulta aparte (GET /:id/documentos/grupo/:grupoId) para no cargar de más.
    const { rows: documentos } = await query(
      `SELECT d.*, u.nombre AS subido_por_nombre,
              (SELECT COUNT(*) FROM contrato_documentos d2 WHERE d2.grupo_id = d.grupo_id)::int AS total_versiones
       FROM contrato_documentos d
       LEFT JOIN usuarios u ON u.id = d.subido_por_id
       WHERE d.contrato_id = $1 AND d.es_version_actual = true
       ORDER BY d.created_at DESC`,
      [contrato.id]
    );
    const documentosConUrl = documentos.map((d) => ({ ...d, url: storageContratos.getUrl(d.ruta_archivo) }));

    const { rows: tipoRows } = await query(
      `SELECT tc.*, p.nombre_archivo AS plantilla_nombre_archivo
       FROM tipos_contrato tc
       LEFT JOIN plantillas_tipo_contrato p ON p.tipo_contrato_id = tc.id
       WHERE tc.id = $1`,
      [contrato.tipo_contrato_id]
    );
    const tipoContrato = tipoRows[0] || null;

    let franquicia = null;
    if (tipoContrato?.es_franquicia) {
      const { rows: franquiciaRows } = await query(
        `SELECT fd.*, cl.nombre AS club_nombre
         FROM contrato_franquicia_detalles fd
         LEFT JOIN clubes cl ON cl.id = fd.club_id
         WHERE fd.contrato_id = $1`,
        [contrato.id]
      );
      franquicia = franquiciaRows[0] || null;
    }

    let contraparteDetalle = null;
    let nda = null;
    let servicios = null;
    if (tipoContrato?.es_nda || tipoContrato?.es_servicios) {
      const { rows: contraparteRows } = await query(
        'SELECT * FROM contrato_contraparte_detalles WHERE contrato_id = $1',
        [contrato.id]
      );
      contraparteDetalle = contraparteRows[0] || null;
    }
    if (tipoContrato?.es_nda) {
      const { rows: ndaRows } = await query('SELECT * FROM contrato_nda_detalles WHERE contrato_id = $1', [contrato.id]);
      nda = ndaRows[0] || null;
    }
    if (tipoContrato?.es_servicios) {
      const { rows: serviciosRows } = await query('SELECT * FROM contrato_servicios_detalles WHERE contrato_id = $1', [contrato.id]);
      servicios = serviciosRows[0] || null;
    }

    // Ver SQL_FIRMADO arriba: si en cualquier momento del historial de documentos de este
    // contrato hubo uno firmado por Documenso o uno "firmado_manual", se muestra como Firmado.
    const { rows: firmadoRows } = await query(
      `SELECT EXISTS (
         SELECT 1 FROM contrato_documentos fd
         WHERE fd.contrato_id = $1
           AND (fd.documenso_firmado_en IS NOT NULL OR fd.categoria = 'firmado_manual')
       ) AS firmado`,
      [contrato.id]
    );
    const firmado = firmadoRows[0]?.firmado === true;

    res.json({
      contrato: { ...contrato, tipoContrato, firmado },
      aprobaciones,
      documentos: documentosConUrl,
      franquicia,
      contraparteDetalle,
      nda,
      servicios,
    });
  })
);

// ---------------------------------------------------------------------------
// PUT /api/contratos/:id/franquicia - crear/actualizar los datos de franquicia
// (solo aplica si el tipo de contrato está marcado es_franquicia)
// ---------------------------------------------------------------------------
const CAMPOS_FRANQUICIA = [
  'clubId', 'cuotaInicial', 'regaliasPorcentaje', 'fondoMercadeoPorcentaje', 'periodicidadPagoRegalias',
  'fechaProximoPagoRegalias', 'diasAvisoPagoRegalias', 'territorio', 'radioExclusividadKm',
  'direccionPunto', 'fechaLimiteApertura', 'diasAvisoApertura', 'numeroRenovacionesPermitidas',
  'condicionesRenovacion', 'diasAvisoRenovacion', 'fechaProximaAuditoria', 'diasAvisoAuditoria',
  'polizasSeguroRequeridas', 'garantiaPersonal', 'garanteNombre',
];

const MAPA_COLUMNAS_FRANQUICIA = {
  clubId: 'club_id',
  cuotaInicial: 'cuota_inicial',
  regaliasPorcentaje: 'regalias_porcentaje',
  fondoMercadeoPorcentaje: 'fondo_mercadeo_porcentaje',
  periodicidadPagoRegalias: 'periodicidad_pago_regalias',
  fechaProximoPagoRegalias: 'fecha_proximo_pago_regalias',
  diasAvisoPagoRegalias: 'dias_aviso_pago_regalias',
  territorio: 'territorio',
  radioExclusividadKm: 'radio_exclusividad_km',
  direccionPunto: 'direccion_punto',
  fechaLimiteApertura: 'fecha_limite_apertura',
  diasAvisoApertura: 'dias_aviso_apertura',
  numeroRenovacionesPermitidas: 'numero_renovaciones_permitidas',
  condicionesRenovacion: 'condiciones_renovacion',
  diasAvisoRenovacion: 'dias_aviso_renovacion',
  fechaProximaAuditoria: 'fecha_proxima_auditoria',
  diasAvisoAuditoria: 'dias_aviso_auditoria',
  polizasSeguroRequeridas: 'polizas_seguro_requeridas',
  garantiaPersonal: 'garantia_personal',
  garanteNombre: 'garante_nombre',
};

// Cuando se manda una de estas fechas, se re-arma (resetea) el aviso correspondiente para
// que vuelva a notificar si la nueva fecha vuelve a caer dentro de su ventana de aviso.
const CAMPO_FECHA_A_AVISADO = {
  fechaProximoPagoRegalias: 'pago_regalias_avisado',
  fechaLimiteApertura: 'apertura_avisada',
  fechaProximaAuditoria: 'auditoria_avisada',
};

const PERIODICIDADES_VALIDAS = ['mensual', 'trimestral', 'semestral', 'anual'];

router.put(
  '/:id/franquicia',
  requireAuth,
  asyncHandler(async (req, res) => {
    const contrato = await cargarContrato(req.params.id);
    if (!contrato) throw notFound('Contrato no encontrado.');

    const esDueño = contrato.solicitado_por_id === req.usuario.id;
    // El módulo de franquicias lo administran super_admin/admin/juridico por igual, no solo
    // quien creó el borrador (a diferencia del resto de contratos, donde solo admin/super_admin
    // pueden editar lo de otros).
    if (!esRolPrivilegiado(req.usuario.rol)) {
      if (!esDueño) throw forbidden('No puedes editar los datos de franquicia de un contrato que no solicitaste.');
      if (contrato.estatus !== 'borrador') {
        throw forbidden('Solo se pueden editar los datos de franquicia mientras el contrato está en borrador.');
      }
    }

    const { rows: tipoRows } = await query('SELECT * FROM tipos_contrato WHERE id = $1', [contrato.tipo_contrato_id]);
    if (!tipoRows[0]?.es_franquicia) {
      throw badRequest('Este contrato no es de un tipo marcado como franquicia.');
    }

    const body = req.body || {};
    if (body.periodicidadPagoRegalias && !PERIODICIDADES_VALIDAS.includes(body.periodicidadPagoRegalias)) {
      throw badRequest(`periodicidadPagoRegalias inválida. Valores permitidos: ${PERIODICIDADES_VALIDAS.join(', ')}.`);
    }
    for (const campoPorcentaje of ['regaliasPorcentaje', 'fondoMercadeoPorcentaje']) {
      const valor = body[campoPorcentaje];
      if (valor !== undefined && valor !== null && valor !== '') {
        const num = Number(valor);
        if (Number.isNaN(num) || num < 0 || num > 100) {
          throw badRequest(`${campoPorcentaje} debe ser un porcentaje entre 0 y 100.`);
        }
      }
    }

    const columnas = ['contrato_id'];
    const marcadores = ['$1'];
    const valores = [contrato.id];
    const actualizaciones = [];
    let i = 2;

    for (const campo of CAMPOS_FRANQUICIA) {
      if (body[campo] === undefined) continue;
      const columna = MAPA_COLUMNAS_FRANQUICIA[campo];
      const valor = body[campo] === '' ? null : body[campo];
      columnas.push(columna);
      marcadores.push(`$${i}`);
      valores.push(valor);
      actualizaciones.push(`${columna} = $${i}`);
      i++;

      const columnaAvisado = CAMPO_FECHA_A_AVISADO[campo];
      if (columnaAvisado) {
        columnas.push(columnaAvisado);
        marcadores.push(`$${i}`);
        valores.push(false);
        actualizaciones.push(`${columnaAvisado} = $${i}`);
        i++;
      }
    }

    actualizaciones.push('updated_at = now()');

    try {
      const { rows } = await query(
        `INSERT INTO contrato_franquicia_detalles (${columnas.join(', ')})
         VALUES (${marcadores.join(', ')})
         ON CONFLICT (contrato_id) DO UPDATE SET ${actualizaciones.join(', ')}
         RETURNING *`,
        valores
      );

      await registrarAuditoria({
        contratoId: contrato.id,
        usuarioId: req.usuario.id,
        accion: 'franquicia_datos_actualizados',
        detalle: 'Se actualizaron los datos de franquicia del contrato.',
      });

      res.json({ franquicia: rows[0] });
    } catch (err) {
      const traducido = traducirErrorPostgres(err);
      if (traducido) throw traducido;
      throw err;
    }
  })
);

// ---------------------------------------------------------------------------
// PUT /api/contratos/:id/contraparte-detalle - datos ampliados de la contraparte (persona
// física/moral) + administrador interno. Aplica a los tipos marcados es_nda o es_servicios;
// el resto de tipos sigue usando solo los campos planos (contraparte_nombre, contraparte_rfc,
// etc.) que ya vienen en el POST /contratos. Mismo permiso/estado que /franquicia: dueño del
// borrador, o un rol privilegiado en cualquier momento.
// ---------------------------------------------------------------------------
const CAMPOS_CONTRAPARTE_DETALLE = [
  'tipoPersona', 'representanteLegalNombre', 'nacionalidad', 'curp', 'domicilio',
  'administradorInternoNombre',
];
const MAPA_COLUMNAS_CONTRAPARTE_DETALLE = {
  tipoPersona: 'tipo_persona',
  representanteLegalNombre: 'representante_legal_nombre',
  nacionalidad: 'nacionalidad',
  curp: 'curp',
  domicilio: 'domicilio',
  administradorInternoNombre: 'administrador_interno_nombre',
};
const TIPOS_PERSONA_VALIDOS = ['fisica', 'moral'];

function puedeEditarDetalleTipo(contrato, usuario) {
  const esDueño = contrato.solicitado_por_id === usuario.id;
  if (esRolPrivilegiado(usuario.rol)) return true;
  if (!esDueño) throw forbidden('No puedes editar los datos de un contrato que no solicitaste.');
  if (contrato.estatus !== 'borrador') {
    throw forbidden('Solo se pueden editar estos datos mientras el contrato está en borrador.');
  }
  return true;
}

router.put(
  '/:id/contraparte-detalle',
  requireAuth,
  asyncHandler(async (req, res) => {
    const contrato = await cargarContrato(req.params.id);
    if (!contrato) throw notFound('Contrato no encontrado.');
    puedeEditarDetalleTipo(contrato, req.usuario);

    const { rows: tipoRows } = await query('SELECT * FROM tipos_contrato WHERE id = $1', [contrato.tipo_contrato_id]);
    if (!tipoRows[0]?.es_nda && !tipoRows[0]?.es_servicios) {
      throw badRequest('Este contrato no es de un tipo que pida datos ampliados de la contraparte.');
    }

    const body = req.body || {};
    if (body.tipoPersona && !TIPOS_PERSONA_VALIDOS.includes(body.tipoPersona)) {
      throw badRequest(`tipoPersona inválido. Valores permitidos: ${TIPOS_PERSONA_VALIDOS.join(', ')}.`);
    }

    const columnas = ['contrato_id'];
    const marcadores = ['$1'];
    const valores = [contrato.id];
    const actualizaciones = [];
    let i = 2;

    for (const campo of CAMPOS_CONTRAPARTE_DETALLE) {
      if (body[campo] === undefined) continue;
      const columna = MAPA_COLUMNAS_CONTRAPARTE_DETALLE[campo];
      const valor = body[campo] === '' ? null : body[campo];
      columnas.push(columna);
      marcadores.push(`$${i}`);
      valores.push(valor);
      actualizaciones.push(`${columna} = $${i}`);
      i++;
    }
    actualizaciones.push('updated_at = now()');

    try {
      const { rows } = await query(
        `INSERT INTO contrato_contraparte_detalles (${columnas.join(', ')})
         VALUES (${marcadores.join(', ')})
         ON CONFLICT (contrato_id) DO UPDATE SET ${actualizaciones.join(', ')}
         RETURNING *`,
        valores
      );
      await registrarAuditoria({
        contratoId: contrato.id,
        usuarioId: req.usuario.id,
        accion: 'contraparte_detalle_actualizado',
        detalle: 'Se actualizaron los datos ampliados de la contraparte del contrato.',
      });
      res.json({ contraparteDetalle: rows[0] });
    } catch (err) {
      const traducido = traducirErrorPostgres(err);
      if (traducido) throw traducido;
      throw err;
    }
  })
);

// ---------------------------------------------------------------------------
// PUT /api/contratos/:id/nda - datos propios de la solicitud de NDA (solo tipos es_nda).
// ---------------------------------------------------------------------------
const CAMPOS_NDA = ['descripcionProyecto', 'tipoInformacion', 'fechaFirma', 'comentarios'];
const MAPA_COLUMNAS_NDA = {
  descripcionProyecto: 'descripcion_proyecto',
  tipoInformacion: 'tipo_informacion',
  fechaFirma: 'fecha_firma',
  comentarios: 'comentarios',
};

router.put(
  '/:id/nda',
  requireAuth,
  asyncHandler(async (req, res) => {
    const contrato = await cargarContrato(req.params.id);
    if (!contrato) throw notFound('Contrato no encontrado.');
    puedeEditarDetalleTipo(contrato, req.usuario);

    const { rows: tipoRows } = await query('SELECT * FROM tipos_contrato WHERE id = $1', [contrato.tipo_contrato_id]);
    if (!tipoRows[0]?.es_nda) {
      throw badRequest('Este contrato no es de un tipo marcado como NDA.');
    }

    const body = req.body || {};
    const columnas = ['contrato_id'];
    const marcadores = ['$1'];
    const valores = [contrato.id];
    const actualizaciones = [];
    let i = 2;

    for (const campo of CAMPOS_NDA) {
      if (body[campo] === undefined) continue;
      const columna = MAPA_COLUMNAS_NDA[campo];
      const valor = body[campo] === '' ? null : body[campo];
      columnas.push(columna);
      marcadores.push(`$${i}`);
      valores.push(valor);
      actualizaciones.push(`${columna} = $${i}`);
      i++;
    }
    actualizaciones.push('updated_at = now()');

    try {
      const { rows } = await query(
        `INSERT INTO contrato_nda_detalles (${columnas.join(', ')})
         VALUES (${marcadores.join(', ')})
         ON CONFLICT (contrato_id) DO UPDATE SET ${actualizaciones.join(', ')}
         RETURNING *`,
        valores
      );
      await registrarAuditoria({
        contratoId: contrato.id,
        usuarioId: req.usuario.id,
        accion: 'nda_datos_actualizados',
        detalle: 'Se actualizaron los datos de la solicitud de NDA.',
      });
      res.json({ nda: rows[0] });
    } catch (err) {
      const traducido = traducirErrorPostgres(err);
      if (traducido) throw traducido;
      throw err;
    }
  })
);

// ---------------------------------------------------------------------------
// PUT /api/contratos/:id/servicios - datos propios de la solicitud de prestación de
// servicios (solo tipos es_servicios). Cuando lugarPrestacion = 'instalaciones_fpt' se
// vuelve "servicios especializados" y se exigen lugarExacto/repse/registroPatronal/
// numeroTrabajadores.
// ---------------------------------------------------------------------------
const CAMPOS_SERVICIOS = [
  'descripcionServicios', 'actividadesPrestador', 'cronograma', 'lugarPrestacion',
  'lugarExacto', 'repse', 'registroPatronal', 'numeroTrabajadores', 'incluyeIva',
  'condicionesPago', 'garantias', 'fechaFirma',
];
const MAPA_COLUMNAS_SERVICIOS = {
  descripcionServicios: 'descripcion_servicios',
  actividadesPrestador: 'actividades_prestador',
  cronograma: 'cronograma',
  lugarPrestacion: 'lugar_prestacion',
  lugarExacto: 'lugar_exacto',
  repse: 'repse',
  registroPatronal: 'registro_patronal',
  numeroTrabajadores: 'numero_trabajadores',
  incluyeIva: 'incluye_iva',
  condicionesPago: 'condiciones_pago',
  garantias: 'garantias',
  fechaFirma: 'fecha_firma',
};
const LUGARES_PRESTACION_VALIDOS = ['instalaciones_proveedor', 'remoto', 'ubicacion_terceros', 'instalaciones_fpt'];
const CAMPOS_SOLO_SERVICIOS_ESPECIALIZADOS = ['lugarExacto', 'repse', 'registroPatronal', 'numeroTrabajadores'];

router.put(
  '/:id/servicios',
  requireAuth,
  asyncHandler(async (req, res) => {
    const contrato = await cargarContrato(req.params.id);
    if (!contrato) throw notFound('Contrato no encontrado.');
    puedeEditarDetalleTipo(contrato, req.usuario);

    const { rows: tipoRows } = await query('SELECT * FROM tipos_contrato WHERE id = $1', [contrato.tipo_contrato_id]);
    if (!tipoRows[0]?.es_servicios) {
      throw badRequest('Este contrato no es de un tipo marcado como prestación de servicios.');
    }

    const body = req.body || {};
    if (body.lugarPrestacion && !LUGARES_PRESTACION_VALIDOS.includes(body.lugarPrestacion)) {
      throw badRequest(`lugarPrestacion inválido. Valores permitidos: ${LUGARES_PRESTACION_VALIDOS.join(', ')}.`);
    }

    // Se calcula contra lo que ya está guardado + lo que llega en este PUT, para no exigir
    // reenviar todo el bloque de "servicios especializados" cada vez que se actualiza un solo campo.
    const { rows: actualRows } = await query(
      'SELECT * FROM contrato_servicios_detalles WHERE contrato_id = $1',
      [contrato.id]
    );
    const actual = actualRows[0] || {};
    const lugarResultante = body.lugarPrestacion !== undefined ? body.lugarPrestacion : actual.lugar_prestacion;
    if (lugarResultante === 'instalaciones_fpt') {
      for (const campo of CAMPOS_SOLO_SERVICIOS_ESPECIALIZADOS) {
        const columna = MAPA_COLUMNAS_SERVICIOS[campo];
        const valorNuevo = body[campo];
        const valorResultante = valorNuevo !== undefined ? valorNuevo : actual[columna];
        if (valorResultante === undefined || valorResultante === null || valorResultante === '') {
          throw badRequest(
            `${campo} es obligatorio cuando los servicios se prestan en las instalaciones de FPT (servicios especializados).`
          );
        }
      }
    }
    if (body.numeroTrabajadores !== undefined && body.numeroTrabajadores !== null && body.numeroTrabajadores !== '') {
      const num = Number(body.numeroTrabajadores);
      if (!Number.isInteger(num) || num < 0) {
        throw badRequest('numeroTrabajadores debe ser un número entero válido.');
      }
    }

    const columnas = ['contrato_id'];
    const marcadores = ['$1'];
    const valores = [contrato.id];
    const actualizaciones = [];
    let i = 2;

    for (const campo of CAMPOS_SERVICIOS) {
      if (body[campo] === undefined) continue;
      const columna = MAPA_COLUMNAS_SERVICIOS[campo];
      const valor = body[campo] === '' ? null : body[campo];
      columnas.push(columna);
      marcadores.push(`$${i}`);
      valores.push(valor);
      actualizaciones.push(`${columna} = $${i}`);
      i++;
    }
    actualizaciones.push('updated_at = now()');

    try {
      const { rows } = await query(
        `INSERT INTO contrato_servicios_detalles (${columnas.join(', ')})
         VALUES (${marcadores.join(', ')})
         ON CONFLICT (contrato_id) DO UPDATE SET ${actualizaciones.join(', ')}
         RETURNING *`,
        valores
      );
      await registrarAuditoria({
        contratoId: contrato.id,
        usuarioId: req.usuario.id,
        accion: 'servicios_datos_actualizados',
        detalle: 'Se actualizaron los datos de la solicitud de prestación de servicios.',
      });
      res.json({ servicios: rows[0] });
    } catch (err) {
      const traducido = traducirErrorPostgres(err);
      if (traducido) throw traducido;
      throw err;
    }
  })
);

// ---------------------------------------------------------------------------
// PATCH /api/contratos/:id - editar metadata (solo borrador, o admin/super_admin)
// ---------------------------------------------------------------------------
router.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const contrato = await cargarContrato(req.params.id);
    if (!contrato) throw notFound('Contrato no encontrado.');

    const esDueño = contrato.solicitado_por_id === req.usuario.id;
    const esAdmin = ['super_admin', 'admin'].includes(req.usuario.rol);
    if (!esAdmin) {
      if (!esDueño) throw forbidden('No puedes editar un contrato que no solicitaste.');
      if (contrato.estatus !== 'borrador') {
        throw forbidden('Solo se puede editar un contrato mientras está en borrador.');
      }
    }

    const campos = [];
    const valores = [];
    let i = 1;
    for (const campo of CAMPOS_EDITABLES) {
      if (req.body[campo] !== undefined) {
        campos.push(`${MAPA_COLUMNAS[campo]} = $${i++}`);
        valores.push(req.body[campo]);
      }
    }
    if (campos.length === 0) throw badRequest('No se envió ningún campo editable.');
    campos.push('updated_at = now()');
    valores.push(contrato.id);

    try {
      const { rows } = await query(
        `UPDATE contratos SET ${campos.join(', ')} WHERE id = $${i} RETURNING *`,
        valores
      );
      res.json({ contrato: rows[0] });
    } catch (err) {
      const traducido = traducirErrorPostgres(err);
      if (traducido) throw traducido;
      throw err;
    }
  })
);

// ---------------------------------------------------------------------------
// POST /api/contratos/:id/enviar-autorizacion
// ---------------------------------------------------------------------------
router.post(
  '/:id/enviar-autorizacion',
  requireAuth,
  asyncHandler(async (req, res) => {
    const contrato = await cargarContrato(req.params.id);
    if (!contrato) throw notFound('Contrato no encontrado.');

    const esDueño = contrato.solicitado_por_id === req.usuario.id;
    const esAdmin = ['super_admin', 'admin'].includes(req.usuario.rol);
    if (!esDueño && !esAdmin) {
      throw forbidden('No puedes enviar a autorización un contrato que no solicitaste.');
    }
    if (contrato.estatus !== 'borrador') {
      throw conflict(`El contrato debe estar en estatus 'borrador' para enviarse a autorización (estatus actual: ${contrato.estatus}).`);
    }

    const resultado = await withTransaction(async (client) => {
      const plantilla = await resolverPlantillaAplicable(client, contrato.tipo_contrato_id);
      if (!plantilla) {
        throw badRequest('No hay una plantilla de flujo aplicable (ni específica del tipo de contrato ni default activa).');
      }

      const { primerOrdenPendiente } = await generarAprobaciones(client, contrato, plantilla);
      if (primerOrdenPendiente === null) {
        throw badRequest('Todos los pasos del flujo fueron omitidos por monto; no hay a quién enviar. Revisa la configuración de la plantilla.');
      }

      const { rows } = await client.query(
        `UPDATE contratos
         SET estatus = 'en_autorizacion', plantilla_flujo_id = $1, paso_actual_orden = $2, updated_at = now()
         WHERE id = $3 RETURNING *`,
        [plantilla.id, primerOrdenPendiente, contrato.id]
      );

      await registrarAuditoria({
        contratoId: contrato.id,
        usuarioId: req.usuario.id,
        accion: 'enviado_a_autorizacion',
        detalle: `Plantilla "${plantilla.nombre}" aplicada. Primer paso pendiente: ${primerOrdenPendiente}.`,
        db: client,
      });

      const { rows: pasoActualRows } = await client.query(
        'SELECT * FROM contrato_aprobaciones WHERE contrato_id = $1 AND orden = $2',
        [contrato.id, primerOrdenPendiente]
      );

      return { contrato: rows[0], pasoActual: pasoActualRows[0] };
    });

    // Mantiene al día la columna "EstatusContrato" en SharePoint (si el contrato ya tiene
    // documentos subidos). Nunca debe tumbar el flujo si falla.
    await sincronizarEstatusEnDocumentos(resultado.contrato.id, resultado.contrato.estatus);

    // Notificación por correo fuera de la transacción (no debe hacer rollback si falla).
    try {
      const destinatarios = await destinatariosDePaso({ query }, resultado.pasoActual);
      if (destinatarios.length > 0) {
        await enviarCorreo(
          destinatarios.join(','),
          `Contrato ${resultado.contrato.folio} pendiente de tu autorización`,
          `<p>El contrato <b>${resultado.contrato.folio} - ${resultado.contrato.titulo}</b> requiere tu autorización en el paso "${resultado.pasoActual.nombre_paso}".</p>`
        );
      }
    } catch (err) {
      console.error('Error notificando al aprobador del primer paso:', err);
    }

    res.json(resultado);
  })
);

// ---------------------------------------------------------------------------
// POST /api/contratos/:id/aprobaciones/:aprobacionId/decidir
// ---------------------------------------------------------------------------
router.post(
  '/:id/aprobaciones/:aprobacionId/decidir',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { decision, comentarios } = req.body || {};
    if (!['aprobado', 'rechazado'].includes(decision)) {
      throw badRequest("decision debe ser 'aprobado' o 'rechazado'.");
    }

    const resultado = await withTransaction(async (client) => {
      const { rows: contratoRows } = await client.query(
        'SELECT * FROM contratos WHERE id = $1 FOR UPDATE',
        [req.params.id]
      );
      const contrato = contratoRows[0];
      if (!contrato) throw notFound('Contrato no encontrado.');

      const { rows: aprobacionRows } = await client.query(
        'SELECT * FROM contrato_aprobaciones WHERE id = $1 AND contrato_id = $2',
        [req.params.aprobacionId, contrato.id]
      );
      const aprobacion = aprobacionRows[0];
      if (!aprobacion) throw notFound('Aprobación no encontrada.');

      if (contrato.estatus !== 'en_autorizacion') {
        throw conflict(`El contrato no está en autorización (estatus actual: ${contrato.estatus}).`);
      }
      if (aprobacion.decision !== 'pendiente' || aprobacion.orden !== contrato.paso_actual_orden) {
        throw conflict('Esta aprobación ya no es el paso pendiente actual del contrato.');
      }

      const autorizado =
        aprobacion.aprobador_id === req.usuario.id || aprobacion.rol_requerido === req.usuario.rol;
      if (!autorizado) {
        throw forbidden('No eres el aprobador asignado a este paso.');
      }

      await client.query(
        `UPDATE contrato_aprobaciones
         SET decision = $1, comentarios = $2, decidido_at = now()
         WHERE id = $3`,
        [decision, comentarios || null, aprobacion.id]
      );

      await registrarAuditoria({
        contratoId: contrato.id,
        usuarioId: req.usuario.id,
        accion: decision === 'aprobado' ? 'paso_aprobado' : 'paso_rechazado',
        detalle: `Paso "${aprobacion.nombre_paso}" (orden ${aprobacion.orden}). Comentarios: ${comentarios || '(sin comentarios)'}`,
        db: client,
      });

      let contratoActualizado;
      let notificacion = null;

      if (decision === 'rechazado') {
        const { rows } = await client.query(
          `UPDATE contratos SET estatus = 'rechazado', paso_actual_orden = NULL, updated_at = now()
           WHERE id = $1 RETURNING *`,
          [contrato.id]
        );
        contratoActualizado = rows[0];
        await registrarAuditoria({
          contratoId: contrato.id,
          usuarioId: req.usuario.id,
          accion: 'contrato_rechazado',
          detalle: `Rechazado en el paso "${aprobacion.nombre_paso}".`,
          db: client,
        });
        notificacion = { tipo: 'rechazado', destinatarioId: contrato.solicitado_por_id };
      } else {
        const siguiente = await siguienteOrdenPendiente(client, contrato.id, aprobacion.orden);
        if (siguiente !== null) {
          const { rows } = await client.query(
            `UPDATE contratos SET paso_actual_orden = $1, updated_at = now() WHERE id = $2 RETURNING *`,
            [siguiente, contrato.id]
          );
          contratoActualizado = rows[0];
          const { rows: pasoRows } = await client.query(
            'SELECT * FROM contrato_aprobaciones WHERE contrato_id = $1 AND orden = $2',
            [contrato.id, siguiente]
          );
          notificacion = { tipo: 'siguiente_paso', paso: pasoRows[0] };
        } else {
          // Último paso aprobado: el contrato queda autorizado y pasa automáticamente a activo.
          // Esto ES la creación del "expediente": el propio contrato ya autorizado se
          // convierte en el objeto donde se administran documentos y metadatos.
          const { rows } = await client.query(
            `UPDATE contratos SET estatus = 'activo', paso_actual_orden = NULL, updated_at = now()
             WHERE id = $1 RETURNING *`,
            [contrato.id]
          );
          contratoActualizado = rows[0];
          await registrarAuditoria({
            contratoId: contrato.id,
            usuarioId: req.usuario.id,
            accion: 'contrato_autorizado_y_activado',
            detalle: 'Todos los pasos del flujo fueron aprobados. El contrato es ahora el expediente activo.',
            db: client,
          });
          notificacion = { tipo: 'activado', destinatarioId: contrato.solicitado_por_id };
        }
      }

      return { contrato: contratoActualizado, aprobacion: { ...aprobacion, decision, comentarios }, notificacion };
    });

    // Mantiene al día la columna "EstatusContrato" en SharePoint (rechazado/activo cambian
    // el estatus del contrato; en un paso intermedio queda igual, y volver a escribir el
    // mismo valor no hace daño). Nunca debe tumbar el flujo si falla.
    await sincronizarEstatusEnDocumentos(resultado.contrato.id, resultado.contrato.estatus);

    // Notificaciones por correo, fuera de la transacción.
    try {
      if (resultado.notificacion?.tipo === 'siguiente_paso') {
        const destinatarios = await destinatariosDePaso({ query }, resultado.notificacion.paso);
        if (destinatarios.length > 0) {
          await enviarCorreo(
            destinatarios.join(','),
            `Contrato ${resultado.contrato.folio} pendiente de tu autorización`,
            `<p>El contrato <b>${resultado.contrato.folio} - ${resultado.contrato.titulo}</b> requiere tu autorización en el paso "${resultado.notificacion.paso.nombre_paso}".</p>`
          );
        }
      } else if (resultado.notificacion?.tipo === 'rechazado' || resultado.notificacion?.tipo === 'activado') {
        const { rows } = await query('SELECT email FROM usuarios WHERE id = $1', [resultado.notificacion.destinatarioId]);
        const solicitanteEmail = rows[0]?.email;
        if (solicitanteEmail) {
          const esRechazo = resultado.notificacion.tipo === 'rechazado';
          await enviarCorreo(
            solicitanteEmail,
            `Contrato ${resultado.contrato.folio} ${esRechazo ? 'rechazado' : 'autorizado y activado'}`,
            esRechazo
              ? `<p>Tu contrato <b>${resultado.contrato.folio} - ${resultado.contrato.titulo}</b> fue rechazado. Comentarios: ${comentarios || '(sin comentarios)'}</p>`
              : `<p>Tu contrato <b>${resultado.contrato.folio} - ${resultado.contrato.titulo}</b> fue autorizado en su totalidad y ahora está activo. Ya puedes administrar sus documentos y datos en su expediente.</p>`
          );
        }
      }
    } catch (err) {
      console.error('Error enviando notificación de decisión de aprobación:', err);
    }

    res.json({ contrato: resultado.contrato, aprobacion: resultado.aprobacion });
  })
);

// ---------------------------------------------------------------------------
// Cancelación
// ---------------------------------------------------------------------------
const ESTATUS_SOLICITUD = ['borrador', 'en_revision', 'en_autorizacion'];
const ESTATUS_VIGENTE = ['autorizado', 'activo', 'por_vencer'];

// POST /api/contratos/:id/cancelar-solicitud - cancela una solicitud que todavía no es un
// contrato vigente (borrador, en revisión, o en autorización). Solo quien la levantó (o un rol
// privilegiado) puede hacerlo; el motivo es opcional, a diferencia de cancelar un contrato ya
// vigente (ver /cancelar-contrato más abajo).
router.post(
  '/:id/cancelar-solicitud',
  requireAuth,
  asyncHandler(async (req, res) => {
    const contrato = await cargarContrato(req.params.id);
    if (!contrato) throw notFound('Contrato no encontrado.');

    const esDueño = contrato.solicitado_por_id === req.usuario.id;
    if (!esRolPrivilegiado(req.usuario.rol) && !esDueño) {
      throw forbidden('Solo quien levantó esta solicitud (o un administrador) puede cancelarla.');
    }
    if (!ESTATUS_SOLICITUD.includes(contrato.estatus)) {
      throw conflict(
        `Esta solicitud ya no se puede cancelar así (estatus actual: ${contrato.estatus}). ` +
          `Si ya es un contrato vigente, usa "Cancelar contrato" en su lugar.`
      );
    }

    const motivo = (req.body || {}).motivo || null;
    const { rows } = await query(
      `UPDATE contratos
       SET estatus = 'cancelado', paso_actual_orden = NULL, cancelado_en = now(),
           cancelado_por_id = $1, motivo_cancelacion = $2, updated_at = now()
       WHERE id = $3 RETURNING *`,
      [req.usuario.id, motivo, contrato.id]
    );
    const actualizado = rows[0];

    await registrarAuditoria({
      contratoId: contrato.id,
      usuarioId: req.usuario.id,
      accion: 'solicitud_cancelada',
      detalle: `Solicitud cancelada. Motivo: ${motivo || '(sin motivo)'}`,
    });
    await sincronizarEstatusEnDocumentos(actualizado.id, actualizado.estatus);

    try {
      if (!esDueño) {
        const { rows: solicitanteRows } = await query('SELECT email FROM usuarios WHERE id = $1', [contrato.solicitado_por_id]);
        const email = solicitanteRows[0]?.email;
        if (email) {
          await enviarCorreo(
            email,
            `Tu solicitud ${actualizado.folio} fue cancelada`,
            `<p>Tu solicitud <b>${actualizado.folio} - ${actualizado.titulo}</b> fue cancelada.` +
              (motivo ? ` Motivo: ${motivo}` : '') +
              `</p>`
          );
        }
      }
    } catch (err) {
      console.error('Error enviando notificación de solicitud cancelada:', err);
    }

    res.json({ contrato: actualizado });
  })
);

// POST /api/contratos/:id/cancelar-contrato - cancela un contrato ya vigente/activo (autorizado,
// activo o por vencer). A diferencia de cancelar una solicitud, esto SOLO lo puede hacer jurídico
// (pidió el usuario expresamente: "esto únicamente lo puede hacer jurídico"), y el motivo es
// obligatorio — es la única constancia de por qué se dio de baja un contrato que ya estaba en
// operación.
router.post(
  '/:id/cancelar-contrato',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.usuario.rol !== 'juridico') {
      throw forbidden('Solo jurídico puede cancelar un contrato vigente.');
    }
    const contrato = await cargarContrato(req.params.id);
    if (!contrato) throw notFound('Contrato no encontrado.');

    if (!ESTATUS_VIGENTE.includes(contrato.estatus)) {
      throw conflict(`Este contrato no está vigente/activo (estatus actual: ${contrato.estatus}).`);
    }

    const motivo = ((req.body || {}).motivo || '').trim();
    if (!motivo) {
      throw badRequest('El motivo de cancelación es obligatorio.');
    }

    const { rows } = await query(
      `UPDATE contratos
       SET estatus = 'cancelado', paso_actual_orden = NULL, cancelado_en = now(),
           cancelado_por_id = $1, motivo_cancelacion = $2, updated_at = now()
       WHERE id = $3 RETURNING *`,
      [req.usuario.id, motivo, contrato.id]
    );
    const actualizado = rows[0];

    await registrarAuditoria({
      contratoId: contrato.id,
      usuarioId: req.usuario.id,
      accion: 'contrato_cancelado',
      detalle: `Contrato vigente cancelado por jurídico. Motivo: ${motivo}`,
    });
    await sincronizarEstatusEnDocumentos(actualizado.id, actualizado.estatus);

    try {
      const { rows: solicitanteRows } = await query('SELECT email FROM usuarios WHERE id = $1', [contrato.solicitado_por_id]);
      const email = solicitanteRows[0]?.email;
      if (email) {
        await enviarCorreo(
          email,
          `Contrato ${actualizado.folio} cancelado`,
          `<p>Tu contrato <b>${actualizado.folio} - ${actualizado.titulo}</b>, que ya estaba vigente, fue cancelado por jurídico.</p>` +
            `<p>Motivo: ${motivo}</p>`
        );
      }
    } catch (err) {
      console.error('Error enviando notificación de contrato cancelado:', err);
    }

    res.json({ contrato: actualizado });
  })
);

// ---------------------------------------------------------------------------
// Documentos anidados bajo contrato
// ---------------------------------------------------------------------------

// POST /api/contratos/:id/documentos (multipart)
// Campo opcional "grupoId": si se manda y corresponde a un documento vigente de este mismo
// contrato, el archivo se guarda como una NUEVA VERSIÓN de ese documento (mismo grupo_id,
// version = anterior + 1) y la versión anterior deja de ser la vigente. Si se omite, el
// archivo arranca un documento nuevo (grupo propio, v1).
router.post(
  '/:id/documentos',
  requireAuth,
  upload.single('archivo'),
  asyncHandler(async (req, res) => {
    const contrato = await cargarContrato(req.params.id);
    if (!contrato) throw notFound('Contrato no encontrado.');
    if (!req.file) throw badRequest('Falta el archivo (campo multipart "archivo").');

    const categoriasValidas = ['borrador', 'version_firmada', 'anexo', 'evidencia', 'otro', 'firmado_manual'];
    const categoria = req.body.categoria || 'otro';
    if (!categoriasValidas.includes(categoria)) {
      throw badRequest(`categoria inválida. Valores permitidos: ${categoriasValidas.join(', ')}.`);
    }
    // "Documento firmado manual": para contratos con firma física (no vía Documenso). A
    // diferencia de "version_firmada" (que cualquiera con acceso al expediente puede marcar, sin
    // que eso pruebe nada por sí solo), esta categoría es una atestación de que jurídico ya
    // verificó las firmas físicas — por eso solo jurídico puede subirla. También cuenta para que
    // el contrato se muestre como "Firmado" en Contratos vigentes (ver GET /contratos más abajo).
    if (categoria === 'firmado_manual' && req.usuario.rol !== 'juridico') {
      throw forbidden('Solo jurídico puede adjuntar un documento firmado manual.');
    }
    // Etiqueta libre para el checklist de documentos con nombre específico que piden NDA y
    // servicios (ej. "escritura_constitutiva", "repse"; ver DOCUMENTOS_REQUERIDOS en
    // frontend/src/components/ContratoForm.jsx). No aplica a un enum en BD: null = documento
    // genérico, el comportamiento de siempre.
    const etiqueta = req.body.etiqueta || null;

    const grupoIdSolicitado = req.body.grupoId || null;
    let anterior = null;
    if (grupoIdSolicitado) {
      const { rows: anteriorRows } = await query(
        `SELECT * FROM contrato_documentos WHERE grupo_id = $1 AND contrato_id = $2 AND es_version_actual = true`,
        [grupoIdSolicitado, contrato.id]
      );
      anterior = anteriorRows[0];
      if (!anterior) {
        throw badRequest('El documento indicado para nueva versión no existe o no pertenece a este contrato.');
      }
    }

    // El nombre del tipo de contrato solo se necesita para la estructura de carpetas cuando
    // el driver activo es SharePoint (ver storageContratos.js); con el driver local se ignora.
    const { rows: tipoRowsDoc } = await query('SELECT nombre FROM tipos_contrato WHERE id = $1', [contrato.tipo_contrato_id]);
    const rutaArchivo = await storageContratos.save({
      buffer: req.file.buffer,
      originalname: req.file.originalname,
      contratoId: contrato.id,
      tipoContratoNombre: tipoRowsDoc[0]?.nombre,
      folio: contrato.folio,
      tituloContrato: contrato.titulo,
      contraparteNombre: contrato.contraparte_nombre,
      estatusLabel: estatusLabel(contrato.estatus),
    });

    try {
      const documento = await withTransaction(async (client) => {
        if (anterior) {
          await client.query(
            `UPDATE contrato_documentos SET es_version_actual = false WHERE id = $1`,
            [anterior.id]
          );
          const { rows } = await client.query(
            `INSERT INTO contrato_documentos
               (contrato_id, nombre_archivo, ruta_archivo, categoria, subido_por_id, grupo_id, version, reemplaza_a_id, es_version_actual, etiqueta)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9) RETURNING *`,
            [contrato.id, req.file.originalname, rutaArchivo, categoria, req.usuario.id, anterior.grupo_id, anterior.version + 1, anterior.id, etiqueta]
          );
          return rows[0];
        }
        const { rows } = await client.query(
          `INSERT INTO contrato_documentos (contrato_id, nombre_archivo, ruta_archivo, categoria, subido_por_id, grupo_id, version, etiqueta)
           VALUES ($1, $2, $3, $4, $5, gen_random_uuid(), 1, $6) RETURNING *`,
          [contrato.id, req.file.originalname, rutaArchivo, categoria, req.usuario.id, etiqueta]
        );
        return rows[0];
      });

      await registrarAuditoria({
        contratoId: contrato.id,
        usuarioId: req.usuario.id,
        accion: 'documento_subido',
        detalle: anterior
          ? `Archivo "${req.file.originalname}" (categoría ${categoria}), versión ${documento.version} de "${anterior.nombre_archivo}".`
          : `Archivo "${req.file.originalname}" (categoría ${categoria}).`,
      });
      res.status(201).json({ documento: { ...documento, url: storageContratos.getUrl(documento.ruta_archivo) } });
    } catch (err) {
      await storageContratos.delete(rutaArchivo).catch(() => {});
      const traducido = traducirErrorPostgres(err);
      if (traducido) throw traducido;
      throw err;
    }
  })
);

// GET /api/contratos/:id/documentos - solo la versión vigente de cada documento
router.get(
  '/:id/documentos',
  requireAuth,
  asyncHandler(async (req, res) => {
    const contrato = await cargarContrato(req.params.id);
    if (!contrato) throw notFound('Contrato no encontrado.');
    const { rows } = await query(
      `SELECT d.*, u.nombre AS subido_por_nombre,
              (SELECT COUNT(*) FROM contrato_documentos d2 WHERE d2.grupo_id = d.grupo_id)::int AS total_versiones
       FROM contrato_documentos d
       LEFT JOIN usuarios u ON u.id = d.subido_por_id
       WHERE d.contrato_id = $1 AND d.es_version_actual = true
       ORDER BY d.created_at DESC`,
      [contrato.id]
    );
    res.json({ documentos: rows.map((d) => ({ ...d, url: storageContratos.getUrl(d.ruta_archivo) })) });
  })
);

// GET /api/contratos/:id/documentos/grupo/:grupoId - historial completo de versiones de un documento
router.get(
  '/:id/documentos/grupo/:grupoId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const contrato = await cargarContrato(req.params.id);
    if (!contrato) throw notFound('Contrato no encontrado.');
    const { rows } = await query(
      `SELECT d.*, u.nombre AS subido_por_nombre
       FROM contrato_documentos d
       LEFT JOIN usuarios u ON u.id = d.subido_por_id
       WHERE d.contrato_id = $1 AND d.grupo_id = $2
       ORDER BY d.version DESC`,
      [contrato.id, req.params.grupoId]
    );
    if (rows.length === 0) throw notFound('Documento no encontrado.');
    res.json({ versiones: rows.map((d) => ({ ...d, url: storageContratos.getUrl(d.ruta_archivo) })) });
  })
);

// POST /api/contratos/:id/generar-documento - puebla la plantilla del tipo de contrato con
// los datos capturados y agrega el resultado al expediente (nueva versión si ya se había
// generado antes desde plantilla para este contrato; documento nuevo si es la primera vez).
router.post(
  '/:id/generar-documento',
  requireAuth,
  asyncHandler(async (req, res) => {
    const contrato = await cargarContrato(req.params.id);
    if (!contrato) throw notFound('Contrato no encontrado.');

    const { rows: tipoRows } = await query('SELECT * FROM tipos_contrato WHERE id = $1', [contrato.tipo_contrato_id]);
    const tipoContrato = tipoRows[0];
    const { rows: plantillaRows } = await query(
      'SELECT * FROM plantillas_tipo_contrato WHERE tipo_contrato_id = $1',
      [contrato.tipo_contrato_id]
    );
    const plantilla = plantillaRows[0];
    if (!plantilla) {
      throw badRequest('Este tipo de contrato no tiene una plantilla configurada. Súbela desde Administración → Tipos de contrato.');
    }

    let franquicia = null;
    if (tipoContrato?.es_franquicia) {
      const { rows: franquiciaRows } = await query(
        'SELECT * FROM contrato_franquicia_detalles WHERE contrato_id = $1',
        [contrato.id]
      );
      franquicia = franquiciaRows[0] || null;
    }

    const bufferPlantilla = await fs.promises.readFile(storage.absolutePath(plantilla.ruta_archivo));
    const datos = datosParaPlantilla({ contrato, tipoContrato, franquicia });
    const bufferGenerado = renderizarPlantilla(bufferPlantilla, datos);

    const nombreSeguro = `${contrato.folio} - ${tipoContrato.nombre}`.replace(/[\\/:*?"<>|]/g, '-');
    const rutaArchivo = await storageContratos.save({
      buffer: bufferGenerado,
      originalname: `${nombreSeguro}.docx`,
      contratoId: contrato.id,
      tipoContratoNombre: tipoContrato.nombre,
      folio: contrato.folio,
      tituloContrato: contrato.titulo,
      contraparteNombre: contrato.contraparte_nombre,
      estatusLabel: estatusLabel(contrato.estatus),
    });

    try {
      const documento = await withTransaction(async (client) => {
        const { rows: anteriorRows } = await client.query(
          `SELECT * FROM contrato_documentos
           WHERE contrato_id = $1 AND origen = 'plantilla' AND es_version_actual = true`,
          [contrato.id]
        );
        const anterior = anteriorRows[0];

        if (anterior) {
          await client.query('UPDATE contrato_documentos SET es_version_actual = false WHERE id = $1', [anterior.id]);
          const { rows } = await client.query(
            `INSERT INTO contrato_documentos
               (contrato_id, nombre_archivo, ruta_archivo, categoria, subido_por_id, grupo_id, version, reemplaza_a_id, es_version_actual, origen)
             VALUES ($1, $2, $3, 'borrador', $4, $5, $6, $7, true, 'plantilla') RETURNING *`,
            [contrato.id, `${nombreSeguro}.docx`, rutaArchivo, req.usuario.id, anterior.grupo_id, anterior.version + 1, anterior.id]
          );
          return rows[0];
        }

        const { rows } = await client.query(
          `INSERT INTO contrato_documentos
             (contrato_id, nombre_archivo, ruta_archivo, categoria, subido_por_id, grupo_id, version, origen)
           VALUES ($1, $2, $3, 'borrador', $4, gen_random_uuid(), 1, 'plantilla') RETURNING *`,
          [contrato.id, `${nombreSeguro}.docx`, rutaArchivo, req.usuario.id]
        );
        return rows[0];
      });

      await registrarAuditoria({
        contratoId: contrato.id,
        usuarioId: req.usuario.id,
        accion: 'documento_generado_plantilla',
        detalle: `Documento generado desde la plantilla de "${tipoContrato.nombre}" (versión ${documento.version}).`,
      });
      res.status(201).json({ documento: { ...documento, url: storageContratos.getUrl(documento.ruta_archivo) } });
    } catch (err) {
      await storageContratos.delete(rutaArchivo).catch(() => {});
      const traducido = traducirErrorPostgres(err);
      if (traducido) throw traducido;
      throw err;
    }
  })
);

// ---------------------------------------------------------------------------
// Firma electrónica (Documenso — self-hosted; ver backend/src/documensoClient.js)
// ---------------------------------------------------------------------------

// GET /api/contratos/:id/documentos/:documentoId/pdf-para-firma
// Bytes crudos (application/pdf) de la versión VIGENTE del documento, usados por el editor
// visual de EnviarAFirmarModal.jsx (pdfjs-dist) para dibujar el PDF y que el usuario arrastre el
// recuadro de firma. Se sirve por este endpoint autenticado (en vez del <a href={doc.url}> normal
// de "Ver") porque doc.url no siempre es descargable sin sesión propia del navegador (p. ej. un
// documento en SharePoint requiere el login de Microsoft del usuario) — aquí se usa
// storageContratos.obtenerBuffer(), que ya sabe leer de cualquier backend de almacenamiento.
router.get(
  '/:id/documentos/:documentoId/pdf-para-firma',
  requireAuth,
  asyncHandler(async (req, res) => {
    const contrato = await cargarContrato(req.params.id);
    if (!contrato) throw notFound('Contrato no encontrado.');

    const esDueño = contrato.solicitado_por_id === req.usuario.id;
    if (!esRolPrivilegiado(req.usuario.rol) && !esDueño) {
      throw forbidden('No puedes ver este documento para enviarlo a firma.');
    }

    const { rows } = await query(
      `SELECT * FROM contrato_documentos WHERE id = $1 AND contrato_id = $2 AND es_version_actual = true`,
      [req.params.documentoId, contrato.id]
    );
    const documento = rows[0];
    if (!documento) throw notFound('Documento no encontrado (o ya no es la versión vigente).');

    const buffer = await storageContratos.obtenerBuffer(documento.ruta_archivo);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  })
);

// POST /api/contratos/:id/documentos/:documentoId/enviar-a-firmar
// Manda la versión VIGENTE del documento indicado a firma electrónica vía Documenso (instancia
// propia, self-hosted). Firmantes 100% capturados a mano en cada envío (no requieren cuenta
// previa en Documenso): así sirve tanto para el representante de FPT como para la contraparte
// externa, en cualquier combinación. A diferencia de doc2sign, no hay catálogo de "tipos de
// documento" que elegir — cualquier PDF se manda directo.
router.post(
  '/:id/documentos/:documentoId/enviar-a-firmar',
  requireAuth,
  asyncHandler(async (req, res) => {
    const contrato = await cargarContrato(req.params.id);
    if (!contrato) throw notFound('Contrato no encontrado.');

    const esDueño = contrato.solicitado_por_id === req.usuario.id;
    if (!esRolPrivilegiado(req.usuario.rol) && !esDueño) {
      throw forbidden('No puedes enviar a firma un documento de un contrato que no solicitaste.');
    }
    if (!documenso.configurado()) {
      throw badRequest('La integración con Documenso no está configurada (faltan DOCUMENSO_URL / DOCUMENSO_API_TOKEN).');
    }

    const { rows: documentoRows } = await query(
      `SELECT * FROM contrato_documentos WHERE id = $1 AND contrato_id = $2 AND es_version_actual = true`,
      [req.params.documentoId, contrato.id]
    );
    const documento = documentoRows[0];
    if (!documento) throw notFound('Documento no encontrado (o ya no es la versión vigente).');
    if (documento.documenso_submission_id && !documento.documenso_rechazado_en) {
      throw conflict('Este documento ya se mandó a firmar y sigue en proceso (o ya quedó firmado).');
    }

    const body = req.body || {};
    const firmantesEntrada = Array.isArray(body.firmantes) ? body.firmantes : [];
    if (firmantesEntrada.length === 0) throw badRequest('Se requiere al menos un firmante.');
    const firmantes = firmantesEntrada.map((f, idx) => {
        if (!f?.nombreCompleto || !f?.email) {
          throw badRequest(`El firmante #${idx + 1} necesita al menos nombre completo y correo.`);
        }
        return {
          nombreCompleto: String(f.nombreCompleto).trim(),
          email: String(f.email).trim(),
          orden: Number.isFinite(Number(f.orden)) ? Number(f.orden) : idx + 1,
          // Recuadro que el usuario arrastró sobre el PDF en el editor visual (opcional: si no
          // viene, documensoClient usa la posición automática de siempre, ver areaPorDefecto).
          area: validarArea(f.area, idx),
        };
    });
    const ordenada = Boolean(body.ordenada);
    // Vencimiento del enlace de firma: 1 o 2 días (elegido en EnviarAFirmarModal.jsx). Cualquier
    // otro valor recibido se ignora y se usa el default de documensoClient (2 días), para no
    // fallar la petición por un valor inesperado.
    const vencimientoDias = [1, 2].includes(Number(body.vencimientoDias)) ? Number(body.vencimientoDias) : 2;

    const bufferDocumento = await storageContratos.obtenerBuffer(documento.ruta_archivo);
    const base64PDF = bufferDocumento.toString('base64');

    const { submissionId, submitters } = await documenso.crearSubmission({
      base64PDF,
      nombreDocumento: `${contrato.folio} - ${documento.nombre_archivo}`.slice(0, 250),
      ordenada,
      vencimientoDias,
      firmantes,
    });

               // Se guarda el enlace de firma (signingUrl) de cada firmante junto con sus datos, para poder
    // armar un enlace "pre-calentado" desde el frontend (ver FirmarEspera.jsx): asi la firma no
    // depende solo del correo automatico de Documenso, cuyo link directo puede toparse con el
    // sleep del plan gratuito de Render.
    const firmantesConEnlace = firmantes.map((f) => {
      const submitter = submitters.find((s) => s.email === f.email);
      return { ...f, signingUrl: submitter ? submitter.embedSrc : null };
    });

    await firmaElectronica.marcarEnviado(documento.id, {
      submissionId,
      firmantes: firmantesConEnlace,
      usuarioId: req.usuario.id,
    });

    await registrarAuditoria({
      contratoId: contrato.id,
      usuarioId: req.usuario.id,
      accion: 'documento_enviado_a_firmar',
      detalle: `"${documento.nombre_archivo}" enviado a firma vía Documenso con ${firmantes.length} firmante(s): ${firmantes
        .map((f) => f.email)
        .join(', ')}.`,
    });

    res.json({
      documentoId: documento.id,
      submissionId,
      firmantes: firmantesConEnlace,
    });
  })
);

// GET /api/contratos/:id/documentos/:documentoId/estatus-firma - revisa AHORA MISMO el estatus
// en Documenso (botón "Verificar estatus" en el frontend); el job periódico hace lo mismo solo.
router.get(
  '/:id/documentos/:documentoId/estatus-firma',
  requireAuth,
  asyncHandler(async (req, res) => {
    const contrato = await cargarContrato(req.params.id);
    if (!contrato) throw notFound('Contrato no encontrado.');

    const { rows } = await query(
      `SELECT * FROM contrato_documentos WHERE id = $1 AND contrato_id = $2`,
      [req.params.documentoId, contrato.id]
    );
    const documento = rows[0];
    if (!documento) throw notFound('Documento no encontrado.');
    if (!documento.documenso_submission_id) {
      throw badRequest('Este documento no se ha mandado a firmar.');
    }

    // Si ya está firmado o ya se marcó rechazado/cancelado no hace falta volver a consultar
    // Documenso. Si no, usamos la variante "estricta" (a diferencia del job periódico) para que
    // un fallo real al consultar Documenso se vea como error en la pantalla en vez de que el
    // botón simplemente "se reinicie" sin explicación y sin cambiar el estatus.
    if (!documento.documenso_firmado_en && !documento.documenso_rechazado_en) {
      try {
        await firmaElectronica.revisarEstatusDocumentoEstricto(documento);
      } catch (err) {
        throw badRequest(`No se pudo consultar el estatus en Documenso: ${err.message}`);
      }
    }

    const { rows: actualizadoRows } = await query('SELECT * FROM contrato_documentos WHERE id = $1', [documento.id]);
    const actualizado = actualizadoRows[0];
    res.json({
      documensoEstatus: actualizado.documenso_estatus,
      firmado: Boolean(actualizado.documenso_firmado_en),
      rechazado: Boolean(actualizado.documenso_rechazado_en),
    });
  })
);

// POST /api/contratos/:id/documentos/:documentoId/cancelar-firma - cancela en Documenso un envío
// a firma que sigue en proceso ("En firma" en el frontend). No aplica si ya quedó firmado, o si
// ya estaba rechazado/cancelado antes (en ese caso ya se puede volver a mandar directamente).
router.post(
  '/:id/documentos/:documentoId/cancelar-firma',
  requireAuth,
  asyncHandler(async (req, res) => {
    const contrato = await cargarContrato(req.params.id);
    if (!contrato) throw notFound('Contrato no encontrado.');

    const esDueño = contrato.solicitado_por_id === req.usuario.id;
    if (!esRolPrivilegiado(req.usuario.rol) && !esDueño) {
      throw forbidden('No puedes cancelar la firma de un documento de un contrato que no solicitaste.');
    }
    if (!documenso.configurado()) {
      throw badRequest('La integración con Documenso no está configurada (faltan DOCUMENSO_URL / DOCUMENSO_API_TOKEN).');
    }

    const { rows } = await query(
      `SELECT * FROM contrato_documentos WHERE id = $1 AND contrato_id = $2`,
      [req.params.documentoId, contrato.id]
    );
    const documento = rows[0];
    if (!documento) throw notFound('Documento no encontrado.');
    if (!documento.documenso_submission_id) {
      throw badRequest('Este documento no se ha mandado a firmar.');
    }
    if (documento.documenso_firmado_en) {
      throw conflict('Este documento ya quedó firmado; no se puede cancelar.');
    }
    if (documento.documenso_rechazado_en) {
      throw conflict('El envío a firma de este documento ya estaba cancelado o rechazado.');
    }

    await firmaElectronica.cancelarEnvio(documento, {
      motivo: (req.body || {}).motivo,
    });

    await registrarAuditoria({
      contratoId: contrato.id,
      usuarioId: req.usuario.id,
      accion: 'documento_firma_cancelada',
      detalle: `Envío a firma de "${documento.nombre_archivo}" cancelado por el usuario.`,
    });

    res.json({ ok: true });
  })
);

// POST /api/contratos/:id/documentos/:documentoId/extender-firma - extiende el vencimiento del
// enlace de firma (Documenso: envelopeExpirationPeriod) EXACTAMENTE `dias` días a partir de
// ahora, para quien todavía no firma. Solo aplica mientras sigue "En firma" (mismas condiciones
// que cancelar-firma): no si ya quedó firmado, y no si ya estaba rechazado/cancelado (en ese caso
// hay que volver a mandarlo desde cero).
router.post(
  '/:id/documentos/:documentoId/extender-firma',
  requireAuth,
  asyncHandler(async (req, res) => {
    const contrato = await cargarContrato(req.params.id);
    if (!contrato) throw notFound('Contrato no encontrado.');

    const esDueño = contrato.solicitado_por_id === req.usuario.id;
    if (!esRolPrivilegiado(req.usuario.rol) && !esDueño) {
      throw forbidden('No puedes extender el plazo de firma de un documento de un contrato que no solicitaste.');
    }
    if (!documenso.configurado()) {
      throw badRequest('La integración con Documenso no está configurada (faltan DOCUMENSO_URL / DOCUMENSO_API_TOKEN).');
    }

    const { rows } = await query(
      `SELECT * FROM contrato_documentos WHERE id = $1 AND contrato_id = $2`,
      [req.params.documentoId, contrato.id]
    );
    const documento = rows[0];
    if (!documento) throw notFound('Documento no encontrado.');
    if (!documento.documenso_submission_id) {
      throw badRequest('Este documento no se ha mandado a firmar.');
    }
    if (documento.documenso_firmado_en) {
      throw conflict('Este documento ya quedó firmado; no tiene caso extender el plazo.');
    }
    if (documento.documenso_rechazado_en) {
      throw conflict('El envío a firma de este documento ya estaba cancelado o rechazado.');
    }

    // Días a extender: 2 por default (lo único que ofrece el botón del frontend hoy), pero se
    // deja aceptar 1 o 2 igual que al enviar, por si el frontend lo vuelve configurable después.
    const dias = [1, 2].includes(Number((req.body || {}).dias)) ? Number(req.body.dias) : 2;

    const recipientsExtendidos = await firmaElectronica.extenderVencimiento(documento, { dias });

    await registrarAuditoria({
      contratoId: contrato.id,
      usuarioId: req.usuario.id,
      accion: 'documento_firma_extendida',
      detalle:
        recipientsExtendidos.length > 0
          ? `Vencimiento del enlace de firma de "${documento.nombre_archivo}" extendido ${dias} día(s) para: ${recipientsExtendidos
              .map((r) => r.email)
              .join(', ')}.`
          : `Se pidió extender el vencimiento de "${documento.nombre_archivo}", pero ya no había firmantes pendientes.`,
    });

    res.json({ ok: true, dias, recipientsExtendidos });
  })
);

module.exports = router;
