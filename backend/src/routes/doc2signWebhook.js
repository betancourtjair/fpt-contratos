// Receptor del "Webhook de Estatus" de doc2sign (doc2sign.com > Configuración > Empresa).
//
// El manual de la API no documenta el formato exacto del cuerpo que manda este webhook, así
// que en vez de intentar parsear campos específicos (que podríamos adivinar mal), se busca
// dentro del JSON recibido cualquier valor con forma de GUID y, para cada uno que coincida con
// un documento nuestro ya enviado a firmar, se vuelve a consultar su estatus DIRECTO a la API
// de doc2sign (fuente de verdad) — el webhook solo se usa como "aviso para revisar ahora",
// nunca como la fuente del estatus en sí. Así el webhook sirve sin importar su formato real, y
// el job periódico (ver jobs/scheduler.js) es el respaldo si algún aviso no llega.
//
// Seguridad opcional: si se configura DOC2SIGN_WEBHOOK_SECRET, hay que dar de alta en doc2sign
// (Configuración > Empresa > Webhook de Estatus > "Envío de cabecera") un header con ese mismo
// valor — por default se espera el header "X-Doc2sign-Secret" (configurable con
// DOC2SIGN_WEBHOOK_HEADER_NAME). Sin DOC2SIGN_WEBHOOK_SECRET configurado, se acepta cualquier
// llamada (no recomendado para producción, pero no bloquea mientras se prueba).

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { buscarPorDocumentoId, revisarEstatusDocumento } = require('../utils/firmaElectronica');

const router = express.Router();

const GUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function extraerGuids(valor, encontrados = new Set()) {
  if (typeof valor === 'string') {
    const matches = valor.match(GUID_REGEX);
    if (matches) matches.forEach((m) => encontrados.add(m.toLowerCase()));
  } else if (Array.isArray(valor)) {
    valor.forEach((v) => extraerGuids(v, encontrados));
  } else if (valor && typeof valor === 'object') {
    Object.values(valor).forEach((v) => extraerGuids(v, encontrados));
  }
  return encontrados;
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const secretoEsperado = process.env.DOC2SIGN_WEBHOOK_SECRET;
    if (secretoEsperado) {
      const nombreHeader = (process.env.DOC2SIGN_WEBHOOK_HEADER_NAME || 'X-Doc2sign-Secret').toLowerCase();
      const recibido = req.headers[nombreHeader];
      if (recibido !== secretoEsperado) {
        console.warn('[doc2signWebhook] Llamada rechazada: header de seguridad ausente o incorrecto.');
        return res.status(401).json({ error: 'No autorizado.' });
      }
    }

    // Respondemos rápido y procesamos; si algo tarda, igual ya se hizo el trabajo del lado de
    // doc2sign (no hay reintentos que evitar de nuestro lado por responder distinto).
    const guids = extraerGuids(req.body);
    let revisados = 0;
    for (const guid of guids) {
      try {
        const documento = await buscarPorDocumentoId(guid);
        if (documento) {
          revisados++;
          await revisarEstatusDocumento(documento);
        }
      } catch (err) {
        console.error(`[doc2signWebhook] Error procesando aviso para ${guid}:`, err.message);
      }
    }

    if (revisados === 0) {
      console.log('[doc2signWebhook] Aviso recibido sin GUIDs reconocidos como documentos propios. Body:', JSON.stringify(req.body));
    }

    res.json({ ok: true, documentosRevisados: revisados });
  })
);

module.exports = router;
