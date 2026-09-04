const express = require('express');
const { query } = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { badRequest, notFound, traducirErrorPostgres } = require('../utils/errors');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/tipos-contrato - cualquier usuario autenticado puede listarlos (para llenar el form)
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const soloActivos = req.query.activo !== 'false';
    const { rows } = await query(
      soloActivos
        ? 'SELECT * FROM tipos_contrato WHERE activo = true ORDER BY nombre ASC'
        : 'SELECT * FROM tipos_contrato ORDER BY nombre ASC'
    );
    res.json({ tiposContrato: rows });
  })
);

// POST /api/tipos-contrato (admin+)
router.post(
  '/',
  requireAuth,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const { nombre, descripcion } = req.body || {};
    if (!nombre) throw badRequest('nombre es requerido.');
    try {
      const { rows } = await query(
        `INSERT INTO tipos_contrato (nombre, descripcion) VALUES ($1, $2) RETURNING *`,
        [nombre, descripcion || null]
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
    const { nombre, descripcion, activo } = req.body || {};

    const campos = [];
    const valores = [];
    let i = 1;
    if (nombre !== undefined) { campos.push(`nombre = $${i++}`); valores.push(nombre); }
    if (descripcion !== undefined) { campos.push(`descripcion = $${i++}`); valores.push(descripcion); }
    if (activo !== undefined) { campos.push(`activo = $${i++}`); valores.push(Boolean(activo)); }
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

module.exports = router;
