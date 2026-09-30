const express = require('express');
const { query } = require('../../db');
const asyncHandler = require('../../utils/asyncHandler');
const { badRequest, notFound, traducirErrorPostgres } = require('../../utils/errors');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { ROLES_NIVEL_ADMIN } = require('../../utils/roles');

const router = express.Router();

const CAMPOS = [
  'nombre', 'ein', 'yearEstablished', 'fullAddress', 'address1', 'address2', 'city', 'state', 'zip', 'country',
];
const MAPA_COLUMNAS = {
  nombre: 'nombre',
  ein: 'ein',
  yearEstablished: 'year_established',
  fullAddress: 'full_address',
  address1: 'address1',
  address2: 'address2',
  city: 'city',
  state: 'state',
  zip: 'zip',
  country: 'country',
};

// GET /api/companies - con métricas agregadas (# ubicaciones, # leases activos, gasto anual)
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(`
      SELECT
        c.*,
        COUNT(DISTINCT l.id) AS numero_ubicaciones,
        COUNT(DISTINCT le.id) FILTER (WHERE le.estatus = 'activo') AS leases_activos
      FROM companies c
      LEFT JOIN locations l ON l.company_id = c.id
      LEFT JOIN leases le ON le.location_id = l.id
      GROUP BY c.id
      ORDER BY c.nombre ASC
    `);
    res.json({ companies: rows });
  })
);

router.post(
  '/',
  requireAuth,
  requireRole(...ROLES_NIVEL_ADMIN),
  asyncHandler(async (req, res) => {
    const { nombre } = req.body || {};
    if (!nombre) throw badRequest('nombre es requerido.');

    const columnas = ['nombre'];
    const valores = [nombre];
    for (const campo of CAMPOS) {
      if (campo === 'nombre') continue;
      if (req.body[campo] !== undefined) {
        columnas.push(MAPA_COLUMNAS[campo]);
        valores.push(req.body[campo]);
      }
    }
    const placeholders = columnas.map((_, i) => `$${i + 1}`);
    try {
      const { rows } = await query(
        `INSERT INTO companies (${columnas.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
        valores
      );
      res.status(201).json({ company: rows[0] });
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
    const campos = [];
    const valores = [];
    let i = 1;
    for (const campo of CAMPOS) {
      if (req.body[campo] !== undefined) {
        campos.push(`${MAPA_COLUMNAS[campo]} = $${i++}`);
        valores.push(req.body[campo]);
      }
    }
    if (campos.length === 0) throw badRequest('No se envió ningún campo para actualizar.');
    valores.push(req.params.id);

    const { rows } = await query(
      `UPDATE companies SET ${campos.join(', ')} WHERE id = $${i} RETURNING *`,
      valores
    );
    if (!rows[0]) throw notFound('Company no encontrada.');
    res.json({ company: rows[0] });
  })
);

module.exports = router;
