// Endpoint público (sin login) para que un cron externo gratuito (cron-job.org, UptimeRobot,
// un GitHub Action programado, etc.) mantenga viva la firma electrónica mientras haya
// documentos pendientes de firmar.
//
// Por qué existe: Documenso (self-hosted en Render, plan gratuito) se duerme tras ~15 min sin
// tráfico, y este mismo backend (también en Render gratuito) también se duerme sin tráfico.
// Una sola llamada periódica externa resuelve ambos problemas:
// 1) La sola petición HTTP ya despierta a este backend si estaba dormido.
// 2) Si hay al menos un documento con firma pendiente, revisarPendientes() consulta su
// estatus real en Documenso (GET /envelope/:id) para cada uno — eso también despierta o
// mantiene despierto a Documenso, y de paso deja los estatus al corriente. Si no hay nada
// pendiente, no se le hace ninguna llamada a Documenso y se le deja dormir normalmente.
//
// Configurar un cron externo cada ~10 minutos (menos de los 15 min de inactividad que tolera
// Render) apuntando aquí, por ejemplo:
// GET https://<este-backend>/api/keep-alive?secret=<KEEP_ALIVE_SECRET>
//
// Seguridad: si se configura la variable de entorno KEEP_ALIVE_SECRET, se exige que coincida
// (comparación en tiempo constante) ya sea en el header "X-Keep-Alive-Secret" o en el query
// param "secret" (para servicios de cron gratuitos que solo dejan configurar una URL, sin
// headers personalizados). Sin KEEP_ALIVE_SECRET configurado, se acepta cualquier llamada (no
// recomendado para producción, pero no bloquea mientras se prueba) — mismo criterio que ya se
// usa en routes/documensoWebhook.js.

const crypto = require('crypto');
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const documenso = require('../documensoClient');
const { revisarPendientes: revisarFirmasPendientes } = require('../utils/firmaElectronica');

const router = express.Router();

function secretoValido(req, secreto) {
  const recibido = req.headers['x-keep-alive-secret'] || req.query.secret;
  if (!recibido) return false;
  const bufferRecibido = Buffer.from(String(recibido));
  const bufferEsperado = Buffer.from(secreto);
  if (bufferRecibido.length !== bufferEsperado.length) return false;
  return crypto.timingSafeEqual(bufferRecibido, bufferEsperado);
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const secreto = process.env.KEEP_ALIVE_SECRET;
    if (secreto && !secretoValido(req, secreto)) {
      return res.status(401).json({ error: 'No autorizado.' });
    }

    if (!documenso.configurado()) {
      return res.json({ ok: true, documensoConfigurado: false });
    }

    const resumen = await revisarFirmasPendientes();
    res.json({ ok: true, documensoConfigurado: true, ...resumen });
  })
  );

module.exports = router;
