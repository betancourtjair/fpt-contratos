// Cliente para la API REST de Documenso (https://documenso.com) — instancia AUTO-HOSPEDADA
// en Render. Documentación: https://docs.documenso.com/docs/developers/api
//
// Reemplaza por completo a la integración anterior con DocuSeal. Se cambió de proveedor
// porque DocuSeal, en su edición Community (auto-hospedada, gratis), bloquea justo el
// endpoint que esta app necesita — crear una firma nueva a partir de un PDF recién subido —
// detrás de su plan de pago ("Pro Edition"; confirmado en vivo y en su documentación oficial:
// POST /submissions/pdf y POST /templates/pdf están marcados "Pro"). Documenso deja esa
// funcionalidad núcleo (POST /envelope/create) en su edición Community, sin límite de
// documentos ni llave de licencia. Lo que sí es exclusivo de su edición Enterprise (SSO/SAML,
// agrupar varios documentos distintos en un mismo envío, certificaciones tipo SOC2/HIPAA,
// marca blanca) no lo usa esta app.
//
// *** IMPORTANTE — DIFERENCIA LEGAL (igual que con DocuSeal antes) ***
// Documenso NO está certificado como Proveedor de Servicios de Certificación (PSC) bajo la
// NOM-151 mexicana: es firma electrónica SIMPLE (registra quién firmó, cuándo y desde qué IP),
// no firma con validez NOM-151 como sí tenía doc2sign. Esta app y su UI deben dejarlo claro al
// usuario final (ver el aviso en EnviarAFirmarModal.jsx). Es una decisión consciente de costo
// vs. certeza legal, confirmada por el usuario.
//
// Variables de entorno requeridas:
//   DOCUMENSO_URL          URL base de la instancia self-hosted, SIN "/" al final
//                          (ej. https://fpt-documenso.onrender.com).
//   DOCUMENSO_API_TOKEN    Token de API. Se genera dentro de la instancia ya levantada: ícono
//                          de usuario (arriba a la derecha) > Configuración de equipo > API
//                          Tokens. Ojo: los tokens de API requieren un "Team" — una cuenta
//                          personal de Documenso no puede generarlos.
// Opcional (recomendado):
//   DOCUMENSO_WEBHOOK_SECRET  Secreto para verificar que los webhooks realmente vienen de esa
//                             instancia (dentro de Documenso: Configuración de equipo >
//                             Webhooks). A diferencia de DocuSeal (HMAC-SHA256 con timestamp),
//                             Documenso manda este secreto tal cual en el header
//                             "X-Documenso-Secret" — ver routes/documensoWebhook.js.
//
// A diferencia de doc2sign y de DocuSeal, Documenso no maneja "tipos de documento" configurados
// de antemano en la cuenta: cualquier PDF se manda directo a firmar (POST /envelope/create),
// sin catálogo. Tampoco hay conceptos de "usuario de servicio" separados — el token de API ya
// identifica a toda la cuenta/equipo.
//
// La posición del campo de firma en el PDF se manda como porcentaje (0-100) del tamaño de la
// página (a diferencia de DocuSeal, que usaba fracción 0-1) — se usa una posición por defecto,
// apilando una firma debajo de otra en la primera página; si en el futuro se agrega un editor
// visual para que el usuario marque el lugar exacto de su firma, aquí es donde hay que mandar
// esas coordenadas reales en vez de las por defecto.

function baseUrl() {
    return (process.env.DOCUMENSO_URL || '').replace(/\/+$/, '');
}

function configurado() {
    return Boolean(baseUrl() && process.env.DOCUMENSO_API_TOKEN);
}

async function llamar(metodo, path, { body, form } = {}) {
    if (!configurado()) {
          throw new Error('Faltan DOCUMENSO_URL / DOCUMENSO_API_TOKEN en las variables de entorno.');
    }
    const headers = { Authorization: process.env.DOCUMENSO_API_TOKEN };
    let requestBody;
    if (form) {
          requestBody = form; // FormData nativo: fetch calcula el boundary multipart solo.
    } else if (body) {
          headers['Content-Type'] = 'application/json';
          requestBody = JSON.stringify(body);
    }
    const resp = await fetch(`${baseUrl()}${path}`, { method: metodo, headers, body: requestBody });
    const contentType = resp.headers.get('content-type') || '';
    const texto = await resp.text();
    let data = texto;
    if (contentType.includes('application/json')) {
          try {
                  data = JSON.parse(texto);
          } catch {
                  /* se deja el texto crudo */
          }
    }
    if (!resp.ok) {
          const detalle = typeof data === 'string' ? data : JSON.stringify(data);
          throw new Error(`Documenso respondió ${resp.status} en ${metodo} ${path}: ${detalle}`);
    }
    return data;
}

function nombreCompleto(f) {
    return (f.nombreCompleto || '').trim();
}

/**
 * Área (porcentaje 0-100 del tamaño de página) por defecto para ir apilando firmas en la
 * primera página, de arriba hacia abajo; si hay más de 6 firmantes se pasa a una segunda
 * "columna" en X para no salirse de la página.
 */
function areaPorDefecto(idx) {
    const porColumna = 6;
    const fila = idx % porColumna;
    const columna = Math.floor(idx / porColumna);
    return {
          page: 1,
          positionX: 6 + columna * 34,
          positionY: 88 - fila * 9,
          width: 28,
          height: 6,
    };
}

/**
 * Envía un documento a firma: crea un "envelope" nuevo a partir de un PDF (sin plantilla
 * previa), un firmante (recipient) por cada elemento de `datos.firmantes`, y luego lo
 * DISTRIBUYE para que Documenso realmente mande los correos de invitación.
 *
 * *** BUG CORREGIDO (prueba final de firmas, sep 2026) ***
 * A diferencia de DocuSeal (que mandaba el correo de invitación con una sola llamada),
 * Documenso separa "crear" de "enviar" en dos pasos: POST /envelope/create solo deja el
 * envelope en estatus DRAFT dentro de Documenso — nadie recibe nada todavía, aunque los
 * firmantes ya queden cargados correctamente. Hay que llamar explícitamente a
 * POST /envelope/distribute para que se dispare el envío real. Confirmado leyendo el código
 * fuente de Documenso (self-hosted, AGPL-3.0):
 *   - packages/trpc/server/envelope-router/distribute-envelope.ts es lo único que llama a
 *     sendDocument() (el que de verdad manda los correos); create-envelope.ts nunca lo llama.
 *   - packages/prisma/schema.prisma, enum DocumentSigningOrder = PARALLEL (default) |
 *     SEQUENTIAL — el "signingOrder" numérico de cada firmante se IGNORA si no se manda también
 *     "meta.signingOrder = 'SEQUENTIAL'" al crear el envelope; si no, Documenso los trata como
 *     PARALLEL sin importar los números.
 * Antes de esta corrección, el envelope se creaba con los firmantes correctos (visible en la UI
 * de Documenso) pero se quedaba en borrador para siempre y ningún firmante recibía correo.
 *
 * @param {{
 *   base64PDF: string,
 *   nombreDocumento: string,
 *   ordenada: boolean,
    *   firmantes: Array<{nombreCompleto: string, email: string, orden: number}>,
    * }} datos
    * @returns {Promise<{submissionId: string, submitters: Array<{email: string, slug: string, embedSrc: string}>}>}
 */
async function crearSubmission(datos) {
    if (!Array.isArray(datos.firmantes) || datos.firmantes.length === 0) {
          throw new Error('Se requiere al menos un firmante.');
    }

  const recipients = datos.firmantes.map((f, idx) => ({
        email: f.email,
        name: nombreCompleto(f) || f.email,
        role: 'SIGNER',
        // Si "ordenada" es true, cada firmante solo recibe el correo de invitación hasta que el
        // anterior termine (orden real: signingOrder ascendente). Si no, se manda el mismo valor a
        // todos para que Documenso los notifique en paralelo (cualquiera puede firmar primero).
        // OJO: este número por sí solo no basta, ver "meta.signingOrder" abajo.
        signingOrder: datos.ordenada ? idx + 1 : 1,
        fields: [
          {
                    type: 'SIGNATURE',
                    ...areaPorDefecto(idx),
          },
              ],
  }));

  const payload = {
        type: 'DOCUMENT',
        title: datos.nombreDocumento,
        recipients,
        // Sin esto, Documenso ignora el signingOrder de cada firmante (su default es PARALLEL) y
        // notifica a todos al mismo tiempo, sin importar el orden que se haya mandado arriba.
        meta: {
                signingOrder: datos.ordenada ? 'SEQUENTIAL' : 'PARALLEL',
        },
  };

  const form = new FormData();
    form.append('payload', JSON.stringify(payload));
    form.append(
          'files',
          new Blob([Buffer.from(datos.base64PDF, 'base64')], { type: 'application/pdf' }),
          `${datos.nombreDocumento}.pdf`
        );

  const creado = await llamar('POST', '/api/v2/envelope/create', { form });
    if (!creado?.id) {
          throw new Error(`Documenso no regresó un id de envelope válido: ${JSON.stringify(creado)}`);
    }


  let distribuido;
    try {
          distribuido = await llamar('POST', '/api/v2/envelope/distribute', {
                  body: { envelopeId: creado.id },
          });
    } catch (err) {
          // El envelope SÍ quedó creado en Documenso (con id creado.id) pero no se pudo distribuir —
      // se deja bien claro en el mensaje para no confundirlo con una falla de creación, ya que
      // requiere revisar/reintentar puntualmente ese envelope en vez de mandar todo de nuevo.
      throw new Error(
              `El documento se creó en Documenso (envelope ${creado.id}) pero no se pudo enviar a los ` +
                `firmantes: ${err.message}`
            );
    }

  return {
        submissionId: String(creado.id),
        submitters: Array.isArray(distribuido?.recipients)
          ? distribuido.recipients.map((r) => ({ email: r.email, slug: r.token, embedSrc: r.signingUrl }))
                : [],
  };
}

/** Consulta el detalle/estatus actual de un envelope (fuente de verdad, nunca el webhook). */
async function consultarSubmission(submissionId) {
    return llamar('GET', `/api/v2/envelope/${submissionId}`);
}

/**
 * Descarga el PDF (firmado o no, según su estatus actual) en bytes.
 * Nota: la documentación pública de Documenso sobre el API de "envelopes" está fragmentada
 * (ver github.com/documenso/documenso/issues/2817) y no deja 100% claro el nombre exacto del
 * campo con la URL de descarga dentro de GET /envelope/:id. Se prueban los nombres más
 * probables; si al probarlo en vivo Documenso regresa otro nombre de campo, es aquí donde hay
 * que ajustarlo.
 */
async function descargarDocumento(submissionId) {
    const data = await consultarSubmission(submissionId);
    const candidatos = [
          data?.envelopeItems?.[0]?.documentData?.url,
          data?.documents?.[0]?.url,
          data?.downloadUrl,
        ];
    const url = candidatos.find(Boolean);
    if (!url) {
          throw new Error(
                  `No se encontró una URL de descarga en la respuesta de Documenso para el envelope ${submissionId}. ` +
                    `Respuesta: ${JSON.stringify(data)}`
                );
    }
    const resp = await fetch(url);
    if (!resp.ok) {
          throw new Error(`No se pudo descargar el documento de Documenso (${resp.status}).`);
    }
    return Buffer.from(await resp.arrayBuffer());
}

module.exports = {
    configurado,
    crearSubmission,
    consultarSubmission,
    descargarDocumento,
};
