const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { revisarVencimientos } = require('../utils/vencimientos');
const { revisarFranquicias } = require('../utils/franquicias');

const router = express.Router();

// POST /api/jobs/revisar-vencimientos
// Esta revisión ya corre sola (ver src/jobs/scheduler.js: al arrancar el servidor y todos
// los días a las 07:00). Este endpoint queda disponible para forzar una revisión inmediata
// o para pruebas, protegido para admin/super_admin. También dispara las notificaciones de
// franquicia (pagos de regalías, apertura, auditorías) en la misma llamada.
router.post(
  '/revisar-vencimientos',
  requireAuth,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const vencimientos = await revisarVencimientos();
    const franquicias = await revisarFranquicias();
    res.json({ ...vencimientos, franquicias });
  })
);

module.exports = router;
