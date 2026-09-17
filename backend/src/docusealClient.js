// Cliente para la API REST de DocuSeal (https://www.docuseal.com) — instancia AUTO-HOSPEDADA
// en Render. Documentación: https://www.docuseal.com/docs/api
//
// Reemplaza por completo a la integración anterior con doc2sign (PSC World). Se cambió de
// proveedor porque doc2sign (NOM-151 certificado) cobra por firma/transacción y no hay forma
// de usarlo gratis; DocuSeal es open-source y se puede auto-hospedar sin costo de licencia.
//
// *** IMPORTANTE — DIFERENCIA LEGAL ***
// DocuSeal NO está certificado como Proveedor de Servicios de Certificación (PSC) bajo la
// NOM-151 mexicana: es firma electrónica SIMPLE (registra quién firmó, cuándo, desde qué IP,
// y genera un "audit log" con esa evidencia), no firma con validez NOM-151 como sí tenía
// doc2sign. Esta app y su UI deben dejarlo claro al usuario final (ver el aviso en
// EnviarAFirmarModal.jsx). Es una decisión consciente de costo vs. certeza legal, confirmada
// por el usuario.
//
// Variables de entorno requeridas:
//   DOCUSEAL_URL          URL base de la instancia self-hosted, SIN "/" al final
//                         (ej. https://firmas.fpt.com.mx o https://fpt-docuseal.onrender.com).
//   DOCUSEAL_API_TOKEN    Token de API ("X-Auth-Token"). Se obtiene dentro de la instancia de
//                         DocuSeal ya levantada: Configuración de la cuenta > API.
// Opcional (recomendado):
//   DOCUSEAL_WEBHOOK_SECRET  Secreto HMAC-SHA256 para verificar que los webhooks realmente
//                            vienen de esa instancia de DocuSeal (dentro de DocuSeal: Consola >
//                            Webhooks > pestaña "HMAC" — ahí mismo se da de alta la URL del
//                            webhook: https://<este-backend>/api/webhooks/docuseal). Sin esto,
//                            el webhook acepta cualquier llamada (no bloquea mientras se
//                            prueba, pero no es recomendable dejarlo así en producción).
//
// A diferencia de doc2sign, DocuSeal no maneja "tipos de documento" configurados de antemano
// en la cuenta: cualquier PDF se manda a firmar directo, sin catálogo (endpoint "Carga de
// Documento" = POST /submissions/pdf). Tampoco existen conceptos de "usuario de servicio" ni
// "usuario de carga" separados — el token de API ya identifica a toda la cuenta.
//
// Igual que pasaba con doc2sign, la ubicación exacta de la firma en el PDF hay que mandarla
// nosotros (DocuSeal no la calcula sola si el PDF no tiene texto "{{...}}" ni se usa una
// plantilla previa): se usa una posición por defecto, apilando una firma debajo de otra en la
// primera página. A diferencia de doc2sign (que pedía pixeles), aquí las coordenadas son
// proporciones de 0 a 1 del tamaño de la página, así que no dependen del tamaño real del PDF.
// Si en el futuro se agrega un editor visual para que el usuario marque el lugar exacto de su
// firma, aquí es donde hay que mandar esas coordenadas reales en vez de las por defecto.

function baseUrl() {
  return (process.env.DOCUSEAL_URL || '').replace(/\/+$/, '');
}

function configurado() {
  return Boolean(baseUrl() && process.env.DOCUSEAL_API_TOKEN);
}

async function llamar(metodo, path, { body } = {}) {
  if (!configurado()) {
    throw new Error('Faltan DOCUSEAL_URL / DOCUSEAL_API_TOKEN en las variables de entorno.');
  }
  const resp = await fetch(`${baseUrl()}${path}`, {
    method: metodo,
    headers: {
      'X-Auth-Token': process.env.DOCUSEAL_API_TOKEN,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
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
    throw new Error(`DocuSeal respondió ${resp.status} en ${metodo} ${path}: ${detalle}`);
  }
  return data;
}

function nombreCompleto(f) {
  return [f.nombres, f.apellidoPaterno, f.apellidoMaterno].filter(Boolean).join(' ').trim();
}

/** Cada firmante necesita un "role" único (así lo exige DocuSeal) — se usa uno genérico por posición. */
function rolFirmante(idx) {
  return `Firmante ${idx + 1}`;
}

/**
 * Área (proporción 0-1 del tamaño de página) por defecto para ir apilando firmas en la
 * primera página, de arriba hacia abajo; si hay más de 6 firmantes se pasa a una segunda
 * "columna" en X para no salirse de la página.
 */
function areaPorDefecto(idx) {
  const porColumna = 6;
  const fila = idx % porColumna;
  const columna = Math.floor(idx / porColumna);
  return {
    page: 1,
    x: 0.06 + columna * 0.34,
    y: 0.88 - fila * 0.09,
    w: 0.28,
    h: 0.06,
  };
}

/**
 * Envía un documento a firma: crea una "submission" ad-hoc a partir de un PDF (sin plantilla
 * previa), un firmante por cada elemento de `datos.firmantes`.
 * @param {{
 *   base64PDF: string,
 *   nombreDocumento: string,
 *   ordenada: boolean,
 *   firmantes: Array<{nombres: string, apellidoPaterno: string, apellidoMaterno?: string, email: string, orden: number}>,
 * }} datos
 * @returns {Promise<{submissionId: string, submitters: Array<{email: string, slug: string, embedSrc: string}>}>}
 */
async function crearSubmission(datos) {
  if (!Array.isArray(datos.firmantes) || datos.firmantes.length === 0) {
    throw new Error('Se requiere al menos un firmante.');
  }

  const fields = datos.firmantes.map((f, idx) => ({
    name: `Firma - ${nombreCompleto(f) || f.email}`,
    type: 'signature',
    role: rolFirmante(idx),
    required: true,
    areas: [areaPorDefecto(idx)],
  }));

  const body = {
    name: datos.nombreDocumento,
    // "preserved": el firmante 2 solo recibe el correo de invitación hasta que el 1 termine
    // (orden real). "random": se les avisa a todos al mismo tiempo (firman en cualquier orden).
    order: datos.ordenada ? 'preserved' : 'random',
    documents: [
      {
        name: datos.nombreDocumento,
        file: datos.base64PDF,
        fields,
      },
    ],
    submitters: datos.firmantes.map((f, idx) => ({
      email: f.email,
      name: nombreCompleto(f) || f.email,
      role: rolFirmante(idx),
      order: idx,
    })),
  };

  const data = await llamar('POST', '/submissions/pdf', { body });
  if (!data?.id) {
    throw new Error(`DocuSeal no regresó un id de submission válido: ${JSON.stringify(data)}`);
  }
  return {
    submissionId: String(data.id),
    submitters: Array.isArray(data.submitters)
      ? data.submitters.map((s) => ({ email: s.email, slug: s.slug, embedSrc: s.embed_src }))
      : [],
  };
}

/** Consulta el detalle/estatus actual de una submission (fuente de verdad, nunca el webhook). */
async function consultarSubmission(submissionId) {
  return llamar('GET', `/submissions/${submissionId}`);
}

/** Descarga el PDF (firmado o no, según su estatus actual) en bytes. */
async function descargarDocumento(submissionId) {
  const data = await consultarSubmission(submissionId);
  const documentos = Array.isArray(data?.documents) ? data.documents : [];
  if (documentos.length === 0 || !documentos[0]?.url) {
    throw new Error(`La submission ${submissionId} de DocuSeal todavía no tiene un documento disponible para descargar.`);
  }
  // Esta app siempre manda un solo PDF por envío, así que basta con el primero.
  const resp = await fetch(documentos[0].url);
  if (!resp.ok) {
    throw new Error(`No se pudo descargar el documento de DocuSeal (${resp.status}).`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

/**
 * Descarga el log de auditoría (evidencia de quién firmó, cuándo y desde qué IP) — el
 * equivalente más cercano en DocuSeal a la "constancia" de doc2sign, aunque SIN el valor
 * legal de una constancia NOM-151.
 */
async function descargarConstanciaAuditoria(submissionId) {
  const data = await consultarSubmission(submissionId);
  if (!data?.audit_log_url) {
    throw new Error(`La submission ${submissionId} de DocuSeal todavía no tiene audit_log_url (el documento no se ha completado).`);
  }
  const resp = await fetch(data.audit_log_url);
  if (!resp.ok) {
    throw new Error(`No se pudo descargar el log de auditoría de DocuSeal (${resp.status}).`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

module.exports = {
  configurado,
  crearSubmission,
  consultarSubmission,
  descargarDocumento,
  descargarConstanciaAuditoria,
};
