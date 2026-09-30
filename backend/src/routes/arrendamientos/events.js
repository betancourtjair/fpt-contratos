const express = require('express');
const { query } = require('../../db');
const asyncHandler = require('../../utils/asyncHandler');
const { badRequest } = require('../../utils/errors');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

// GET /api/events?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Igual que en Leasecake: la mayoría de los "eventos" no son filas guardadas, son fechas
// calculadas a partir del lease (pago de renta según lease_rent_schedule, vencimiento de
// renovación, expiración de COI). Aquí se calculan al vuelo con UNION ALL en vez de
// sincronizarse como filas estáticas; `events` (tabla) solo guarda los que alguien agregó a mano.
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const from = req.query.from || new Date().toISOString().slice(0, 10);
    const to = req.query.to || null;

    const filtroFecha = to ? 'AND fecha BETWEEN $1 AND $2' : 'AND fecha >= $1';
    const params = to ? [from, to] : [from];

    const { rows } = await query(`
      WITH eventos AS (
        -- Pago de renta (un evento por periodo de renta programado)
        SELECT l.id AS location_id, le.id AS lease_id, l.nombre AS entidad_nombre,
               'Rent Payment Due Date' AS nombre, rs.start_date AS fecha, 'auto_rent_due' AS origen
        FROM lease_rent_schedule rs
        JOIN leases le ON le.id = rs.lease_id
        JOIN locations l ON l.id = le.location_id
        WHERE rs.categoria = 'Base Rent'

        UNION ALL
        -- Inicio de pago de renta
        SELECT l.id, le.id, l.nombre, 'Rent Commencement Date', le.rent_commencement_date, 'auto_rent_commencement'
        FROM leases le JOIN locations l ON l.id = le.location_id
        WHERE le.rent_commencement_date IS NOT NULL

        UNION ALL
        -- Fecha límite de aviso de renovación
        SELECT l.id, le.id, l.nombre, 'Renewal Notice Deadline', le.renewal_notice_deadline, 'auto_renewal_deadline'
        FROM leases le JOIN locations l ON l.id = le.location_id
        WHERE le.renewal_notice_deadline IS NOT NULL

        UNION ALL
        -- Vencimiento del lease (término inicial)
        SELECT l.id, le.id, l.nombre, 'Lease Expiration Date', le.expiration_date, 'auto_expiration'
        FROM leases le JOIN locations l ON l.id = le.location_id
        WHERE le.expiration_date IS NOT NULL

        UNION ALL
        -- Vencimiento de la póliza de seguro (COI)
        SELECT l.id, le.id, l.nombre, 'COI Expiration Date', le.coi_expiration_date, 'auto_coi_expiration'
        FROM leases le JOIN locations l ON l.id = le.location_id
        WHERE le.coi_expiration_date IS NOT NULL

        UNION ALL
        -- Eventos agregados a mano
        SELECT ev.location_id, ev.lease_id, l.nombre, ev.nombre, ev.fecha, 'manual'
        FROM events ev LEFT JOIN locations l ON l.id = ev.location_id
      )
      SELECT * FROM eventos WHERE fecha IS NOT NULL ${filtroFecha}
      ORDER BY fecha ASC
      LIMIT 500
    `, params);

    res.json({ events: rows });
  })
);

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { nombre, fecha, locationId, leaseId } = req.body || {};
    if (!nombre || !fecha) throw badRequest('nombre y fecha son requeridos.');
    const { rows } = await query(
      `INSERT INTO events (nombre, fecha, location_id, lease_id, created_by_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [nombre, fecha, locationId || null, leaseId || null, req.usuario.id]
    );
    res.status(201).json({ event: rows[0] });
  })
);

module.exports = router;
