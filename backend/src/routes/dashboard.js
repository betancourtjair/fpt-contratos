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

    res.json({
      conteosPorEstatus,
      contratosPorVencer: porVencer,
      misPendientesAprobar: pendientesAprobar,
      misSolicitudesRecientes,
    });
  })
);

module.exports = router;
