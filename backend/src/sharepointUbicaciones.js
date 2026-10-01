// Documentos de cada ubicación (módulo de Arrendamientos, reemplazo de la pestaña "Files" de
// Leasecake) leídos y escritos DIRECTO en SharePoint vía Microsoft Graph — usa la MISMA app de
// Azure AD y el MISMO sitio (GestorContratoslegal) que ya usa sharepointStorage.js para los
// documentos de contratos (ver ese archivo para cómo se otorgó el permiso Sites.Selected), pero
// apuntando a la carpeta raíz "Ubicaciones" en vez de <Tipo de contrato>/<Folio>/.
//
// A diferencia de contrato_documentos, aquí NO hay un registro en la base de datos por cada
// archivo: los archivos ya están en SharePoint (se migraron a mano desde Leasecake) y SharePoint
// es la única fuente de verdad. Por eso este módulo solo lista/sube/borra directo ahí, sin tabla.
//
// Variables de entorno: las mismas 5 que sharepointStorage.js (MS_GRAPH_CLIENT_ID/SECRET/
// TENANT_ID, SHAREPOINT_SITE_HOSTNAME, SHAREPOINT_SITE_PATH). Sin ellas, listar()/subir()
// devuelven "no configurado" en vez de tronar, para no romper la página si falta configurar algo.

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const LOGIN_BASE = 'https://login.microsoftonline.com';
const CARPETA_RAIZ = 'Ubicaciones';

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
    throw new Error(`No se pudo obtener token de Graph (${resp.status}): ${await resp.text().catch(() => '')}`);
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
    throw new Error(`No se pudo resolver la biblioteca de documentos (${driveResp.status}): ${await driveResp.text().catch(() => '')}`);
  }
  const drive = await driveResp.json();
  driveIdCache = drive.id;
  return driveIdCache;
}

// Quita acentos y normaliza mayúsculas/espacios para poder emparejar el nombre de la ubicación
// (como está en la base de datos, con acentos) contra el nombre de su carpeta en SharePoint
// (subida a mano por el equipo, a veces sin acentos — ej. "Angelopolis" vs "Angelópolis").
function normalizar(nombre) {
  return String(nombre || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

// Categoría (la que se ve/elige en el front) <-> nombre real de la subcarpeta en SharePoint.
// "Contrato Master" no tiene subcarpeta: el archivo va directo en la raíz de la ubicación.
const CATEGORIA_A_SUBCARPETA = {
  'Convenio Modificatorio': 'Convenio Modificatorio',
  'Depósito en Garantía': 'Depósito en Garantía',
  'Mantenimiento de Plaza': 'Mantenimiento de Plaza',
  'Renta Mensual': 'Renta Mensual',
  Agua: 'Agua',
  'CFE (Energía Eléctrica)': 'CFE (Energía Eléctrica)',
  'Gas Natural': 'Gas Natural',
  'Estoppel / Renta Variable': 'Estoppel (Renta Variable)',
  Licencias: 'Licencias',
  'Equipo de Gimnasio': 'Equipo de Gimnasio',
  Otro: 'Otro',
};
const SUBCARPETA_A_CATEGORIA = new Map(
  Object.entries(CATEGORIA_A_SUBCARPETA).map(([categoria, sub]) => [normalizar(sub), categoria])
);

function categoriaDesdeSubcarpeta(nombreSubcarpeta) {
  if (!nombreSubcarpeta) return 'Contrato Master';
  return SUBCARPETA_A_CATEGORIA.get(normalizar(nombreSubcarpeta)) || nombreSubcarpeta;
}

// Cache de 5 min de las carpetas de ubicación (evita listar la raíz "Ubicaciones" en cada
// request; son ~63 carpetas que casi nunca cambian de nombre).
let carpetasCache = { expiresAt: 0, porNombreNormalizado: new Map() };
async function obtenerCarpetaUbicacion(token, driveId, nombreUbicacion) {
  const ahora = Date.now();
  if (carpetasCache.expiresAt < ahora) {
    const url = `${GRAPH_BASE}/drives/${driveId}/root:/${encodeURIComponent(CARPETA_RAIZ)}:/children?$select=id,name,folder&$top=500`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (resp.status === 404) {
      carpetasCache = { expiresAt: ahora + 5 * 60_000, porNombreNormalizado: new Map() };
    } else {
      if (!resp.ok) throw new Error(`No se pudo listar la carpeta Ubicaciones (${resp.status}): ${await resp.text().catch(() => '')}`);
      const data = await resp.json();
      const mapa = new Map();
      for (const it of data.value || []) {
        if (it.folder) mapa.set(normalizar(it.name), it);
      }
      carpetasCache = { expiresAt: ahora + 5 * 60_000, porNombreNormalizado: mapa };
    }
  }
  return carpetasCache.porNombreNormalizado.get(normalizar(nombreUbicacion)) || null;
}

async function listarHijos(token, driveId, itemId) {
  const url = `${GRAPH_BASE}/drives/${driveId}/items/${itemId}/children?$select=id,name,folder,file,size,lastModifiedDateTime,webUrl&$top=500`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error(`No se pudo listar archivos (${resp.status}): ${await resp.text().catch(() => '')}`);
  const data = await resp.json();
  return data.value || [];
}

function mapearArchivo(it, categoria) {
  return {
    id: it.id,
    nombre: it.name,
    categoria,
    tamanoBytes: it.size ?? null,
    modificado: it.lastModifiedDateTime || null,
    url: it.webUrl,
  };
}

/** Lista (recursivo, 1 nivel de subcarpetas de categoría) los documentos de una ubicación. */
async function listar(nombreUbicacion) {
  if (!configurado()) return { configurado: false, documentos: [] };
  const token = await obtenerToken();
  const driveId = await obtenerDriveId(token);
  const carpeta = await obtenerCarpetaUbicacion(token, driveId, nombreUbicacion);
  if (!carpeta) return { configurado: true, documentos: [] };

  const hijos = await listarHijos(token, driveId, carpeta.id);
  const documentos = [];
  for (const it of hijos) {
    if (it.file) {
      documentos.push(mapearArchivo(it, 'Contrato Master'));
    } else if (it.folder) {
      const categoria = categoriaDesdeSubcarpeta(it.name);
      const archivosSub = await listarHijos(token, driveId, it.id);
      for (const af of archivosSub) {
        if (af.file) documentos.push(mapearArchivo(af, categoria));
      }
    }
  }
  return { configurado: true, documentos };
}

function sanitizarSegmento(nombre) {
  const limpio = String(nombre || '').replace(/[\\/:*?"<>|]/g, '-').trim();
  return (limpio || 'Sin nombre').slice(0, 100);
}

/** Busca o crea una subcarpeta directa de `parentId`. */
async function asegurarSubcarpeta(token, driveId, parentId, nombreSegmento) {
  const segmento = sanitizarSegmento(nombreSegmento);
  const base = `${GRAPH_BASE}/drives/${driveId}/items/${parentId}/children`;
  const buscar = async () => {
    const resp = await fetch(`${base}?$select=id,name,folder`, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) throw new Error(`No se pudo listar subcarpetas (${resp.status}): ${await resp.text().catch(() => '')}`);
    const data = await resp.json();
    return (data.value || []).find((it) => it.folder && normalizar(it.name) === normalizar(segmento)) || null;
  };
  const existente = await buscar();
  if (existente) return existente.id;
  const crearResp = await fetch(base, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: segmento, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
  });
  if (crearResp.status === 409) {
    const encontrada = await buscar();
    if (!encontrada) throw new Error(`Conflicto creando la subcarpeta "${segmento}".`);
    return encontrada.id;
  }
  if (!crearResp.ok) {
    throw new Error(`No se pudo crear la subcarpeta "${segmento}" (${crearResp.status}): ${await crearResp.text().catch(() => '')}`);
  }
  const creada = await crearResp.json();
  return creada.id;
}

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
  return subidaResp.json();
}

/**
 * Sube un documento a la ubicación. Si `categoria` es 'Contrato Master' (o viene vacía: "todo
 * documento sin etiqueta es Master de arrendamiento"), va a la raíz de la carpeta de la
 * ubicación; cualquier otra categoría va a su subcarpeta (se crea si no existe todavía).
 */
async function subir(nombreUbicacion, categoria, nombreArchivo, buffer) {
  if (!configurado()) {
    throw new Error('Falta configurar las variables de entorno de SharePoint/Microsoft Graph.');
  }
  const token = await obtenerToken();
  const driveId = await obtenerDriveId(token);
  const carpetaUbicacion = await obtenerCarpetaUbicacion(token, driveId, nombreUbicacion);
  if (!carpetaUbicacion) {
    throw new Error(`No existe la carpeta de "${nombreUbicacion}" dentro de Ubicaciones en SharePoint.`);
  }

  const subcarpetaNombre = categoria && categoria !== 'Contrato Master' ? CATEGORIA_A_SUBCARPETA[categoria] || categoria : null;
  const carpetaDestinoId = subcarpetaNombre
    ? await asegurarSubcarpeta(token, driveId, carpetaUbicacion.id, subcarpetaNombre)
    : carpetaUbicacion.id;

  const item = await subirArchivo(token, driveId, carpetaDestinoId, nombreArchivo, buffer);
  return mapearArchivo(item, categoria || 'Contrato Master');
}

async function eliminar(itemId) {
  if (!configurado()) return;
  const token = await obtenerToken();
  const driveId = await obtenerDriveId(token);
  const resp = await fetch(`${GRAPH_BASE}/drives/${driveId}/items/${itemId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok && resp.status !== 404) {
    throw new Error(`No se pudo eliminar el archivo (${resp.status}): ${await resp.text().catch(() => '')}`);
  }
}

module.exports = { configurado, listar, subir, eliminar };
