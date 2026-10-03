const express = require('express');
const { query } = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES_MODULO_FRANQUICIAS } = require('../utils/roles');

const router = express.Router();

// Todo este módulo es exclusivo de Jurídico/Cabeza de Jurídico/CEO/CFO, más super_admin como
// respaldo de sistema (ver ROLES_MODULO_FRANQUICIAS en utils/roles.js — deliberadamente sin
// "admin" genérico): es un espacio separado de "Contratos"/"Dashboard" general donde se
// administran únicamente los contratos de franquicia (uno por club).
router.use(requireAuth, requireRole(...ROLES_MODULO_FRANQUICIAS));

// Clasificación operativa de un contrato de franquicia según si el club ya abrió sus puertas,
// más allá de su `estatus` genérico (que solo distingue borrador/activo/por_vencer/vencido/etc.
// y no dice nada sobre si el punto está operando). Todo contrato subido se crea ya "activo" y
// ya firmado (se firma a mano, se escanea y se sube), así que esta categoría es la que
// realmente le importa al negocio día a día:
//   - 'abierta'      -> fd.club_abierto = true (columna explícita; default true porque la
//                       enorme mayoría del portafolio ya opera -- ver
//                       migration_franquicia_club_abierto.sql). NO se infiere de
//                       fecha_proximo_pago_regalias: ese campo es para el calendario de cobro
//                       de regalías hacia adelante y nunca se llenó para el histórico, aunque
//                       esos clubes llevan años abiertos.
//   - 'falta_abrir'  -> no ha abierto y la fecha límite de apertura (Business Commencement
//                       Deadline) ya pasó: incumplimiento de plazo contractual.
//   - 'por_abrir'    -> no ha abierto pero su fecha límite todavía no llega (o no tiene fecha
//                       límite capturada todavía).
const CASE_CATEGORIA_APERTURA = `
  CASE
    WHEN fd.club_abierto = true THEN 'abierta'
    WHEN fd.fecha_limite_apertura IS NOT NULL AND fd.fecha_limite_apertura < CURRENT_DATE THEN 'falta_abrir'
    ELSE 'por_abrir'
  END
`;

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

    // Solo contratos activos/por_vencer cuentan para "¿el club ya abrió?" -- uno vencido,
    // cancelado o todavía en borrador no es un club operando hoy.
    const { rows: conteosApertura } = await query(
      `SELECT ${CASE_CATEGORIA_APERTURA} AS categoria, COUNT(*)::int AS total
       FROM contratos c
       JOIN tipos_contrato tc ON tc.id = c.tipo_contrato_id
       LEFT JOIN contrato_franquicia_detalles fd ON fd.contrato_id = c.id
       WHERE tc.es_franquicia = true AND c.estatus IN ('activo', 'por_vencer')
       GROUP BY categoria`
    );
    const conteosPorCategoriaApertura = {
      abierta: 0,
      por_abrir: 0,
      falta_abrir: 0,
      ...Object.fromEntries(conteosApertura.map((r) => [r.categoria, r.total])),
    };

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
      conteosPorCategoriaApertura,
      contratosPorVencer,
      eventosProximos,
      clubesSinContrato,
      totalClubesActivos: totalClubesRows[0]?.total || 0,
    });
  })
);

// GET /api/franquicias/alertas - versión sin límite (20) del dashboard, para una página
// dedicada de "alertas próximas y vencimientos" con rango de fechas elegible (igual que
// Arrendamientos/Eventos). Por default: de hoy a 90 días hacia adelante.
router.get(
  '/alertas',
  asyncHandler(async (req, res) => {
    const hoy = new Date();
    const en90Dias = new Date(hoy.getTime() + 90 * 24 * 60 * 60 * 1000);
    const from = req.query.from || hoy.toISOString().slice(0, 10);
    const to = req.query.to || en90Dias.toISOString().slice(0, 10);

    const { rows: vencimientos } = await query(
      `SELECT c.id, c.folio, c.titulo, c.fecha_fin, c.estatus, fd.club_id, cl.nombre AS club_nombre
       FROM contratos c
       JOIN tipos_contrato tc ON tc.id = c.tipo_contrato_id
       LEFT JOIN contrato_franquicia_detalles fd ON fd.contrato_id = c.id
       LEFT JOIN clubes cl ON cl.id = fd.club_id
       WHERE tc.es_franquicia = true AND c.estatus IN ('activo', 'por_vencer')
         AND c.fecha_fin IS NOT NULL AND c.fecha_fin BETWEEN $1 AND $2
       ORDER BY c.fecha_fin ASC`,
      [from, to]
    );

    const { rows: eventos } = await query(
      `SELECT * FROM (
         SELECT c.id AS contrato_id, c.folio, c.titulo, c.estatus, fd.club_id, cl.nombre AS club_nombre,
                'pago_regalias' AS tipo, fd.fecha_proximo_pago_regalias AS fecha
         FROM contrato_franquicia_detalles fd
         JOIN contratos c ON c.id = fd.contrato_id
         LEFT JOIN clubes cl ON cl.id = fd.club_id
         WHERE c.estatus IN ('activo', 'por_vencer')
           AND fd.fecha_proximo_pago_regalias BETWEEN $1 AND $2
         UNION ALL
         SELECT c.id, c.folio, c.titulo, c.estatus, fd.club_id, cl.nombre, 'apertura', fd.fecha_limite_apertura
         FROM contrato_franquicia_detalles fd
         JOIN contratos c ON c.id = fd.contrato_id
         LEFT JOIN clubes cl ON cl.id = fd.club_id
         WHERE c.estatus IN ('activo', 'por_vencer')
           AND fd.fecha_limite_apertura BETWEEN $1 AND $2
         UNION ALL
         SELECT c.id, c.folio, c.titulo, c.estatus, fd.club_id, cl.nombre, 'auditoria', fd.fecha_proxima_auditoria
         FROM contrato_franquicia_detalles fd
         JOIN contratos c ON c.id = fd.contrato_id
         LEFT JOIN clubes cl ON cl.id = fd.club_id
         WHERE c.estatus IN ('activo', 'por_vencer')
           AND fd.fecha_proxima_auditoria BETWEEN $1 AND $2
       ) eventos
       ORDER BY fecha ASC`,
      [from, to]
    );

    res.json({ from, to, vencimientos, eventos });
  })
);

// --- Destinatarios configurables de alertas (panel de administración) ------------------------
// Quién recibe cada tipo de aviso automático de Franquicias (pago de regalías, apertura,
// auditoría, vencimiento, o "todos"), además de los correos fijos por rol que ya manda
// utils/franquicias.js (ver utils/notificaciones.js::obtenerCorreosJuridicoAdmin). Antes esto
// no era editable desde ningún lado; ahora cualquiera con acceso al módulo de Franquicias puede
// agregar/quitar destinatarios adicionales sin tocar código.

// GET /api/franquicias/alertas/destinatarios
router.get(
  '/alertas/destinatarios',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT d.*, u.nombre AS creado_por_nombre
       FROM franquicia_alerta_destinatarios d
       LEFT JOIN usuarios u ON u.id = d.creado_por_id
       ORDER BY d.tipo_evento ASC, d.email ASC`
    );
    res.json({ destinatarios: rows });
  })
);

// POST /api/franquicias/alertas/destinatarios
router.post(
  '/alertas/destinatarios',
  asyncHandler(async (req, res) => {
    const { tipoEvento, email, nombre } = req.body;
    if (!tipoEvento || !email) {
      return res.status(400).json({ mensaje: 'tipoEvento y email son requeridos.' });
    }
    const { rows } = await query(
      `INSERT INTO franquicia_alerta_destinatarios (tipo_evento, email, nombre, creado_por_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [tipoEvento, email, nombre || null, req.usuario.id]
    );
    res.status(201).json({ destinatario: rows[0] });
  })
);

// PUT /api/franquicias/alertas/destinatarios/:id
router.put(
  '/alertas/destinatarios/:id',
  asyncHandler(async (req, res) => {
    const { tipoEvento, email, nombre, activo } = req.body;
    if (!tipoEvento || !email) {
      return res.status(400).json({ mensaje: 'tipoEvento y email son requeridos.' });
    }
    const { rows } = await query(
      `UPDATE franquicia_alerta_destinatarios
       SET tipo_evento = $1, email = $2, nombre = $3, activo = $4, updated_at = now()
       WHERE id = $5
       RETURNING *`,
      [tipoEvento, email, nombre || null, activo !== false, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ mensaje: 'Destinatario no encontrado.' });
    res.json({ destinatario: rows[0] });
  })
);

// DELETE /api/franquicias/alertas/destinatarios/:id
router.delete(
  '/alertas/destinatarios/:id',
  asyncHandler(async (req, res) => {
    await query(`DELETE FROM franquicia_alerta_destinatarios WHERE id = $1`, [req.params.id]);
    res.status(204).end();
  })
);

// GET /api/franquicias - listado de contratos de franquicia (con club), filtrable
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { estatus, clubId, texto, categoriaApertura } = req.query;
    const condiciones = ['tc.es_franquicia = true'];
    const valores = [];
    let i = 1;

    if (estatus) { condiciones.push(`c.estatus = $${i++}`); valores.push(estatus); }
    if (clubId) { condiciones.push(`fd.club_id = $${i++}`); valores.push(clubId); }
    if (categoriaApertura) { condiciones.push(`${CASE_CATEGORIA_APERTURA} = $${i++}`); valores.push(categoriaApertura); }
    if (texto) {
      condiciones.push(`(c.titulo ILIKE $${i} OR c.contraparte_nombre ILIKE $${i} OR c.folio ILIKE $${i} OR cl.nombre ILIKE $${i})`);
      valores.push(`%${texto}%`);
      i++;
    }

    const { rows } = await query(
      `SELECT c.*, tc.nombre AS tipo_contrato_nombre, u.nombre AS solicitado_por_nombre,
              fd.club_id, cl.nombre AS club_nombre,
              ${CASE_CATEGORIA_APERTURA} AS categoria_apertura
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
