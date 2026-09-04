const express = require('express');
const { query } = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { badRequest, notFound, traducirErrorPostgres } = require('../utils/errors');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const ROLES_VALIDOS = ['super_admin', 'admin', 'juridico', 'aprobador', 'solicitante', 'lectura'];

function serializarUsuario(row) {
  if (!row) return null;
  const { password_hash, ...resto } = row;
  return resto;
}

// GET /api/usuarios (admin+)
router.get(
  '/',
  requireAuth,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM usuarios ORDER BY nombre ASC');
    res.json({ usuarios: rows.map(serializarUsuario) });
  })
);

// PATCH /api/usuarios/:id (rol, activo) - admin+
router.patch(
  '/:id',
  requireAuth,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { rol, activo, nombre, area } = req.body || {};

    if (rol !== undefined && !ROLES_VALIDOS.includes(rol)) {
      throw badRequest(`rol inválido. Valores permitidos: ${ROLES_VALIDOS.join(', ')}.`);
    }
    if (rol === 'super_admin' && req.usuario.rol !== 'super_admin') {
      throw badRequest('Solo un super_admin puede asignar el rol super_admin.');
    }

    const campos = [];
    const valores = [];
    let i = 1;
    if (rol !== undefined) { campos.push(`rol = $${i++}`); valores.push(rol); }
    if (activo !== undefined) { campos.push(`activo = $${i++}`); valores.push(Boolean(activo)); }
    if (nombre !== undefined) { campos.push(`nombre = $${i++}`); valores.push(nombre); }
    if (area !== undefined) { campos.push(`area = $${i++}`); valores.push(area); }

    if (campos.length === 0) throw badRequest('No se envió ningún campo para actualizar.');

    campos.push(`updated_at = now()`);
    valores.push(id);

    try {
      const { rows } = await query(
        `UPDATE usuarios SET ${campos.join(', ')} WHERE id = $${i} RETURNING *`,
        valores
      );
      if (!rows[0]) throw notFound('Usuario no encontrado.');
      res.json({ usuario: serializarUsuario(rows[0]) });
    } catch (err) {
      const traducido = traducirErrorPostgres(err);
      if (traducido) throw traducido;
      throw err;
    }
  })
);

module.exports = router;
