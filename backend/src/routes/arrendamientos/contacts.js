const express = require('express');
const { query } = require('../../db');
const asyncHandler = require('../../utils/asyncHandler');
const { badRequest, notFound } = require('../../utils/errors');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { ROLES_NIVEL_ADMIN } = require('../../utils/roles');

const router = express.Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM contacts ORDER BY nombre ASC');
    res.json({ contacts: rows });
  })
);

router.post(
  '/',
  requireAuth,
  requireRole(...ROLES_NIVEL_ADMIN),
  asyncHandler(async (req, res) => {
    const { nombre, email, telefono, empresa, puesto, notas } = req.body || {};
    if (!nombre) throw badRequest('nombre es requerido.');
    const { rows } = await query(
      `INSERT INTO contacts (nombre, email, telefono, empresa, puesto, notas) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [nombre, email || null, telefono || null, empresa || null, puesto || null, notas || null]
    );
    res.status(201).json({ contact: rows[0] });
  })
);

router.patch(
  '/:id',
  requireAuth,
  requireRole(...ROLES_NIVEL_ADMIN),
  asyncHandler(async (req, res) => {
    const { nombre, email, telefono, empresa, puesto, notas } = req.body || {};
    const campos = [];
    const valores = [];
    let i = 1;
    const set = { nombre, email, telefono, empresa, puesto, notas };
    for (const [campo, valor] of Object.entries(set)) {
      if (valor !== undefined) { campos.push(`${campo} = $${i++}`); valores.push(valor); }
    }
    if (campos.length === 0) throw badRequest('No se envió ningún campo para actualizar.');
    valores.push(req.params.id);
    const { rows } = await query(`UPDATE contacts SET ${campos.join(', ')} WHERE id = $${i} RETURNING *`, valores);
    if (!rows[0]) throw notFound('Contact no encontrado.');
    res.json({ contact: rows[0] });
  })
);

module.exports = router;
