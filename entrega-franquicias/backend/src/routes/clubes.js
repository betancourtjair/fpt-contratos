const express = require('express');
const { query } = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { badRequest, notFound, traducirErrorPostgres } = require('../utils/errors');
const { requireAuth, requireRole } = require('../middleware/auth');
const { registrarAuditoria } = require('../utils/audit');

const router = express.Router();

// Solo estos roles administran el catálogo de clubes (dar de alta / editar / activar-desactivar).
const ROLES_MODULO_FRANQUICIAS = ['super_admin', 'admin', 'juridico'];

// GET /api/clubes - cualquier usuario autenticado puede listarlos (para llenar formularios,
// p.ej. quien edita un contrato de franquicia ya existente que no fue creado desde el módulo).
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const soloActivos = req.query.activo === 'true';
    const { rows } = await query(
      `SELECT cl.*,
              (SELECT COUNT(*) FROM contrato_franquicia_detalles fd
               JOIN contratos co ON co.id = fd.contrato_id
               WHERE fd.club_id = cl.id AND co.estatus NOT IN ('rechazado', 'cancelado'))::int AS contratos_vigentes
       FROM clubes cl
       ${soloActivos ? 'WHERE cl.activo = true' : ''}
       ORDER BY cl.nombre ASC`
    );
    res.json({ clubes: rows });
  })
);

// POST /api/clubes (super_admin/admin/juridico)
router.post(
  '/',
  requireAuth,
  requireRole(...ROLES_MODULO_FRANQUICIAS),
  asyncHandler(async (req, res) => {
    const { nombre, direccion } = req.body || {};
    if (!nombre?.trim()) throw badRequest('nombre es requerido.');
    try {
      const { rows } = await query(
        `INSERT INTO clubes (nombre, direccion) VALUES ($1, $2) RETURNING *`,
        [nombre.trim(), direccion || null]
      );
      await registrarAuditoria({
        usuarioId: req.usuario.id,
        accion: 'club_creado',
        detalle: `Club "${rows[0].nombre}" dado de alta.`,
      });
      res.status(201).json({ club: rows[0] });
    } catch (err) {
      const traducido = traducirErrorPostgres(err);
      if (traducido) throw traducido;
      throw err;
    }
  })
);

// PATCH /api/clubes/:id (super_admin/admin/juridico)
router.patch(
  '/:id',
  requireAuth,
  requireRole(...ROLES_MODULO_FRANQUICIAS),
  asyncHandler(async (req, res) => {
    const { nombre, direccion, activo } = req.body || {};
    const campos = [];
    const valores = [];
    let i = 1;
    if (nombre !== undefined) { campos.push(`nombre = $${i++}`); valores.push(nombre); }
    if (direccion !== undefined) { campos.push(`direccion = $${i++}`); valores.push(direccion || null); }
    if (activo !== undefined) { campos.push(`activo = $${i++}`); valores.push(Boolean(activo)); }
    if (campos.length === 0) throw badRequest('No se envió ningún campo para actualizar.');
    campos.push('updated_at = now()');
    valores.push(req.params.id);

    try {
      const { rows } = await query(
        `UPDATE clubes SET ${campos.join(', ')} WHERE id = $${i} RETURNING *`,
        valores
      );
      if (!rows[0]) throw notFound('Club no encontrado.');
      await registrarAuditoria({
        usuarioId: req.usuario.id,
        accion: 'club_actualizado',
        detalle: `Club "${rows[0].nombre}" actualizado.`,
      });
      res.json({ club: rows[0] });
    } catch (err) {
      const traducido = traducirErrorPostgres(err);
      if (traducido) throw traducido;
      throw err;
    }
  })
);

module.exports = router;
