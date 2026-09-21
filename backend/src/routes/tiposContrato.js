const express = require('express');
const multer = require('multer');
const { query } = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { badRequest, notFound, conflict, traducirErrorPostgres } = require('../utils/errors');
const { requireAuth, requireRole } = require('../middleware/auth');
const { registrarAuditoria } = require('../utils/audit');
const storage = require('../storage');
const { LLAVES_PLANTILLA } = require('../utils/plantillas');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// GET /api/tipos-contrato - cualquier usuario autenticado puede listarlos (para llenar el form)
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const soloActivos = req.query.activo !== 'false';
    const { rows } = await query(
      `SELECT tc.*, p.nombre_archivo AS plantilla_nombre_archivo, p.updated_at AS plantilla_actualizada_en
       FROM tipos_contrato tc
       LEFT JOIN plantillas_tipo_contrato p ON p.tipo_contrato_id = tc.id
       ${soloActivos ? 'WHERE tc.activo = true' : ''}
       ORDER BY tc.nombre ASC`
    );
    res.json({ tiposContrato: rows });
  })
);

// GET /api/tipos-contrato/llaves-plantilla - catálogo de marcadores {{llave}} disponibles,
// para que quien arma el Word de la plantilla sepa qué escribir.
router.get(
  '/llaves-plantilla',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ llaves: LLAVES_PLANTILLA });
  })
);

// POST /api/tipos-contrato (admin+)
router.post(
  '/',
  requireAuth,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const { nombre, descripcion, esFranquicia, esNda, esServicios } = req.body || {};
    if (!nombre) throw badRequest('nombre es requerido.');
    try {
      const { rows } = await query(
        `INSERT INTO tipos_contrato (nombre, descripcion, es_franquicia, es_nda, es_servicios)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [nombre, descripcion || null, Boolean(esFranquicia), Boolean(esNda), Boolean(esServicios)]
      );
      res.status(201).json({ tipoContrato: rows[0] });
    } catch (err) {
      const traducido = traducirErrorPostgres(err);
      if (traducido) throw traducido;
      throw err;
    }
  })
);

// PATCH /api/tipos-contrato/:id (admin+)
router.patch(
  '/:id',
  requireAuth,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { nombre, descripcion, activo, esFranquicia, esNda, esServicios } = req.body || {};

    const campos = [];
    const valores = [];
    let i = 1;
    if (nombre !== undefined) { campos.push(`nombre = $${i++}`); valores.push(nombre); }
    if (descripcion !== undefined) { campos.push(`descripcion = $${i++}`); valores.push(descripcion); }
    if (activo !== undefined) { campos.push(`activo = $${i++}`); valores.push(Boolean(activo)); }
    if (esFranquicia !== undefined) { campos.push(`es_franquicia = $${i++}`); valores.push(Boolean(esFranquicia)); }
    if (esNda !== undefined) { campos.push(`es_nda = $${i++}`); valores.push(Boolean(esNda)); }
    if (esServicios !== undefined) { campos.push(`es_servicios = $${i++}`); valores.push(Boolean(esServicios)); }
    if (campos.length === 0) throw badRequest('No se envió ningún campo para actualizar.');
    valores.push(id);

    try {
      const { rows } = await query(
        `UPDATE tipos_contrato SET ${campos.join(', ')} WHERE id = $${i} RETURNING *`,
        valores
      );
      if (!rows[0]) throw notFound('Tipo de contrato no encontrado.');
      res.json({ tipoContrato: rows[0] });
    } catch (err) {
      const traducido = traducirErrorPostgres(err);
      if (traducido) throw traducido;
      throw err;
    }
  })
);

// DELETE /api/tipos-contrato/:id (admin+) - borra por completo un tipo de contrato del catálogo
// (a diferencia de PATCH { activo: false }, que solo lo desactiva y lo conserva). Postgres mismo
// protege la integridad: tipos_contrato tiene FKs entrantes desde contratos.tipo_contrato_id y
// flujo_plantillas.tipo_contrato_id SIN "ON DELETE CASCADE" (ver migration.sql), así que si algún
// contrato o plantilla de flujo todavía usa este tipo, el DELETE truena con 23503
// (foreign_key_violation) y aquí se traduce a un mensaje claro en vez del genérico de
// traducirErrorPostgres. Su plantilla Word (plantillas_tipo_contrato), en cambio, sí tiene
// ON DELETE CASCADE y se borra sola.
router.delete(
  '/:id',
  requireAuth,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    try {
      const { rows } = await query('DELETE FROM tipos_contrato WHERE id = $1 RETURNING *', [id]);
      if (!rows[0]) throw notFound('Tipo de contrato no encontrado.');
      await registrarAuditoria({
        usuarioId: req.usuario.id,
        accion: 'tipo_contrato_eliminado',
        detalle: `Tipo de contrato "${rows[0].nombre}" eliminado del catálogo.`,
      });
      res.status(204).send();
    } catch (err) {
      if (err.code === '23503') {
        throw conflict(
          'No se puede borrar: todavía hay contratos (o un flujo de autorización) que usan este tipo. ' +
            'Desactívalo en vez de borrarlo si ya no quieres que aparezca en solicitudes nuevas.'
        );
      }
      const traducido = traducirErrorPostgres(err);
      if (traducido) throw traducido;
      throw err;
    }
  })
);

// ---------------------------------------------------------------------------
// Plantilla Word (.docx) del tipo de contrato — un archivo con marcadores {{llave}}
// (ver GET /llaves-plantilla) que el backend puebla al generar el documento de un
// contrato (POST /api/contratos/:id/generar-documento).
// ---------------------------------------------------------------------------

// POST /api/tipos-contrato/:id/plantilla (multipart, admin+) - sube o reemplaza la plantilla
router.post(
  '/:id/plantilla',
  requireAuth,
  requireRole('super_admin', 'admin'),
  upload.single('archivo'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!req.file) throw badRequest('Falta el archivo (campo multipart "archivo").');
    const nombreOriginal = req.file.originalname || '';
    if (!/\.docx$/i.test(nombreOriginal)) {
      throw badRequest('La plantilla debe ser un archivo Word (.docx).');
    }

    const { rows: tipoRows } = await query('SELECT id FROM tipos_contrato WHERE id = $1', [id]);
    if (!tipoRows[0]) throw notFound('Tipo de contrato no encontrado.');

    const rutaArchivo = await storage.save({
      buffer: req.file.buffer,
      originalname: nombreOriginal,
      contratoId: `plantillas/${id}`,
    });

    try {
      const { rows } = await query(
        `INSERT INTO plantillas_tipo_contrato (tipo_contrato_id, nombre_archivo, ruta_archivo, subido_por_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (tipo_contrato_id) DO UPDATE SET
           nombre_archivo = EXCLUDED.nombre_archivo,
           ruta_archivo = EXCLUDED.ruta_archivo,
           subido_por_id = EXCLUDED.subido_por_id,
           updated_at = now()
         RETURNING *`,
        [id, nombreOriginal, rutaArchivo, req.usuario.id]
      );
      await registrarAuditoria({
        usuarioId: req.usuario.id,
        accion: 'plantilla_tipo_contrato_actualizada',
        detalle: `Tipo de contrato ${id}: plantilla "${nombreOriginal}".`,
      });
      res.status(201).json({ plantilla: { ...rows[0], url: storage.getUrl(rows[0].ruta_archivo) } });
    } catch (err) {
      await storage.delete(rutaArchivo).catch(() => {});
      const traducido = traducirErrorPostgres(err);
      if (traducido) throw traducido;
      throw err;
    }
  })
);

// DELETE /api/tipos-contrato/:id/plantilla (admin+)
router.delete(
  '/:id/plantilla',
  requireAuth,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { rows } = await query('DELETE FROM plantillas_tipo_contrato WHERE tipo_contrato_id = $1 RETURNING *', [id]);
    if (!rows[0]) throw notFound('Este tipo de contrato no tiene plantilla.');
    await storage.delete(rows[0].ruta_archivo).catch(() => {});
    await registrarAuditoria({
      usuarioId: req.usuario.id,
      accion: 'plantilla_tipo_contrato_eliminada',
      detalle: `Tipo de contrato ${id}: se eliminó la plantilla "${rows[0].nombre_archivo}".`,
    });
    res.status(204).send();
  })
);

module.exports = router;
