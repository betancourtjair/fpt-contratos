// Receptor de webhooks de DocuSeal (self-hosted) — se configura dentro de la propia instancia
// de DocuSeal: Consola > Webhooks > URL = https://<este-backend>/api/webhooks/docuseal.
//
// A diferencia de doc2sign (que no documentaba el formato de su webhook), DocuSeal sí trae un
// formato fijo: cada aviso trae "event_type" (ej. "form.completed", "submission.completed",
// "submission.declined", "submission.expired", ...) y "data" con el detalle del
// submitter/submission según el evento. Aun así, y por la misma razón que con doc2sign, NO se
// confía en el estatus que trae el payload del webhook: solo se usa como "aviso para revisar
// ahora" y se vuelve a consultar el estatus real vía GET /submissions/:id (fuente de verdad).
// Así, aunque llegue duplicado, fuera de orden, o el payload no traiga exactamente lo
// esperado, el estatus que se guarda siempre viene de una consulta directa a la API — el job
// periódico (ver jobs/scheduler.js) es el respaldo si algún aviso no llega.
//
// Seguridad: si se configura DOCUSEAL_WEBHOOK_SECRET (dentro de DocuSeal: Consola > Webhooks >
// pestaña "HMAC"), se verifica la firma HMAC-SHA256 que manda DocuSeal en el header
// "X-Docuseal-Signature" (formato "<timestamp>.<firma>"; se firma el string
// "<timestamp>.<cuerpo crudo de la petición>"). Requiere el BUFFER crudo del cuerpo (no el
// JSON ya parseado) — ver server.js, donde express.json() se configura con `verify` para
// guardarlo en req.rawBody antes de parsearlo. Sin DOCUSEAL_WEBHOOK_SECRET configurado, se
// acepta cualquier llamada (no recomendado para producción, pero no bloquea mientras se prueba).

const crypto = require('crypto');
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { buscarPorSubmissionId, revisarEstatusDocumento } = require('../utils/firmaElectronica');

const router = express.Router();

const TOLERANCIA_SEGUNDOS = 300; // 5 minutos — mismo margen que usa el propio ejemplo de DocuSeal

function firmaValida(req, secreto) {
  const header = req.headers['x-docuseal-signature'];
  if (!header) return false;
  const [timestamp, firma] = String(header).split('.', 2);
  if (!timestamp || !firma) return false;
  if (!Number.isFinite(Number(timestamp))) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > TOLERANCIA_SEGUNDOS) return false;

  // req.rawBody lo guarda server.js (ver comentario arriba); si por alguna razón no está
  // disponible, se recae en re-serializar el JSON ya parseado (menos confiable: puede no ser
  // byte-a-byte igual al original, pero es mejor que no verificar nada).
  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  const esperada = crypto.createHmac('sha256', secreto).update(`${timestamp}.${rawBody}`).digest('hex');
  if (esperada.length !== firma.length) return false;
  return crypto.timingSafeEqual(Buffer.from(esperada), Buffer.from(firma));
}

/** El id de la submission puede venir en distintos lugares según el evento; se prueban todos. */
function extraerSubmissionId(data) {
  const valor = data?.submission_id ?? data?.submission?.id ?? data?.id;
  return valor != null ? String(valor) : null;
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const secreto = process.env.DOCUSEAL_WEBHOOK_SECRET;
    if (secreto && !firmaValida(req, secreto)) {
      console.warn('[docusealWebhook] Llamada rechazada: firma HMAC (X-Docuseal-Signature) ausente o incorrecta.');
      return res.status(401).json({ error: 'No autorizado.' });
    }

    const eventType = req.body?.event_type;
    const submissionId = extraerSubmissionId(req.body?.data);

    if (!submissionId) {
      console.log(`[docusealWebhook] Aviso (evento "${eventType}") sin submission_id reconocible. Body:`, JSON.stringify(req.body));
      return res.json({ ok: true, documentoRevisado: false });
    }

    let revisado = false;
    try {
      const documento = await buscarPorSubmissionId(submissionId);
      if (documento) {
        await revisarEstatusDocumento(documento);
        revisado = true;
      } else {
        console.log(`[docusealWebhook] submission_id ${submissionId} (evento "${eventType}") no corresponde a ningún documento propio.`);
      }
    } catch (err) {
      console.error(`[docusealWebhook] Error procesando aviso de la submission ${submissionId}:`, err.message);
    }

    res.json({ ok: true, eventType, documentoRevisado: revisado });
  })
);

module.exports = router;
