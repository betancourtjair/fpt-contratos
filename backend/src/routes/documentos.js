const express = require('express');
const { query } = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { notFound, forbidden } = require('../utils/errors');
const { requireAuth } = require('../middleware/auth');
const { registrarAuditoria } = require('../utils/audit');
const storage = require('../storage');

const router = express.Router();

// DELETE /api/documentos/:id (admin/super_admin o quien subió)
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

    await query('DELETE FROM contrato_documentos WHERE id = $1', [documento.id]);
    await storage.delete(documento.ruta_archivo);
    await registrarAuditoria({
      contratoId: documento.contrato_id,
      usuarioId: req.usuario.id,
      accion: 'documento_eliminado',
      detalle: `Archivo "${documento.nombre_archivo}".`,
    });

    res.status(204).send();
  })
);

module.exports = router;
