const express = require('express');
const { query } = require('../../db');
const asyncHandler = require('../../utils/asyncHandler');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { ROLES_RENTAS } = require('../../utils/roles');

const router = express.Router();

// GET /api/rentas - vista consolidada del calendario de renta de TODOS los leases activos
// (Leasecake solo muestra este calendario dentro de cada lease; aquí se agrega en un solo
// apartado para ver renta total por mes, por categoría, por ubicación/brand, y próximos
// incrementos, sin tener que entrar lease por lease).
//
// Restringido a Super Admin/CEO/CFO/Jurídico (ROLES_RENTAS): a diferencia del resto del
// módulo de Arrendamientos (lectura abierta a cualquier rol autenticado), este apartado
// expone el detalle de renta de todo el portafolio.
//
// Query params opcionales:
//   categoria    - filtra por categoría (Base Rent, CAM, Insurance, etc.)
//   locationId   - filtra por ubicación
//   brandId      - filtra por brand
//   vigente=true - solo renglones vigentes hoy (start_date <= hoy <= end_date o sin end_date)
router.get(
  '/',
  requireAuth,
  requireRole(...ROLES_RENTAS),
  asyncHandler(async (req, res) => {
    const { categoria, locationId, brandId, vigente } = req.query;
    const condiciones = [`le.estatus = 'activo'`];
    const valores = [];
    let i = 1;

    if (categoria) { condiciones.push(`rs.categoria = $${i++}`); valores.push(categoria); }
    if (locationId) { condiciones.push(`l.id = $${i++}`); valores.push(locationId); }
    if (brandId) { condiciones.push(`l.brand_id = $${i++}`); valores.push(brandId); }
    if (vigente === 'true') {
      condiciones.push(`rs.start_date <= CURRENT_DATE AND (rs.end_date IS NULL OR rs.end_date >= CURRENT_DATE)`);
    }

    const { rows } = await query(
      `SELECT
         rs.*,
         le.id AS lease_id, le.lease_name,
         l.id AS location_id, l.nombre AS location_nombre,
         b.nombre AS brand_nombre
       FROM lease_rent_schedule rs
       JOIN leases le ON le.id = rs.lease_id
       JOIN locations l ON l.id = le.location_id
       LEFT JOIN brands b ON b.id = l.brand_id
       WHERE ${condiciones.join(' AND ')}
       ORDER BY l.nombre ASC, rs.categoria ASC, rs.start_date ASC`,
      valores
    );

    // Resumen: renta vigente hoy, agrupada por categoría (para el total mensual desglosado).
    const { rows: resumenPorCategoria } = await query(`
      SELECT rs.categoria, COALESCE(SUM(rs.monto), 0) AS monto_total
      FROM lease_rent_schedule rs
      JOIN leases le ON le.id = rs.lease_id
      WHERE le.estatus = 'activo'
        AND rs.start_date <= CURRENT_DATE AND (rs.end_date IS NULL OR rs.end_date >= CURRENT_DATE)
      GROUP BY rs.categoria
      ORDER BY monto_total DESC
    `);

    // Próximos incrementos/cambios de renta (siguiente periodo que arranca a futuro).
    const { rows: proximosIncrementos } = await query(`
      SELECT l.nombre AS location_nombre, rs.categoria, rs.start_date, rs.monto, rs.pct_change
      FROM lease_rent_schedule rs
      JOIN leases le ON le.id = rs.lease_id
      JOIN locations l ON l.id = le.location_id
      WHERE le.estatus = 'activo' AND rs.start_date > CURRENT_DATE
      ORDER BY rs.start_date ASC
      LIMIT 50
    `);

    res.json({
      renglones: rows,
      resumenPorCategoria,
      proximosIncrementos,
    });
  })
);

module.exports = router;
