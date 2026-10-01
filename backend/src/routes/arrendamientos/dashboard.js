const express = require('express');
const { query } = require('../../db');
const asyncHandler = require('../../utils/asyncHandler');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

// GET /api/dashboard - métricas generales (equivalente a los dashboards de Leasecake)
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const [resumen, rentaPorMes, proximosVencimientos, porBrand] = await Promise.all([
      query(`
        SELECT
          (SELECT COUNT(*) FROM locations) AS total_ubicaciones,
          (SELECT COUNT(*) FROM leases WHERE estatus = 'activo') AS leases_activos,
          (SELECT COALESCE(SUM(rs.monto), 0) FROM lease_rent_schedule rs
             JOIN leases le ON le.id = rs.lease_id
             WHERE rs.categoria = 'Base Rent' AND le.estatus = 'activo'
               AND rs.start_date <= CURRENT_DATE AND (rs.end_date IS NULL OR rs.end_date >= CURRENT_DATE)
          ) AS renta_mensual_total,
          (SELECT COUNT(*) FROM leases WHERE estatus = 'activo' AND expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '180 days') AS venciendo_180_dias
      `),
      query(`
        SELECT l.id AS location_id, l.nombre AS location_nombre, le.expiration_date,
          -- Preferimos la fecha de inicio del primer renglón de "Base Rent" (más precisa si
          -- existe), pero varios leases en Leasecake nunca tuvieron el Rent Schedule capturado
          -- como tabla -- solo el campo "Rent Commencement Date" del lease -- así que usamos
          -- ese como respaldo en vez de dejarlo en blanco.
          COALESCE(rs.start_date, le.rent_commencement_date) AS fecha_inicio_pago_renta
        FROM leases le
        JOIN locations l ON l.id = le.location_id
        LEFT JOIN LATERAL (
          SELECT start_date FROM lease_rent_schedule
          WHERE lease_id = le.id AND categoria = 'Base Rent'
          ORDER BY start_date ASC LIMIT 1
        ) rs ON true
        WHERE le.estatus = 'activo'
        ORDER BY l.nombre ASC
      `),
      query(`
        SELECT l.id AS location_id, l.nombre AS location_nombre, le.id AS lease_id, le.expiration_date, le.renewal_notice_deadline
        FROM leases le JOIN locations l ON l.id = le.location_id
        WHERE le.estatus = 'activo' AND le.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '365 days'
        ORDER BY le.expiration_date ASC
      `),
      query(`
        SELECT b.nombre AS brand_nombre, COUNT(l.id) AS numero_ubicaciones
        FROM brands b LEFT JOIN locations l ON l.brand_id = b.id
        GROUP BY b.nombre ORDER BY numero_ubicaciones DESC
      `),
    ]);

    res.json({
      resumen: resumen.rows[0],
      fechaInicioPagoRenta: rentaPorMes.rows,
      proximosVencimientos: proximosVencimientos.rows,
      porBrand: porBrand.rows,
    });
  })
);

module.exports = router;
