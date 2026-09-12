// Backend de almacenamiento en SharePoint (biblioteca de documentos) vía Microsoft Graph,
// para los documentos de contrato_documentos. Usa la MISMA app de Azure AD que ya usa
// email.js (MS_GRAPH_CLIENT_ID / MS_GRAPH_CLIENT_SECRET / MS_GRAPH_TENANT_ID) — a esa app
// solo hace falta agregarle el permiso de aplicación "Sites.ReadWrite.All" (o
// "Sites.Selected" apuntado nada más a este sitio) con consentimiento de administrador.
//
// Variables de entorno adicionales requeridas:
//   SHAREPOINT_SITE_HOSTNAME  ej. "fptmexico.sharepoint.com"
//   SHAREPOINT_SITE_PATH      ej. "/sites/ContratosFPT"
//
// Estructura de carpetas dentro de la biblioteca de documentos por defecto del sitio:
//   <Tipo de contrato>/<Folio>/<nombre de archivo>
//
// La clave que se guarda en la base de datos (ruta_archivo) tiene la forma
//   sharepoint:<driveItemId>:<webUrl codificada>
// para poder devolver getUrl(...) de forma síncrona (sin otra llamada a Graph) igual que
// hace el driver local.

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const LOGIN_BASE = 'https://login.microsoftonline.com';
const PREFIJO = 'sharepoint:';

function configurado() {
  return Boolean(
    process.env.MS_GRAPH_CLIENT_ID &&
      process.env.MS_GRAPH_CLIENT_SECRET &&
      process.env.MS_GRAPH_TENANT_ID &&
      process.env.SHAREPOINT_SITE_HOSTNAME &&
      process.env.SHAREPOINT_SITE_PATH
  );
}

let tokenCache = { accessToken: null, expiresAt: 0 };
async function obtenerToken() {
  const ahora = Date.now();
  if (tokenCache.accessToken && tokenCache.expiresAt > ahora + 30_000) {
    return tokenCache.accessToken;
  }
  const tenantId = process.env.MS_GRAPH_TENANT_ID;
  const url = `${LOGIN_BASE}/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: process.env.MS_GRAPH_CLIENT_ID,
    client_secret: process.env.MS_GRAPH_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!resp.ok) {
    throw new Error(`No se pudo obtener token de Graph para SharePoint (${resp.status}): ${await resp.text().catch(() => '')}`);
  }
  const data = await resp.json();
  tokenCache = { accessToken: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  return tokenCache.accessToken;
}

let driveIdCache = null;
async function obtenerDriveId(token) {
  if (driveIdCache) return driveIdCache;
  const hostname = process.env.SHAREPOINT_SITE_HOSTNAME;
  const sitePath = process.env.SHAREPOINT_SITE_PATH;
  const siteResp = await fetch(`${GRAPH_BASE}/sites/${hostname}:${sitePath}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!siteResp.ok) {
    throw new Error(`No se pudo resolver el sitio de SharePoint (${siteResp.status}): ${await siteResp.text().catch(() => '')}`);
  }
  const site = await siteResp.json();
  const driveResp = await fetch(`${GRAPH_BASE}/sites/${site.id}/drive`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!driveResp.ok) {
    throw new Error(`No se pudo resolver la biblioteca de documentos del sitio (${driveResp.status}): ${await driveResp.text().catch(() => '')}`);
  }
  const drive = await driveResp.json();
  driveIdCache = drive.id;
  return driveIdCache;
}

function sanitizarSegmento(nombre) {
  // Caracteres no permitidos en nombres de carpeta/archivo de SharePoint: \ / : * ? " < > |
  const limpio = String(nombre || '').replace(/[\\/:*?"<>|]/g, '-').trim();
  return (limpio || 'Sin nombre').slice(0, 100);
}

/** Busca o crea, nivel por nivel, la carpeta <tipoContratoNombre>/<folio>. Devuelve su id. */
async function asegurarCarpeta(token, driveId, segmentos) {
  let parentId = null; // null = raíz de la biblioteca
  for (const segmentoOriginal of segmentos) {
    const segmento = sanitizarSegmento(segmentoOriginal);
    const base = parentId
      ? `${GRAPH_BASE}/drives/${driveId}/items/${parentId}/children`
      : `${GRAPH_BASE}/drives/${driveId}/root/children`;

    const buscar = async () => {
      const resp = await fetch(`${base}?$select=id,name,folder`, { headers: { Authorization: `Bearer ${token}` } });
      if (!resp.ok) throw new Error(`No se pudo listar carpetas de SharePoint (${resp.status}): ${await resp.text().catch(() => '')}`);
      const data = await resp.json();
      return (data.value || []).find((it) => it.folder && it.name === segmento) || null;
    };

    const existente = await buscar();
    if (existente) {
      parentId = existente.id;
      continue;
    }

    const crearResp = await fetch(base, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: segmento, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
    });
    if (crearResp.status === 409) {
      // Otra subida en paralelo ya la creó justo antes: la volvemos a buscar en vez de tronar.
      const encontrada = await buscar();
      if (!encontrada) throw new Error(`Conflicto creando la carpeta "${segmento}" en SharePoint y no se pudo recuperar.`);
      parentId = encontrada.id;
      continue;
    }
    if (!crearResp.ok) {
      throw new Error(`No se pudo crear la carpeta "${segmento}" en SharePoint (${crearResp.status}): ${await crearResp.text().catch(() => '')}`);
    }
    const creada = await crearResp.json();
    parentId = creada.id;
  }
  return parentId;
}

/**
 * Sube un archivo a SharePoint vía sesión de carga (soporta los hasta 25MB que ya permite
 * el multer de la ruta de documentos; una sola PUT bastaría para <4MB pero la sesión de
 * carga funciona igual de bien para archivos chicos y es la forma robusta recomendada por
 * Graph para cualquier tamaño).
 */
async function subirArchivo(token, driveId, carpetaId, nombreArchivo, buffer) {
  const sesionResp = await fetch(
    `${GRAPH_BASE}/drives/${driveId}/items/${carpetaId}:/${encodeURIComponent(nombreArchivo)}:/createUploadSession`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename' } }),
    }
  );
  if (!sesionResp.ok) {
    throw new Error(`No se pudo iniciar la carga a SharePoint (${sesionResp.status}): ${await sesionResp.text().catch(() => '')}`);
  }
  const sesion = await sesionResp.json();

  const subidaResp = await fetch(sesion.uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Length': String(buffer.length),
      'Content-Range': `bytes 0-${buffer.length - 1}/${buffer.length}`,
    },
    body: buffer,
  });
  if (!subidaResp.ok) {
    throw new Error(`No se pudo completar la carga a SharePoint (${subidaResp.status}): ${await subidaResp.text().catch(() => '')}`);
  }
  return subidaResp.json(); // driveItem: { id, webUrl, ... }
}

/**
 * @param {{ buffer?: Buffer, path?: string, originalname: string,
 *           tipoContratoNombre?: string, folio?: string }} file
 */
async function save(file) {
  if (!configurado()) {
    throw new Error(
      'CONTRATOS_STORAGE_DRIVER=sharepoint pero faltan variables de entorno (MS_GRAPH_* y/o SHAREPOINT_SITE_HOSTNAME/SHAREPOINT_SITE_PATH).'
    );
  }
  let buffer = file.buffer;
  if (!buffer && file.path) {
    buffer = await require('fs').promises.readFile(file.path);
  }
  if (!buffer) throw new Error('Archivo sin buffer ni path; no se puede subir a SharePoint.');

  const token = await obtenerToken();
  const driveId = await obtenerDriveId(token);
  const carpetaId = await asegurarCarpeta(token, driveId, [
    file.tipoContratoNombre || 'Sin tipo',
    file.folio || 'Sin folio',
  ]);
  const item = await subirArchivo(token, driveId, carpetaId, file.originalname || 'documento', buffer);

  return `${PREFIJO}${item.id}:${encodeURIComponent(item.webUrl)}`;
}

/** Síncrono: la url ya viaja embebida en la clave desde que se guardó, sin llamar a Graph. */
function getUrl(clave) {
  const resto = clave.slice(PREFIJO.length);
  const separador = resto.indexOf(':');
  if (separador === -1) return null;
  return decodeURIComponent(resto.slice(separador + 1));
}

function idDesdeClave(clave) {
  const resto = clave.slice(PREFIJO.length);
  const separador = resto.indexOf(':');
  return separador === -1 ? resto : resto.slice(0, separador);
}

async function eliminar(clave) {
  if (!configurado()) return; // sin credenciales no hay nada que hacer del lado de SharePoint
  try {
    const token = await obtenerToken();
    const driveId = await obtenerDriveId(token);
    const itemId = idDesdeClave(clave);
    const resp = await fetch(`${GRAPH_BASE}/drives/${driveId}/items/${itemId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok && resp.status !== 404) {
      console.error(`[sharepointStorage] Error al eliminar archivo de SharePoint (${resp.status}):`, await resp.text().catch(() => ''));
    }
  } catch (err) {
    console.error('[sharepointStorage] Error al eliminar archivo de SharePoint:', err.message);
  }
}

module.exports = { save, getUrl, delete: eliminar, configurado };
