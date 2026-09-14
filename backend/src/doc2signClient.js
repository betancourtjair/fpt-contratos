// Cliente para la API REST de doc2sign (PSC World) — firma electrónica NOM-151.
// Documentación: manual "PSC World_Manual_de_Conexión_API_Genérico_doc2sign_REST.pdf"
// (compartido por PSC World; se puede volver a descargar desde
// https://sites.google.com/detecno.com/soluciones-psc-world/doc2sign-site).
//
// Variables de entorno requeridas:
//   DOC2SIGN_CLIENT_ID       "Usuario de servicio" (GUID) — doc2sign.com > Configuración > Empresa
//   DOC2SIGN_CLIENT_SECRET   "Contraseña de servicio (llave)" (GUID) — misma pantalla
// Opcionales:
//   DOC2SIGN_ENTORNO         "test" (DEFAULT) o "produccion". Mientras no se confirme el flujo
//                            completo contra el ambiente de pruebas de doc2sign, se queda en
//                            "test" a propósito para NO gastar créditos reales por accidente.
//   DOC2SIGN_USERSERVICES    normalmente el MISMO GUID que DOC2SIGN_CLIENT_ID: la pantalla de
//                            doc2sign solo expone un par usuario/contraseña de servicio para
//                            toda la cuenta, así que se asume que ese "Usuario de servicio" es
//                            también el "userservices" que hay que mandar en cada llamada. Si
//                            una prueba en el ambiente test falla con un error de userservices
//                            inválido, PSC World puede confirmar el valor correcto y se fija
//                            aquí sin tocar código.
//
// NOTA: el manual documenta cada método campo por campo pero no trae ejemplos de request/response
// en crudo para todos ellos (sí vienen en las colecciones de Postman que PSC World adjunta al
// manual, que no se pudieron abrir desde este entorno). Antes de usar esto en producción, mandar
// un documento de prueba real contra DOC2SIGN_ENTORNO=test y revisar los logs.

const OAUTH_BASE = {
  test: 'https://oauth-test.doc2sign.com',
  produccion: 'https://oauth.doc2sign.com',
};
const API_BASE = {
  test: 'https://api-rest-test.doc2sign.com/REST_Document',
  produccion: 'https://api-rest.doc2sign.com/REST_Document',
};

function entorno() {
  return (process.env.DOC2SIGN_ENTORNO || 'test').toLowerCase() === 'produccion' ? 'produccion' : 'test';
}

function configurado() {
  return Boolean(process.env.DOC2SIGN_CLIENT_ID && process.env.DOC2SIGN_CLIENT_SECRET);
}

function userservices() {
  return process.env.DOC2SIGN_USERSERVICES || process.env.DOC2SIGN_CLIENT_ID;
}

let tokenCache = { accessToken: null, expiresAt: 0, entorno: null };

/** Obtiene (y cachea) un access token vía OAuth2 client_credentials. */
async function obtenerToken() {
  const env = entorno();
  const ahora = Date.now();
  if (tokenCache.accessToken && tokenCache.entorno === env && tokenCache.expiresAt > ahora + 60_000) {
    return tokenCache.accessToken;
  }
  if (!configurado()) {
    throw new Error('Faltan DOC2SIGN_CLIENT_ID / DOC2SIGN_CLIENT_SECRET en las variables de entorno.');
  }
  const basicAuth = Buffer.from(`${process.env.DOC2SIGN_CLIENT_ID}:${process.env.DOC2SIGN_CLIENT_SECRET}`).toString(
    'base64'
  );

  const resp = await fetch(`${OAUTH_BASE[env]}/OAuth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ type_code: 'empresa', grant_type: 'client_credentials' }),
  });
  if (!resp.ok) {
    throw new Error(`No se pudo obtener token de doc2sign (${env}) (${resp.status}): ${await resp.text().catch(() => '')}`);
  }
  const data = await resp.json();
  // El manual indica un vencimiento de 7 días para el token; usamos expires_in si la respuesta
  // lo trae y si no, un margen conservador de 6 días.
  const expiresInMs = data.expires_in ? data.expires_in * 1000 : 6 * 24 * 60 * 60 * 1000;
  tokenCache = { accessToken: data.access_token, expiresAt: Date.now() + expiresInMs, entorno: env };
  return tokenCache.accessToken;
}

async function llamar(metodo, path, { body, query } = {}) {
  const env = entorno();
  const token = await obtenerToken();
  let url = `${API_BASE[env]}/${path}`;
  if (query) {
    url += `?${new URLSearchParams(query).toString()}`;
  }
  const resp = await fetch(url, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`,
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
    throw new Error(`doc2sign (${env}) respondió ${resp.status} en ${path}: ${detalle}`);
  }
  return data;
}

/** Quita comillas si doc2sign regresó un GUID/string como JSON string plano ("...") . */
function limpiarString(valor) {
  if (typeof valor !== 'string') return valor;
  return valor.replace(/^"+|"+$/g, '').trim();
}

/**
 * Envía un documento a firma (método "Carga de Documento 2" — permite firmantes sin cuenta en
 * doc2sign identificados solo por nombre/email, y usar los créditos de la empresa).
 * @param {{
 *   base64PDF: string,
 *   nombreDocumento: string,
 *   tipoDocumento: string,
 *   ordenada: boolean,
 *   firmantes: Array<{nombres: string, apellidoPaterno: string, apellidoMaterno?: string, email: string, orden: number}>,
 *   addQR?: boolean,
 * }} datos
 * @returns {Promise<string>} GUID del documento dentro de doc2sign
 */
async function cargarDocumento(datos) {
  if (!Array.isArray(datos.firmantes) || datos.firmantes.length === 0) {
    throw new Error('Se requiere al menos un firmante.');
  }

  const infoDocumento = {
    type_code: 'empresa',
    userservices: userservices(),
    usuarioIdcarga: userservices(),
    base64PDFbase64: datos.base64PDF,
    nombreDocumento: datos.nombreDocumento,
    tipoDocumento: datos.tipoDocumento,
    ordenada: datos.ordenada ? 1 : 0,
    firmantes: [],
    firmanteSinRegistro: datos.firmantes.map((f) => ({
      Nombres: f.nombres,
      ap_paterno: f.apellidoPaterno,
      ap_materno: f.apellidoMaterno || '',
      email: f.email,
      OrdenDeFirma: f.orden,
      PosX: -1,
      PosY: -1,
      Pagina: -1,
    })),
    interesados: [],
    addQR: datos.addQR ?? true,
    usaCreditosEmpresa: true,
    ubicacionFirmaPersonalizada: false,
  };

  const data = await llamar('POST', 'CargaDocumento2', { body: infoDocumento });
  return limpiarString(typeof data === 'string' ? data : data?.documentoID || data?.DocumentoID || data?.id || JSON.stringify(data));
}

/** Consulta el estatus (texto: "ID y descripción del estatus", según el manual). */
async function consultarEstatus(documentoId) {
  const data = await llamar('GET', 'Estatus', {
    query: { type_code: 'empresa', userservices: userservices(), documentoID: documentoId },
  });
  return limpiarString(typeof data === 'string' ? data : JSON.stringify(data));
}

/** Descarga el documento (firmado o no) en bytes. */
async function descargarDocumento(documentoId) {
  const data = await llamar('GET', 'Descarga', {
    query: { type_code: 'empresa', userservices: userservices(), documentoID: documentoId },
  });
  const base64 = limpiarString(typeof data === 'string' ? data : JSON.stringify(data));
  return Buffer.from(base64, 'base64');
}

/** Descarga la constancia NOM-151 (evidencia legal de la firma) en bytes. */
async function descargarEvidenciaNOM151(documentoId) {
  const data = await llamar('GET', 'ObtenEvidenciaNOM', {
    query: { type_code: 'empresa', userservices: userservices(), documentoID: documentoId },
  });
  const base64 = limpiarString(typeof data === 'string' ? data : JSON.stringify(data));
  return Buffer.from(base64, 'base64');
}

/** Lista los tipos de documento configurados en la cuenta de doc2sign (para un <select>). */
async function listarTiposDocumento() {
  const data = await llamar('GET', 'Tipos', { query: { type_code: 'empresa', userservices: userservices() } });
  return Array.isArray(data) ? data : [];
}

module.exports = {
  entorno,
  configurado,
  cargarDocumento,
  consultarEstatus,
  descargarDocumento,
  descargarEvidenciaNOM151,
  listarTiposDocumento,
};
