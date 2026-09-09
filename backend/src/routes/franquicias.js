const express = require('express');
const { query } = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Todo este módulo es exclusivo de super_admin/admin/juridico: es un espacio separado de
// "Contratos"/"Dashboard" general donde se administran únicamente los contratos de
// franquicia (uno por club).
const ROLES_MODULO_FRANQUICIAS = ['super_admin', 'admin', 'juridico'];
router.use(requireAuth, requireRole(...ROLES_MODULO_FRANQUICIAS));

// GET /api/franquicias/dashboard
router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const { rows: conteos } = await query(
      `SELECT c.estatus, COUNT(*)::int AS total
       FROM contratos c
       JOIN tipos_contrato tc ON tc.id = c.tipo_contrato_id
       WHERE tc.es_franquicia = true
       GROUP BY c.estatus`
    );
    const conteosPorEstatus = Object.fromEntries(conteos.map((r) => [r.estatus, r.total]));

    const { rows: contratosPorVencer } = await query(
      `SELECT c.id, c.folio, c.titulo, c.fecha_fin, c.dias_aviso_vencimiento, c.estatus,
              cl.nombre AS club_nombre
       FROM contratos c
       JOIN tipos_contrato tc ON tc.id = c.tipo_contrato_id
       LEFT JOIN contrato_franquicia_detalles fd ON fd.contrato_id = c.id
       LEFT JOIN clubes cl ON cl.id = fd.club_id
       WHERE tc.es_franquicia = true
         AND c.fecha_fin IS NOT NULL
         AND c.estatus IN ('activo', 'por_vencer')
         AND c.fecha_fin <= (CURRENT_DATE + (c.dias_aviso_vencimiento || ' days')::interval)
       ORDER BY c.fecha_fin ASC
       LIMIT 20`
    );

    // Misma condición que usa el programador de notificaciones (src/utils/franquicias.js),
    // para que este panel y los correos automáticos coincidan.
    const { rows: eventosProximos } = await query(
      `SELECT * FROM (
         SELECT c.id AS contrato_id, c.folio, c.titulo, c.estatus, cl.nombre AS club_nombre,
                'pago_regalias' AS tipo, fd.fecha_proximo_pago_regalias AS fecha
         FROM contrato_franquicia_detalles fd
         JOIN contratos c ON c.id = fd.contrato_id
         LEFT JOIN clubes cl ON cl.id = fd.club_id
         WHERE c.estatus IN ('activo', 'por_vencer') AND fd.fecha_proximo_pago_regalias IS NOT NULL
           AND fd.fecha_proximo_pago_regalias <= (CURRENT_DATE + (fd.dias_aviso_pago_regalias || ' days')::interval)
         UNION ALL
         SELECT c.id, c.folio, c.titulo, c.estatus, cl.nombre, 'apertura', fd.fecha_limite_apertura
         FROM contrato_franquicia_detalles fd
         JOIN contratos c ON c.id = fd.contrato_id
         LEFT JOIN clubes cl ON cl.id = fd.club_id
         WHERE c.estatus IN ('activo', 'por_vencer') AND fd.fecha_limite_apertura IS NOT NULL
           AND fd.fecha_limite_apertura <= (CURRENT_DATE + (fd.dias_aviso_apertura || ' days')::interval)
         UNION ALL
         SELECT c.id, c.folio, c.titulo, c.estatus, cl.nombre, 'auditoria', fd.fecha_proxima_auditoria
         FROM contrato_franquicia_detalles fd
         JOIN contratos c ON c.id = fd.contrato_id
         LEFT JOIN clubes cl ON cl.id = fd.club_id
         WHERE c.estatus IN ('activo', 'por_vencer') AND fd.fecha_proxima_auditoria IS NOT NULL
           AND fd.fecha_proxima_auditoria <= (CURRENT_DATE + (fd.dias_aviso_auditoria || ' days')::interval)
       ) eventos
       ORDER BY fecha ASC
       LIMIT 20`
    );

    // Clubes activos que no tienen ningún contrato de franquicia vigente (cualquier estatus
    // salvo rechazado/cancelado cuenta como "cubierto"), para saber a quién falta dar de alta.
    const { rows: clubesSinContrato } = await query(
      `SELECT cl.*
       FROM clubes cl
       WHERE cl.activo = true AND NOT EXISTS (
         SELECT 1 FROM contrato_franquicia_detalles fd
         JOIN contratos co ON co.id = fd.contrato_id
         WHERE fd.club_id = cl.id AND co.estatus NOT IN ('rechazado', 'cancelado')
       )
       ORDER BY cl.nombre ASC`
    );

    const { rows: totalClubesRows } = await query(`SELECT COUNT(*)::int AS total FROM clubes WHERE activo = true`);

    res.json({
      conteosPorEstatus,
      contratosPorVencer,
      eventosProximos,
      clubesSinContrato,
      totalClubesActivos: totalClubesRows[0]?.total || 0,
    });
  })
);

// GET /api/franquicias - listado de contratos de franquicia (con club), filtrable
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { estatus, clubId, texto } = req.query;
    const condiciones = ['tc.es_franquicia = true'];
    const valores = [];
    let i = 1;

    if (estatus) { condiciones.push(`c.estatus = $${i++}`); valores.push(estatus); }
    if (clubId) { condiciones.push(`fd.club_id = $${i++}`); valores.push(clubId); }
    if (texto) {
      condiciones.push(`(c.titulo ILIKE $${i} OR c.contraparte_nombre ILIKE $${i} OR c.folio ILIKE $${i} OR cl.nombre ILIKE $${i})`);
      valores.push(`%${texto}%`);
      i++;
    }

    const { rows } = await query(
      `SELECT c.*, tc.nombre AS tipo_contrato_nombre, u.nombre AS solicitado_por_nombre,
              fd.club_id, cl.nombre AS club_nombre
       FROM contratos c
       JOIN tipos_contrato tc ON tc.id = c.tipo_contrato_id
       JOIN usuarios u ON u.id = c.solicitado_por_id
       LEFT JOIN contrato_franquicia_detalles fd ON fd.contrato_id = c.id
       LEFT JOIN clubes cl ON cl.id = fd.club_id
       WHERE ${condiciones.join(' AND ')}
       ORDER BY c.created_at DESC`,
      valores
    );
    res.json({ contratos: rows });
  })
);

module.exports = router;
