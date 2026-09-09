const express = require('express');
const { query, withTransaction } = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { notFound, forbidden, badRequest } = require('../utils/errors');
const { requireAuth } = require('../middleware/auth');
const { registrarAuditoria } = require('../utils/audit');
const storage = require('../storage');

const router = express.Router();

// DELETE /api/documentos/:id (admin/super_admin o quien subió)
//
// Solo se puede eliminar la versión VIGENTE de un documento (para no dejar huecos en el
// historial). Al borrarla, si existe una versión anterior en el mismo grupo, esa pasa a ser
// la vigente automáticamente (equivalente a "deshacer" la última versión); si era la única
// (v1), se elimina el documento completo.
router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM contrato_documentos WHERE id = $1', [req.params.id]);
    const documento = rows[0];
    if (!documento) throw notFound('Documento no encontrado.');

    const esAdmin = ['super_admin', 'admin'].includes(req.usuario.rol);
    const esQuienSubio = documento.subido_por_id === req.usuario.id;
    if (!esAdmin && !esQuienSubio) {
      throw forbidden('Solo un admin/super_admin o quien subió el documento puede eliminarlo.');
    }
    if (!documento.es_version_actual) {
      throw badRequest('Solo se puede eliminar la versión más reciente de un documento; las versiones anteriores del historial se conservan.');
    }

    await withTransaction(async (client) => {
      await client.query('DELETE FROM contrato_documentos WHERE id = $1', [documento.id]);
      if (documento.reemplaza_a_id) {
        await client.query('UPDATE contrato_documentos SET es_version_actual = true WHERE id = $1', [documento.reemplaza_a_id]);
      }
    });
    await storage.delete(documento.ruta_archivo);
    await registrarAuditoria({
      contratoId: documento.contrato_id,
      usuarioId: req.usuario.id,
      accion: 'documento_eliminado',
      detalle: documento.reemplaza_a_id
        ? `Archivo "${documento.nombre_archivo}" (v${documento.version}); vuelve a quedar vigente la versión anterior.`
        : `Archivo "${documento.nombre_archivo}".`,
    });

    res.status(204).send();
  })
);

module.exports = router;
