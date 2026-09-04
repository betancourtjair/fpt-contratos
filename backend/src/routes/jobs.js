const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { revisarVencimientos } = require('../utils/vencimientos');

const router = express.Router();

// POST /api/jobs/revisar-vencimientos
// Pensado para ser llamado por un cron externo (ej. Render Cron Job) usando un JWT de un
// usuario admin/super_admin. No hay un cron real corriendo dentro de este proceso.
router.post(
  '/revisar-vencimientos',
  requireAuth,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const resumen = await revisarVencimientos();
    res.json(resumen);
  })
);

module.exports = router;
