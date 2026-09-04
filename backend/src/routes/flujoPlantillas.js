const express = require('express');
const { query } = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { badRequest, notFound, traducirErrorPostgres } = require('../utils/errors');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const ROLES_VALIDOS = ['super_admin', 'admin', 'juridico', 'aprobador', 'solicitante', 'lectura'];

// GET /api/flujo-plantillas (con sus pasos)
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows: plantillas } = await query('SELECT * FROM flujo_plantillas ORDER BY created_at DESC');
    const { rows: pasos } = await query('SELECT * FROM flujo_pasos ORDER BY plantilla_id, orden ASC');
    const pasosPorPlantilla = new Map();
    for (const paso of pasos) {
      if (!pasosPorPlantilla.has(paso.plantilla_id)) pasosPorPlantilla.set(paso.plantilla_id, []);
      pasosPorPlantilla.get(paso.plantilla_id).push(paso);
    }
    const resultado = plantillas.map((p) => ({ ...p, pasos: pasosPorPlantilla.get(p.id) || [] }));
    res.json({ flujoPlantillas: resultado });
  })
);

// GET /api/flujo-plantillas/:id
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM flujo_plantillas WHERE id = $1', [req.params.id]);
    if (!rows[0]) throw notFound('Plantilla de flujo no encontrada.');
    const { rows: pasos } = await query(
      'SELECT * FROM flujo_pasos WHERE plantilla_id = $1 ORDER BY orden ASC',
      [req.params.id]
    );
    res.json({ flujoPlantilla: { ...rows[0], pasos } });
  })
);

// POST /api/flujo-plantillas (admin/super_admin)
router.post(
  '/',
  requireAuth,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const { nombre, tipoContratoId, activo } = req.body || {};
    if (!nombre) throw badRequest('nombre es requerido.');
    try {
      const { rows } = await query(
        `INSERT INTO flujo_plantillas (nombre, tipo_contrato_id, activo)
         VALUES ($1, $2, $3) RETURNING *`,
        [nombre, tipoContratoId || null, activo === undefined ? true : Boolean(activo)]
      );
      res.status(201).json({ flujoPlantilla: { ...rows[0], pasos: [] } });
    } catch (err) {
      const traducido = traducirErrorPostgres(err);
      if (traducido) throw traducido;
      throw err;
    }
  })
);

// PATCH /api/flujo-plantillas/:id (admin/super_admin)
router.patch(
  '/:id',
  requireAuth,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { nombre, tipoContratoId, activo } = req.body || {};
    const campos = [];
    const valores = [];
    let i = 1;
    if (nombre !== undefined) { campos.push(`nombre = $${i++}`); valores.push(nombre); }
    if (tipoContratoId !== undefined) { campos.push(`tipo_contrato_id = $${i++}`); valores.push(tipoContratoId); }
    if (activo !== undefined) { campos.push(`activo = $${i++}`); valores.push(Boolean(activo)); }
    if (campos.length === 0) throw badRequest('No se envió ningún campo para actualizar.');
    campos.push('updated_at = now()');
    valores.push(id);

    try {
      const { rows } = await query(
        `UPDATE flujo_plantillas SET ${campos.join(', ')} WHERE id = $${i} RETURNING *`,
        valores
      );
      if (!rows[0]) throw notFound('Plantilla de flujo no encontrada.');
      res.json({ flujoPlantilla: rows[0] });
    } catch (err) {
      const traducido = traducirErrorPostgres(err);
      if (traducido) throw traducido;
      throw err;
    }
  })
);

// ---- Pasos anidados ----

// GET /api/flujo-plantillas/:id/pasos
router.get(
  '/:id/pasos',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      'SELECT * FROM flujo_pasos WHERE plantilla_id = $1 ORDER BY orden ASC',
      [req.params.id]
    );
    res.json({ pasos: rows });
  })
);

function validarPaso(body) {
  const { orden, nombre, rolAprobador, aprobadorId, montoMinimo, montoMaximo } = body || {};
  if (orden === undefined || orden === null) throw badRequest('orden es requerido.');
  if (!nombre) throw badRequest('nombre es requerido.');
  if (!rolAprobador && !aprobadorId) {
    throw badRequest('Debes indicar rolAprobador o aprobadorId (al menos uno).');
  }
  if (rolAprobador && !ROLES_VALIDOS.includes(rolAprobador)) {
    throw badRequest(`rolAprobador inválido. Valores permitidos: ${ROLES_VALIDOS.join(', ')}.`);
  }
  if (
    montoMinimo !== undefined &&
    montoMinimo !== null &&
    montoMaximo !== undefined &&
    montoMaximo !== null &&
    Number(montoMinimo) > Number(montoMaximo)
  ) {
    throw badRequest('montoMinimo no puede ser mayor que montoMaximo.');
  }
}

// POST /api/flujo-plantillas/:id/pasos (admin/super_admin)
router.post(
  '/:id/pasos',
  requireAuth,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const { id: plantillaId } = req.params;
    validarPaso(req.body);
    const { orden, nombre, rolAprobador, aprobadorId, montoMinimo, montoMaximo, obligatorio } = req.body;

    const plantilla = await query('SELECT id FROM flujo_plantillas WHERE id = $1', [plantillaId]);
    if (!plantilla.rows[0]) throw notFound('Plantilla de flujo no encontrada.');

    try {
      const { rows } = await query(
        `INSERT INTO flujo_pasos
           (plantilla_id, orden, nombre, rol_aprobador, aprobador_id, monto_minimo, monto_maximo, obligatorio)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          plantillaId,
          orden,
          nombre,
          rolAprobador || null,
          aprobadorId || null,
          montoMinimo ?? null,
          montoMaximo ?? null,
          obligatorio === undefined ? true : Boolean(obligatorio),
        ]
      );
      res.status(201).json({ paso: rows[0] });
    } catch (err) {
      const traducido = traducirErrorPostgres(err);
      if (traducido) throw traducido;
      throw err;
    }
  })
);

// PATCH /api/flujo-plantillas/:id/pasos/:pasoId (admin/super_admin)
router.patch(
  '/:id/pasos/:pasoId',
  requireAuth,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const { id: plantillaId, pasoId } = req.params;
    const { orden, nombre, rolAprobador, aprobadorId, montoMinimo, montoMaximo, obligatorio } = req.body || {};

    if (rolAprobador !== undefined && rolAprobador !== null && !ROLES_VALIDOS.includes(rolAprobador)) {
      throw badRequest(`rolAprobador inválido. Valores permitidos: ${ROLES_VALIDOS.join(', ')}.`);
    }

    const campos = [];
    const valores = [];
    let i = 1;
    if (orden !== undefined) { campos.push(`orden = $${i++}`); valores.push(orden); }
    if (nombre !== undefined) { campos.push(`nombre = $${i++}`); valores.push(nombre); }
    if (rolAprobador !== undefined) { campos.push(`rol_aprobador = $${i++}`); valores.push(rolAprobador); }
    if (aprobadorId !== undefined) { campos.push(`aprobador_id = $${i++}`); valores.push(aprobadorId); }
    if (montoMinimo !== undefined) { campos.push(`monto_minimo = $${i++}`); valores.push(montoMinimo); }
    if (montoMaximo !== undefined) { campos.push(`monto_maximo = $${i++}`); valores.push(montoMaximo); }
    if (obligatorio !== undefined) { campos.push(`obligatorio = $${i++}`); valores.push(Boolean(obligatorio)); }
    if (campos.length === 0) throw badRequest('No se envió ningún campo para actualizar.');

    valores.push(pasoId, plantillaId);

    try {
      const { rows } = await query(
        `UPDATE flujo_pasos SET ${campos.join(', ')} WHERE id = $${i++} AND plantilla_id = $${i} RETURNING *`,
        valores
      );
      if (!rows[0]) throw notFound('Paso de flujo no encontrado.');
      res.json({ paso: rows[0] });
    } catch (err) {
      const traducido = traducirErrorPostgres(err);
      if (traducido) throw traducido;
      throw err;
    }
  })
);

// DELETE /api/flujo-plantillas/:id/pasos/:pasoId (admin/super_admin)
router.delete(
  '/:id/pasos/:pasoId',
  requireAuth,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const { id: plantillaId, pasoId } = req.params;
    const { rows } = await query(
      'DELETE FROM flujo_pasos WHERE id = $1 AND plantilla_id = $2 RETURNING id',
      [pasoId, plantillaId]
    );
    if (!rows[0]) throw notFound('Paso de flujo no encontrado.');
    res.status(204).send();
  })
);

module.exports = router;
