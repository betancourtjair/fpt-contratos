// Receptor de webhooks de Documenso (self-hosted) — se configura dentro de la propia instancia
// de Documenso: ícono de usuario > Configuración de equipo > Webhooks > URL =
// https://<este-backend>/api/webhooks/documenso.
//
// A diferencia de DocuSeal (que firmaba el cuerpo con HMAC-SHA256 + timestamp), Documenso manda
// el secreto tal cual, en texto plano, en el header "X-Documenso-Secret" — ver
// docs.documenso.com/docs/developers/webhooks/verification. Aun así, y por la misma razón que
// con DocuSeal (y doc2sign antes), NO se confía en el estatus que trae el payload del webhook:
// solo se usa como "aviso para revisar ahora" y se vuelve a consultar el estatus real vía
// GET /envelope/:id (fuente de verdad). Así, aunque llegue duplicado, fuera de orden, o el
// payload no traiga exactamente lo esperado, el estatus que se guarda siempre viene de una
// consulta directa a la API — el job periódico (ver jobs/scheduler.js) es el respaldo si algún
// aviso no llega.
//
// Seguridad: si se configura DOCUMENSO_WEBHOOK_SECRET (dentro de Documenso: Configuración de
// equipo > Webhooks), se verifica que el header "X-Documenso-Secret" coincida (comparación en
// tiempo constante para evitar timing attacks). Sin DOCUMENSO_WEBHOOK_SECRET configurado, se
// acepta cualquier llamada (no recomendado para producción, pero no bloquea mientras se prueba).

const crypto = require('crypto');
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { buscarPorSubmissionId, revisarEstatusDocumento } = require('../utils/firmaElectronica');

const router = express.Router();

function secretoValido(req, secreto) {
  const recibido = req.headers['x-documenso-secret'];
  if (!recibido) return false;
  const bufferRecibido = Buffer.from(String(recibido));
  const bufferEsperado = Buffer.from(secreto);
  if (bufferRecibido.length !== bufferEsperado.length) return false;
  return crypto.timingSafeEqual(bufferRecibido, bufferEsperado);
}

/** El id del envelope viene como "envelopeId" (canónico) o, en payloads legado, "id". */
function extraerSubmissionId(payload) {
  const valor = payload?.envelopeId ?? payload?.id;
  return valor != null ? String(valor) : null;
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const secreto = process.env.DOCUMENSO_WEBHOOK_SECRET;
    if (secreto && !secretoValido(req, secreto)) {
      console.warn('[documensoWebhook] Llamada rechazada: secreto (X-Documenso-Secret) ausente o incorrecto.');
      return res.status(401).json({ error: 'No autorizado.' });
    }

    const eventType = req.body?.event;
    const submissionId = extraerSubmissionId(req.body?.payload);

    if (!submissionId) {
      console.log(`[documensoWebhook] Aviso (evento "${eventType}") sin id de envelope reconocible. Body:`, JSON.stringify(req.body));
      return res.json({ ok: true, documentoRevisado: false });
    }

    let revisado = false;
    try {
      const documento = await buscarPorSubmissionId(submissionId);
      if (documento) {
        await revisarEstatusDocumento(documento);
        revisado = true;
      } else {
        console.log(`[documensoWebhook] envelope ${submissionId} (evento "${eventType}") no corresponde a ningún documento propio.`);
      }
    } catch (err) {
      console.error(`[documensoWebhook] Error procesando aviso del envelope ${submissionId}:`, err.message);
    }

    res.json({ ok: true, eventType, documentoRevisado: revisado });
  })
);

module.exports = router;
