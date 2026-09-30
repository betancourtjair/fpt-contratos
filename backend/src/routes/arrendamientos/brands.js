const express = require('express');
const { query } = require('../../db');
const asyncHandler = require('../../utils/asyncHandler');
const { badRequest, notFound, traducirErrorPostgres } = require('../../utils/errors');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { ROLES_NIVEL_ADMIN } = require('../../utils/roles');

const router = express.Router();

// GET /api/brands - con métricas agregadas (# ubicaciones, # leases activos, renta mensual total)
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(`
      SELECT
        b.*,
        COUNT(DISTINCT l.id) AS numero_ubicaciones,
        COUNT(DISTINCT le.id) FILTER (WHERE le.estatus = 'activo') AS leases_activos
      FROM brands b
      LEFT JOIN locations l ON l.brand_id = b.id
      LEFT JOIN leases le ON le.location_id = l.id
      GROUP BY b.id
      ORDER BY b.nombre ASC
    `);
    res.json({ brands: rows });
  })
);

router.post(
  '/',
  requireAuth,
  requireRole(...ROLES_NIVEL_ADMIN),
  asyncHandler(async (req, res) => {
    const { nombre } = req.body || {};
    if (!nombre) throw badRequest('nombre es requerido.');
    try {
      const { rows } = await query('INSERT INTO brands (nombre) VALUES ($1) RETURNING *', [nombre]);
      res.status(201).json({ brand: rows[0] });
    } catch (err) {
      const traducido = traducirErrorPostgres(err);
      if (traducido) throw traducido;
      throw err;
    }
  })
);

router.patch(
  '/:id',
  requireAuth,
  requireRole(...ROLES_NIVEL_ADMIN),
  asyncHandler(async (req, res) => {
    const { nombre } = req.body || {};
    if (!nombre) throw badRequest('nombre es requerido.');
    const { rows } = await query('UPDATE brands SET nombre = $1 WHERE id = $2 RETURNING *', [nombre, req.params.id]);
    if (!rows[0]) throw notFound('Brand no encontrado.');
    res.json({ brand: rows[0] });
  })
);

module.exports = router;
