const express = require('express');
const multer = require('multer');
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
const storage = require('../storage');
const { condicionVisibilidad } = require('../utils/visibilidad');

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
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { estatus, tipoContratoId, texto, proximosAVencer } = req.query;
    const usuario = req.usuario;

    const condiciones = [];
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
    if (tipoContratoId) {
      condiciones.push(`c.tipo_contrato_id = $${i++}`);
      valores.push(tipoContratoId);
    }
    if (texto) {
      condiciones.push(`(c.titulo ILIKE $${i} OR c.contraparte_nombre ILIKE $${i} OR c.folio ILIKE $${i})`);
      valores.push(`%${texto}%`);
      i++;
    }
    if (proximosAVencer === 'true') {
      condiciones.push(
        `c.fecha_fin IS NOT NULL AND c.estatus IN ('activo', 'por_vencer')
         AND c.fecha_fin <= (CURRENT_DATE + (c.dias_aviso_vencimiento || ' days')::interval)`
      );
    }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const { rows } = await query(
      `SELECT c.*, tc.nombre AS tipo_contrato_nombre, u.nombre AS solicitado_por_nombre
       FROM contratos c
       JOIN tipos_contrato tc ON tc.id = c.tipo_contrato_id
       JOIN usuarios u ON u.id = c.solicitado_por_id
       ${where}
       ORDER BY c.created_at DESC`,
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

    const { rows: documentos } = await query(
      'SELECT * FROM contrato_documentos WHERE contrato_id = $1 ORDER BY created_at DESC',
      [contrato.id]
    );
    const documentosConUrl = documentos.map((d) => ({ ...d, url: storage.getUrl(d.ruta_archivo) }));

    const { rows: tipoRows } = await query('SELECT * FROM tipos_contrato WHERE id = $1', [contrato.tipo_contrato_id]);

    res.json({
      contrato: { ...contrato, tipoContrato: tipoRows[0] || null },
      aprobaciones,
      documentos: documentosConUrl,
    });
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
// Documentos anidados bajo contrato
// ---------------------------------------------------------------------------

// POST /api/contratos/:id/documentos (multipart)
router.post(
  '/:id/documentos',
  requireAuth,
  upload.single('archivo'),
  asyncHandler(async (req, res) => {
    const contrato = await cargarContrato(req.params.id);
    if (!contrato) throw notFound('Contrato no encontrado.');
    if (!req.file) throw badRequest('Falta el archivo (campo multipart "archivo").');

    const categoriasValidas = ['borrador', 'version_firmada', 'anexo', 'evidencia', 'otro'];
    const categoria = req.body.categoria || 'otro';
    if (!categoriasValidas.includes(categoria)) {
      throw badRequest(`categoria inválida. Valores permitidos: ${categoriasValidas.join(', ')}.`);
    }

    const rutaArchivo = await storage.save({
      buffer: req.file.buffer,
      originalname: req.file.originalname,
      contratoId: contrato.id,
    });

    try {
      const { rows } = await query(
        `INSERT INTO contrato_documentos (contrato_id, nombre_archivo, ruta_archivo, categoria, subido_por_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [contrato.id, req.file.originalname, rutaArchivo, categoria, req.usuario.id]
      );
      await registrarAuditoria({
        contratoId: contrato.id,
        usuarioId: req.usuario.id,
        accion: 'documento_subido',
        detalle: `Archivo "${req.file.originalname}" (categoría ${categoria}).`,
      });
      res.status(201).json({ documento: { ...rows[0], url: storage.getUrl(rows[0].ruta_archivo) } });
    } catch (err) {
      await storage.delete(rutaArchivo).catch(() => {});
      const traducido = traducirErrorPostgres(err);
      if (traducido) throw traducido;
      throw err;
    }
  })
);

// GET /api/contratos/:id/documentos
router.get(
  '/:id/documentos',
  requireAuth,
  asyncHandler(async (req, res) => {
    const contrato = await cargarContrato(req.params.id);
    if (!contrato) throw notFound('Contrato no encontrado.');
    const { rows } = await query(
      'SELECT * FROM contrato_documentos WHERE contrato_id = $1 ORDER BY created_at DESC',
      [contrato.id]
    );
    res.json({ documentos: rows.map((d) => ({ ...d, url: storage.getUrl(d.ruta_archivo) })) });
  })
);

module.exports = router;
