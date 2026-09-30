const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { revisarVencimientos } = require('../utils/vencimientos');
const { revisarFranquicias } = require('../utils/franquicias');
const { revisarPendientes: revisarFirmasPendientes } = require('../utils/firmaElectronica');
const { revisarAlertasArrendamientos } = require('../utils/alertasArrendamientos');
const { ROLES_NIVEL_ADMIN } = require('../utils/roles');

const router = express.Router();

// POST /api/jobs/revisar-vencimientos
// Esta revisión ya corre sola (ver src/jobs/scheduler.js: al arrancar el servidor y todos
// los días a las 07:00). Este endpoint queda disponible para forzar una revisión inmediata
// o para pruebas, protegido para admin/super_admin. También dispara las notificaciones de
// franquicia (pagos de regalías, apertura, auditorías) en la misma llamada.
router.post(
  '/revisar-vencimientos',
  requireAuth,
  requireRole(...ROLES_NIVEL_ADMIN),
  asyncHandler(async (req, res) => {
    const vencimientos = await revisarVencimientos();
    const franquicias = await revisarFranquicias();
    res.json({ ...vencimientos, franquicias });
  })
);

// POST /api/jobs/revisar-firmas-pendientes
// Igual que arriba pero para documentos mandados a firmar vía Documenso (ver
// src/jobs/scheduler.js: corre sola al arrancar y cada 2 horas). Útil para forzar una revisión
// inmediata en vez de esperar al webhook o al siguiente ciclo del cron.
router.post(
  '/revisar-firmas-pendientes',
  requireAuth,
  requireRole(...ROLES_NIVEL_ADMIN),
  asyncHandler(async (req, res) => {
    const resumen = await revisarFirmasPendientes();
    res.json(resumen);
  })
);

// POST /api/jobs/revisar-alertas-arrendamientos
// Igual que arriba pero para las alertas de fechas críticas del módulo de Arrendamientos
// (renovación, COI, vencimiento de lease) — ver src/utils/alertasArrendamientos.js. También
// corre sola al arrancar y todos los días a las 07:00 (ver src/jobs/scheduler.js).
router.post(
  '/revisar-alertas-arrendamientos',
  requireAuth,
  requireRole(...ROLES_NIVEL_ADMIN),
  asyncHandler(async (req, res) => {
    const resumen = await revisarAlertasArrendamientos();
    res.json({ resumen });
  })
);

module.exports = router;
