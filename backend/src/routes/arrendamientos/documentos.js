const express = require('express');
const multer = require('multer');
const { query } = require('../../db');
const asyncHandler = require('../../utils/asyncHandler');
const { badRequest, notFound, forbidden } = require('../../utils/errors');
const { requireAuth } = require('../../middleware/auth');
const { ROLES_NIVEL_ADMIN } = require('../../utils/roles');
const storage = require('../../storage');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// POST /api/locations/:locationId/documentos - subir un archivo (pestaña "Files" en Leasecake)
router.post(
  '/locations/:locationId/documentos',
  requireAuth,
  upload.single('archivo'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('archivo es requerido.');
    const { categoria, leaseId } = req.body || {};

    const { rows: ubicacion } = await query('SELECT id FROM locations WHERE id = $1', [req.params.locationId]);
    if (!ubicacion[0]) throw notFound('Ubicación no encontrada.');

    const claveGuardada = await storage.save({
      buffer: req.file.buffer,
      originalname: req.file.originalname,
      contratoId: req.params.locationId,
      carpetaBase: 'arrendamientos',
    });

    const { rows } = await query(
      `INSERT INTO location_documents (location_id, lease_id, nombre_archivo, categoria, storage_key, subido_por_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.locationId, leaseId || null, req.file.originalname, categoria || null, claveGuardada, req.usuario.id]
    );
    res.status(201).json({ documento: rows[0] });
  })
);

router.get(
  '/locations/:locationId/documentos',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT ld.*, u.nombre AS subido_por_nombre FROM location_documents ld
       LEFT JOIN usuarios u ON u.id = ld.subido_por_id
       WHERE ld.location_id = $1 ORDER BY ld.created_at DESC`,
      [req.params.locationId]
    );
    res.json({ documentos: rows });
  })
);

router.get(
  '/documentos/:id/descargar',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM location_documents WHERE id = $1', [req.params.id]);
    const documento = rows[0];
    if (!documento) throw notFound('Documento no encontrado.');
    res.download(storage.absolutePath(documento.storage_key), documento.nombre_archivo);
  })
);

router.delete(
  '/documentos/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM location_documents WHERE id = $1', [req.params.id]);
    const documento = rows[0];
    if (!documento) throw notFound('Documento no encontrado.');

    const esAdmin = ROLES_NIVEL_ADMIN.includes(req.usuario.rol);
    const esQuienSubio = documento.subido_por_id === req.usuario.id;
    if (!esAdmin && !esQuienSubio) {
      throw forbidden('Solo un admin/super_admin o quien subió el documento puede eliminarlo.');
    }

    await query('DELETE FROM location_documents WHERE id = $1', [req.params.id]);
    await storage.delete(documento.storage_key);
    res.status(204).end();
  })
);

module.exports = router;
