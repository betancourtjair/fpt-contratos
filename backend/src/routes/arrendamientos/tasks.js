const express = require('express');
const { query } = require('../../db');
const asyncHandler = require('../../utils/asyncHandler');
const { badRequest, notFound } = require('../../utils/errors');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(`
      SELECT t.*, l.nombre AS location_nombre, u.nombre AS asignado_a_nombre
      FROM tasks t
      LEFT JOIN locations l ON l.id = t.location_id
      LEFT JOIN usuarios u ON u.id = t.asignado_a_id
      ORDER BY (t.estatus = 'cerrada') ASC, t.fecha_limite ASC NULLS LAST
    `);
    res.json({ tasks: rows });
  })
);

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { titulo, descripcion, locationId, leaseId, asignadoAId, fechaLimite } = req.body || {};
    if (!titulo) throw badRequest('titulo es requerido.');
    const { rows } = await query(
      `INSERT INTO tasks (titulo, descripcion, location_id, lease_id, asignado_a_id, fecha_limite, created_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [titulo, descripcion || null, locationId || null, leaseId || null, asignadoAId || null, fechaLimite || null, req.usuario.id]
    );
    res.status(201).json({ task: rows[0] });
  })
);

router.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { titulo, descripcion, estatus, asignadoAId, fechaLimite } = req.body || {};
    const campos = [];
    const valores = [];
    let i = 1;
    if (titulo !== undefined) { campos.push(`titulo = $${i++}`); valores.push(titulo); }
    if (descripcion !== undefined) { campos.push(`descripcion = $${i++}`); valores.push(descripcion); }
    if (estatus !== undefined) { campos.push(`estatus = $${i++}`); valores.push(estatus); }
    if (asignadoAId !== undefined) { campos.push(`asignado_a_id = $${i++}`); valores.push(asignadoAId); }
    if (fechaLimite !== undefined) { campos.push(`fecha_limite = $${i++}`); valores.push(fechaLimite); }
    if (campos.length === 0) throw badRequest('No se envió ningún campo para actualizar.');
    campos.push('updated_at = now()');
    valores.push(req.params.id);

    const { rows } = await query(`UPDATE tasks SET ${campos.join(', ')} WHERE id = $${i} RETURNING *`, valores);
    if (!rows[0]) throw notFound('Task no encontrada.');
    res.json({ task: rows[0] });
  })
);

module.exports = router;
