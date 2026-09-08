const express = require('express');
const { query } = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { condicionVisibilidad } = require('../utils/visibilidad');

const router = express.Router();

// GET /api/dashboard/resumen
router.get(
  '/resumen',
  requireAuth,
  asyncHandler(async (req, res) => {
    const usuario = req.usuario;
    const visibilidad = condicionVisibilidad(usuario, 0);
    const whereVisible = visibilidad ? `WHERE ${visibilidad.condicion}` : '';
    const valoresVisibles = visibilidad ? visibilidad.valores : [];

    const { rows: conteos } = await query(
      `SELECT estatus, COUNT(*)::int AS total FROM contratos c ${whereVisible} GROUP BY estatus`,
      valoresVisibles
    );
    const conteosPorEstatus = Object.fromEntries(conteos.map((r) => [r.estatus, r.total]));

    const condicionesPorVencer = [
      `c.fecha_fin IS NOT NULL`,
      `c.estatus IN ('activo', 'por_vencer')`,
      `c.fecha_fin <= (CURRENT_DATE + (c.dias_aviso_vencimiento || ' days')::interval)`,
    ];
    if (visibilidad) condicionesPorVencer.push(visibilidad.condicion);
    const { rows: porVencer } = await query(
      `SELECT c.id, c.folio, c.titulo, c.fecha_fin, c.dias_aviso_vencimiento, c.estatus
       FROM contratos c
       WHERE ${condicionesPorVencer.join(' AND ')}
       ORDER BY c.fecha_fin ASC
       LIMIT 20`,
      valoresVisibles
    );

    const { rows: pendientesAprobar } = await query(
      `SELECT ca.id, ca.orden, ca.nombre_paso, c.id AS contrato_id, c.folio, c.titulo
       FROM contrato_aprobaciones ca
       JOIN contratos c ON c.id = ca.contrato_id
       WHERE ca.decision = 'pendiente' AND ca.orden = c.paso_actual_orden AND c.estatus = 'en_autorizacion'
         AND (ca.aprobador_id = $1 OR ca.rol_requerido = $2)
       ORDER BY c.created_at ASC
       LIMIT 20`,
      [usuario.id, usuario.rol]
    );

    const { rows: misSolicitudesRecientes } = await query(
      `SELECT id, folio, titulo, estatus, created_at
       FROM contratos WHERE solicitado_por_id = $1
       ORDER BY created_at DESC LIMIT 10`,
      [usuario.id]
    );

    // Próximos eventos de franquicia (pago de regalías, apertura, auditoría) dentro de su
    // propia ventana de aviso — misma condición que usa el programador para notificar
    // (ver src/utils/franquicias.js), para que el dashboard y los correos coincidan.
    const condicionFranquicia = visibilidad ? `AND ${visibilidad.condicion}` : '';
    const { rows: franquiciasProximas } = await query(
      `SELECT * FROM (
         SELECT c.id AS contrato_id, c.folio, c.titulo, c.estatus, 'pago_regalias' AS tipo,
                fd.fecha_proximo_pago_regalias AS fecha
         FROM contrato_franquicia_detalles fd
         JOIN contratos c ON c.id = fd.contrato_id
         WHERE c.estatus IN ('activo', 'por_vencer') AND fd.fecha_proximo_pago_regalias IS NOT NULL
           AND fd.fecha_proximo_pago_regalias <= (CURRENT_DATE + (fd.dias_aviso_pago_regalias || ' days')::interval)
           ${condicionFranquicia}
         UNION ALL
         SELECT c.id, c.folio, c.titulo, c.estatus, 'apertura',
                fd.fecha_limite_apertura
         FROM contrato_franquicia_detalles fd
         JOIN contratos c ON c.id = fd.contrato_id
         WHERE c.estatus IN ('activo', 'por_vencer') AND fd.fecha_limite_apertura IS NOT NULL
           AND fd.fecha_limite_apertura <= (CURRENT_DATE + (fd.dias_aviso_apertura || ' days')::interval)
           ${condicionFranquicia}
         UNION ALL
         SELECT c.id, c.folio, c.titulo, c.estatus, 'auditoria',
                fd.fecha_proxima_auditoria
         FROM contrato_franquicia_detalles fd
         JOIN contratos c ON c.id = fd.contrato_id
         WHERE c.estatus IN ('activo', 'por_vencer') AND fd.fecha_proxima_auditoria IS NOT NULL
           AND fd.fecha_proxima_auditoria <= (CURRENT_DATE + (fd.dias_aviso_auditoria || ' days')::interval)
           ${condicionFranquicia}
       ) eventos
       ORDER BY fecha ASC
       LIMIT 20`,
      valoresVisibles
    );

    res.json({
      conteosPorEstatus,
      contratosPorVencer: porVencer,
      misPendientesAprobar: pendientesAprobar,
      misSolicitudesRecientes,
      franquiciasProximas,
    });
  })
);

module.exports = router;
