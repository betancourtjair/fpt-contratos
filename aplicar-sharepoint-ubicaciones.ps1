# Aplica el feature de "Archivos de SharePoint" en Ubicaciones escribiendo
# el contenido final de cada archivo directamente (sin usar git am / patch).
# Ejecuta esto parado en la raiz del repo (misma carpeta donde corriste git antes).

$ErrorActionPreference = 'Stop'
$utf8NoBom = New-Object System.Text.UTF8Encoding $false

# --- backend/src/sharepointUbicaciones.js ---
$f1 = @'
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

'@
$dir = Split-Path -Parent "backend\src\sharepointUbicaciones.js"
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
[System.IO.File]::WriteAllText((Resolve-Path ".").Path + "\backend\src\sharepointUbicaciones.js", $f1, $utf8NoBom)

# --- backend/src/routes/arrendamientos/documentos.js ---
$f2 = @'
const express = require('express');
const multer = require('multer');
const { query } = require('../../db');
const asyncHandler = require('../../utils/asyncHandler');
const { badRequest, notFound } = require('../../utils/errors');
const { requireAuth } = require('../../middleware/auth');
const sharepointUbicaciones = require('../../sharepointUbicaciones');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Los documentos de cada ubicación (pestaña "Files" de Leasecake) viven directo en SharePoint
// (carpeta Ubicaciones/<nombre de la ubicación>/<categoría>/), no en nuestra base de datos: se
// migraron a mano desde Leasecake y SharePoint es la única fuente de verdad. Por eso estas rutas
// solo resuelven el nombre de la ubicación y delegan todo a sharepointUbicaciones (ver ese
// archivo). Si SharePoint no está configurado (faltan las variables MS_GRAPH_*/SHAREPOINT_*),
// se devuelve la lista vacía en vez de tronar, para no romper la página de la ubicación.

async function obtenerNombreUbicacion(locationId) {
  const { rows } = await query('SELECT nombre FROM locations WHERE id = $1', [locationId]);
  if (!rows[0]) throw notFound('Ubicación no encontrada.');
  return rows[0].nombre;
}

router.post(
  '/locations/:locationId/documentos',
  requireAuth,
  upload.single('archivo'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('archivo es requerido.');
    const { categoria } = req.body || {};
    const nombreUbicacion = await obtenerNombreUbicacion(req.params.locationId);

    const documento = await sharepointUbicaciones.subir(nombreUbicacion, categoria, req.file.originalname, req.file.buffer);
    res.status(201).json({ documento });
  })
);

router.get(
  '/locations/:locationId/documentos',
  requireAuth,
  asyncHandler(async (req, res) => {
    const nombreUbicacion = await obtenerNombreUbicacion(req.params.locationId);
    const { configurado, documentos } = await sharepointUbicaciones.listar(nombreUbicacion);
    res.json({ documentos, sharepointConfigurado: configurado });
  })
);

router.delete(
  '/documentos/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    // :id es el driveItem id de SharePoint (string opaco), no un id de nuestra base de datos.
    await sharepointUbicaciones.eliminar(req.params.id);
    res.status(204).end();
  })
);

module.exports = router;

'@
$dir = Split-Path -Parent "backend\src\routes\arrendamientos\documentos.js"
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
[System.IO.File]::WriteAllText((Resolve-Path ".").Path + "\backend\src\routes\arrendamientos\documentos.js", $f2, $utf8NoBom)

# --- backend/src/routes/arrendamientos/locations.js ---
$f3 = @'
const express = require('express');
const { query } = require('../../db');
const asyncHandler = require('../../utils/asyncHandler');
const { badRequest, notFound, traducirErrorPostgres } = require('../../utils/errors');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { ROLES_NIVEL_ADMIN } = require('../../utils/roles');

const router = express.Router();

// Campos editables de `locations` expuestos en el API en camelCase -> columna real.
const MAPA_COLUMNAS = {
  nombre: 'nombre',
  locationNumber: 'location_number',
  brandId: 'brand_id',
  companyId: 'company_id',
  address1: 'address1',
  address2: 'address2',
  city: 'city',
  state: 'state',
  zip: 'zip',
  country: 'country',
  fullAddress: 'full_address',
  latitude: 'latitude',
  longitude: 'longitude',
  locationType: 'location_type',
  locationSubtype: 'location_subtype',
  businessCategory: 'business_category',
  businessType: 'business_type',
  propertyName: 'property_name',
  squareMeters: 'square_meters',
  totalLeasedSqm: 'total_leased_sqm',
  totalSubleasedSqm: 'total_subleased_sqm',
  phone: 'phone',
  lockboxCode: 'lockbox_code',
  locationImageUrl: 'location_image_url',
};

// La "ubicación activa" de referencia (para mostrar landlord/expiración/renta en el listado)
// es el lease sin estatus 'cancelado' con la fecha de expiración más lejana; si no hay ninguno
// activo se usa el más reciente que exista, para no dejar el renglón completamente vacío.
const SUBQUERY_LEASE_ACTIVO = `(
  SELECT le.id FROM leases le
  WHERE le.location_id = l.id
  ORDER BY (le.estatus = 'activo') DESC, le.expiration_date DESC NULLS LAST
  LIMIT 1
)`;

// GET /api/locations - listado combinado (igual que el "Locations report" de Leasecake):
// ubicación + brand + company + datos del lease activo (landlord, vencimiento, renta actual).
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(`
      SELECT
        l.*,
        b.nombre AS brand_nombre,
        c.nombre AS company_nombre,
        le.id AS lease_activo_id,
        le.acquisition_type,
        le.lease_classification,
        le.landlord_nombre,
        le.expiration_date,
        le.expiration_date_including_options,
        le.is_month_to_month,
        (
          SELECT rs.monto FROM lease_rent_schedule rs
          WHERE rs.lease_id = le.id AND rs.categoria = 'Base Rent'
            AND rs.start_date <= CURRENT_DATE AND (rs.end_date IS NULL OR rs.end_date >= CURRENT_DATE)
          ORDER BY rs.start_date DESC LIMIT 1
        ) AS renta_actual
      FROM locations l
      LEFT JOIN brands b ON b.id = l.brand_id
      LEFT JOIN companies c ON c.id = l.company_id
      LEFT JOIN leases le ON le.id = ${SUBQUERY_LEASE_ACTIVO}
      ORDER BY l.nombre ASC
    `);
    res.json({ locations: rows });
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(`
      SELECT l.*, b.nombre AS brand_nombre, c.nombre AS company_nombre
      FROM locations l
      LEFT JOIN brands b ON b.id = l.brand_id
      LEFT JOIN companies c ON c.id = l.company_id
      WHERE l.id = $1
    `, [req.params.id]);
    const location = rows[0];
    if (!location) throw notFound('Ubicación no encontrada.');

    const { rows: leases } = await query(
      `SELECT * FROM leases WHERE location_id = $1 ORDER BY (estatus = 'activo') DESC, expiration_date DESC NULLS LAST`,
      [req.params.id]
    );
    // Los documentos de la ubicación ya NO se leen de location_documents: viven directo en
    // SharePoint y se obtienen aparte con GET /locations/:id/documentos (ver documentos.js).

    res.json({ location, leases });
  })
);

router.post(
  '/',
  requireAuth,
  requireRole(...ROLES_NIVEL_ADMIN),
  asyncHandler(async (req, res) => {
    const { nombre } = req.body || {};
    if (!nombre) throw badRequest('nombre es requerido.');

    const columnas = ['nombre'];
    const valores = [nombre];
    for (const [campo, columna] of Object.entries(MAPA_COLUMNAS)) {
      if (campo === 'nombre') continue;
      if (req.body[campo] !== undefined) {
        columnas.push(columna);
        valores.push(req.body[campo]);
      }
    }
    const placeholders = columnas.map((_, i) => `$${i + 1}`);
    try {
      const { rows } = await query(
        `INSERT INTO locations (${columnas.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
        valores
      );
      res.status(201).json({ location: rows[0] });
    } catch (err) {
      const traducido = traducirErrorPostgres(err);
      if (traducido) throw traducido;
      throw err;
    }
  })
);

router.patch(
  '/:id',
  requireAuth,
  requireRole(...ROLES_NIVEL_ADMIN),
  asyncHandler(async (req, res) => {
    const campos = [];
    const valores = [];
    let i = 1;
    for (const [campo, columna] of Object.entries(MAPA_COLUMNAS)) {
      if (req.body[campo] !== undefined) {
        campos.push(`${columna} = $${i++}`);
        valores.push(req.body[campo]);
      }
    }
    if (campos.length === 0) throw badRequest('No se envió ningún campo para actualizar.');
    campos.push('updated_at = now()');
    valores.push(req.params.id);

    try {
      const { rows } = await query(
        `UPDATE locations SET ${campos.join(', ')} WHERE id = $${i} RETURNING *`,
        valores
      );
      if (!rows[0]) throw notFound('Ubicación no encontrada.');
      res.json({ location: rows[0] });
    } catch (err) {
      const traducido = traducirErrorPostgres(err);
      if (traducido) throw traducido;
      throw err;
    }
  })
);

// --- Hilo de comentarios (pestaña "Discussion") ---

router.get(
  '/:id/comentarios',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT lc.*, u.nombre AS usuario_nombre FROM location_comments lc
       JOIN usuarios u ON u.id = lc.usuario_id
       WHERE lc.location_id = $1 ORDER BY lc.created_at ASC`,
      [req.params.id]
    );
    res.json({ comentarios: rows });
  })
);

router.post(
  '/:id/comentarios',
  requireAuth,
  asyncHandler(async (req, res) => {
    const comentario = ((req.body || {}).comentario || '').trim();
    if (!comentario) throw badRequest('El comentario no puede estar vacío.');
    const { rows } = await query(
      `INSERT INTO location_comments (location_id, usuario_id, comentario) VALUES ($1, $2, $3) RETURNING *`,
      [req.params.id, req.usuario.id, comentario]
    );
    res.status(201).json({ comentario: { ...rows[0], usuario_nombre: req.usuario.nombre } });
  })
);

module.exports = router;

'@
$dir = Split-Path -Parent "backend\src\routes\arrendamientos\locations.js"
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
[System.IO.File]::WriteAllText((Resolve-Path ".").Path + "\backend\src\routes\arrendamientos\locations.js", $f3, $utf8NoBom)

# --- frontend/src/pages/arrendamientos/LocationDetalle.jsx ---
$f4 = @'
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, unwrap } from '../../api.js';
import Spinner from '../../components/Spinner.jsx';
import UbicacionMapa from '../../components/UbicacionMapa.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { formatFecha, formatFechaHora } from '../../utils.js';
import CamposForm from './CamposForm.jsx';
import { GRUPOS_LOCATION, ESTATUS_LEASE, CATEGORIAS_DOCUMENTO_LOCATION, valoresIniciales } from './campos.js';

export default function LocationDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { esAdmin } = useAuth();

  const [location, setLocation] = useState(null);
  const [leases, setLeases] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [sharepointConfigurado, setSharepointConfigurado] = useState(true);
  const [comentarios, setComentarios] = useState([]);
  const [brands, setBrands] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [mostrarEditar, setMostrarEditar] = useState(false);
  const [form, setForm] = useState(null);
  const [errorEditar, setErrorEditar] = useState('');
  const [guardandoEditar, setGuardandoEditar] = useState(false);

  const [mostrarNuevoLease, setMostrarNuevoLease] = useState(false);
  const [nuevoLease, setNuevoLease] = useState({ leaseName: '', estatus: 'activo', expirationDate: '' });
  const [errorLease, setErrorLease] = useState('');
  const [guardandoLease, setGuardandoLease] = useState(false);

  const [archivo, setArchivo] = useState(null);
  const [categoriaArchivo, setCategoriaArchivo] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [errorArchivo, setErrorArchivo] = useState('');

  const [comentario, setComentario] = useState('');
  const [enviandoComentario, setEnviandoComentario] = useState(false);

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      const [d, dDocs, dComs, db, dc] = await Promise.all([
        api.get(`/arrendamientos/locations/${id}`),
        api.get(`/arrendamientos/locations/${id}/documentos`),
        api.get(`/arrendamientos/locations/${id}/comentarios`),
        api.get('/arrendamientos/brands'),
        api.get('/arrendamientos/companies'),
      ]);
      setLocation(d.location);
      setLeases(d.leases || []);
      setDocumentos(unwrap(dDocs, 'documentos') || []);
      setSharepointConfigurado(dDocs?.sharepointConfigurado !== false);
      setComentarios(unwrap(dComs, 'comentarios') || []);
      setBrands(unwrap(db, 'brands') || []);
      setCompanies(unwrap(dc, 'companies') || []);
    } catch (err) {
      setError(err.message || 'No se pudo cargar la ubicación.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const opciones = useMemo(() => ({
    brands: brands.map((b) => ({ value: b.id, label: b.nombre })),
    companies: companies.map((c) => ({ value: c.id, label: c.nombre })),
  }), [brands, companies]);

  // Agrupa los archivos por categoría (igual que Leasecake agrupa "Contrato Arrendamiento",
  // "Deposito en Garantia", "Mantenimiento Plaza", "Renta Mensual", etc. en su pestaña Files).
  // El orden sigue CATEGORIAS_DOCUMENTO_LOCATION; solo se muestran los grupos que sí tienen
  // archivos, y cualquier categoría libre/antigua que no esté en el catálogo cae en su propio
  // grupo (o en "Sin categoría" si viene vacía).
  const documentosAgrupados = useMemo(() => {
    const grupos = new Map();
    for (const cat of CATEGORIAS_DOCUMENTO_LOCATION) grupos.set(cat, []);
    for (const d of documentos) {
      const cat = d.categoria || 'Sin categoría';
      if (!grupos.has(cat)) grupos.set(cat, []);
      grupos.get(cat).push(d);
    }
    return Array.from(grupos.entries()).filter(([, items]) => items.length > 0);
  }, [documentos]);

  function abrirEditar() {
    setForm(valoresIniciales(GRUPOS_LOCATION, location));
    setErrorEditar('');
    setMostrarEditar(true);
  }

  async function guardarEdicion(e) {
    e.preventDefault();
    setErrorEditar('');
    setGuardandoEditar(true);
    try {
      const data = await api.patch(`/arrendamientos/locations/${id}`, form);
      setLocation(data.location);
      setMostrarEditar(false);
    } catch (err) {
      setErrorEditar(err.message || 'No se pudo guardar la ubicación.');
    } finally {
      setGuardandoEditar(false);
    }
  }

  async function crearLease(e) {
    e.preventDefault();
    setErrorLease('');
    if (!nuevoLease.expirationDate && nuevoLease.estatus !== 'mes_a_mes') {
      // No es obligatorio, pero se avisa: la mayoría de los leases sí tienen vencimiento.
    }
    setGuardandoLease(true);
    try {
      await api.post('/arrendamientos/leases', { locationId: id, ...nuevoLease });
      setMostrarNuevoLease(false);
      setNuevoLease({ leaseName: '', estatus: 'activo', expirationDate: '' });
      await cargar();
    } catch (err) {
      setErrorLease(err.message || 'No se pudo crear el lease.');
    } finally {
      setGuardandoLease(false);
    }
  }

  async function subirArchivo(e) {
    e.preventDefault();
    setErrorArchivo('');
    if (!archivo) { setErrorArchivo('Selecciona un archivo.'); return; }
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.append('archivo', archivo);
      if (categoriaArchivo) fd.append('categoria', categoriaArchivo);
      await api.post(`/arrendamientos/locations/${id}/documentos`, fd);
      setArchivo(null);
      setCategoriaArchivo('');
      const dDocs = await api.get(`/arrendamientos/locations/${id}/documentos`);
      setDocumentos(unwrap(dDocs, 'documentos') || []);
      setSharepointConfigurado(dDocs?.sharepointConfigurado !== false);
    } catch (err) {
      setErrorArchivo(err.message || 'No se pudo subir el archivo.');
    } finally {
      setSubiendo(false);
    }
  }

  async function borrarArchivo(docId) {
    if (!window.confirm('¿Eliminar este documento de SharePoint?')) return;
    try {
      await api.del(`/arrendamientos/documentos/${docId}`);
      setDocumentos((prev) => prev.filter((d) => d.id !== docId));
    } catch (err) {
      window.alert(err.message || 'No se pudo eliminar el documento.');
    }
  }

  function formatTamano(bytes) {
    if (!bytes && bytes !== 0) return '—';
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function enviarComentario(e) {
    e.preventDefault();
    if (!comentario.trim()) return;
    setEnviandoComentario(true);
    try {
      const data = await api.post(`/arrendamientos/locations/${id}/comentarios`, { comentario });
      setComentarios((prev) => [...prev, data.comentario]);
      setComentario('');
    } catch (err) {
      window.alert(err.message || 'No se pudo enviar el comentario.');
    } finally {
      setEnviandoComentario(false);
    }
  }

  if (cargando) return <Spinner label="Cargando ubicación…" />;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!location) return null;

  return (
    <div>
      <div className="page-header">
        <div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ marginBottom: 10 }}
            onClick={() => navigate('/arrendamientos/ubicaciones')}
          >
            ← Volver a ubicaciones
          </button>
          <h1>{location.nombre}</h1>
          <p className="page-header-sub">
            {location.brandNombre && <>{location.brandNombre} · </>}
            {[location.city, location.state].filter(Boolean).join(', ') || 'Sin dirección registrada'}
          </p>
        </div>
        {esAdmin && <button className="btn btn-secondary" onClick={abrirEditar}>Editar</button>}
      </div>

      <div className="card">
        <div className="card-title">Mapa</div>
        <UbicacionMapa
          latitude={location.latitude}
          longitude={location.longitude}
          nombre={location.nombre}
          direccion={location.fullAddress || [location.address1, location.address2, location.city, location.state].filter(Boolean).join(', ')}
        />
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">{location.squareMeters ?? '—'}</div>
          <div className="stat-label">m² totales</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{location.locationType || '—'}</div>
          <div className="stat-label">Tipo</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{location.companyNombre || '—'}</div>
          <div className="stat-label">Company (tenant)</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{leases.filter((l) => l.estatus === 'activo').length}</div>
          <div className="stat-label">Leases activos</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          Leases
          {esAdmin && (
            <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setMostrarNuevoLease(true)}>
              + Nuevo lease
            </button>
          )}
        </div>
        {leases.length === 0 ? (
          <div className="empty-state">Esta ubicación no tiene leases registrados.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Nombre</th><th>Estatus</th><th>Vence</th><th></th></tr>
              </thead>
              <tbody>
                {leases.map((l) => (
                  <tr key={l.id}>
                    <td>{l.leaseName || '(sin nombre)'}</td>
                    <td><span className={`badge badge-${l.estatus}`}>{l.estatus}</span></td>
                    <td>{formatFecha(l.expirationDate)}</td>
                    <td><Link className="btn btn-secondary btn-sm" to={`/arrendamientos/leases/${l.id}`}>Ver</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Archivos (SharePoint)</div>
        <p className="muted" style={{ marginTop: -6, fontSize: 13 }}>
          Esta lista viene directo de la carpeta de la ubicación en SharePoint (Ubicaciones/{location.nombre}) — subir o
          eliminar aquí sube/elimina el archivo ahí mismo.
        </p>
        {errorArchivo && <div className="alert alert-error">{errorArchivo}</div>}
        {sharepointConfigurado === false && (
          <div className="alert alert-error">
            SharePoint no está configurado en el backend (faltan las variables MS_GRAPH_*/SHAREPOINT_*).
          </div>
        )}
        <form onSubmit={subirArchivo} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <input type="file" onChange={(e) => setArchivo(e.target.files?.[0] || null)} />
          <select
            value={categoriaArchivo}
            onChange={(e) => setCategoriaArchivo(e.target.value)}
            style={{ maxWidth: 220 }}
          >
            <option value="">Sin etiqueta (Contrato Master)</option>
            {CATEGORIAS_DOCUMENTO_LOCATION.filter((c) => c !== 'Contrato Master').map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <button type="submit" className="btn btn-primary btn-sm" disabled={subiendo}>{subiendo ? 'Subiendo…' : 'Subir archivo'}</button>
        </form>
        {documentos.length === 0 ? (
          <div className="empty-state">Sin archivos en SharePoint todavía.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {documentosAgrupados.map(([categoria, items]) => (
              <div key={categoria}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <strong>{categoria}</strong>
                  <span className="tag-pill">{items.length}</span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Archivo</th><th>Tamaño</th><th>Modificado</th><th></th></tr></thead>
                    <tbody>
                      {items.map((d) => (
                        <tr key={d.id}>
                          <td><a href={d.url} target="_blank" rel="noreferrer">{d.nombre}</a></td>
                          <td>{formatTamano(d.tamanoBytes)}</td>
                          <td>{formatFechaHora(d.modificado)}</td>
                          <td>
                            {esAdmin && (
                              <button className="icon-btn" onClick={() => borrarArchivo(d.id)}>Eliminar</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Comentarios</div>
        {comentarios.length === 0 ? (
          <div className="empty-state">Sin comentarios todavía.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
            {comentarios.map((c) => (
              <div key={c.id} style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 8 }}>
                <strong>{c.usuarioNombre}</strong>
                <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>{formatFechaHora(c.createdAt)}</span>
                <div>{c.comentario}</div>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={enviarComentario} style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder="Escribe un comentario…"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={enviandoComentario}>Enviar</button>
        </form>
      </div>

      {mostrarEditar && form && (
        <div className="modal-backdrop" onClick={() => !guardandoEditar && setMostrarEditar(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Editar ubicación</h3>
            {errorEditar && <div className="alert alert-error">{errorEditar}</div>}
            <form onSubmit={guardarEdicion}>
              <CamposForm
                grupos={GRUPOS_LOCATION}
                valores={form}
                opciones={opciones}
                onChange={(k, v) => setForm((prev) => ({ ...prev, [k]: v }))}
              />
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setMostrarEditar(false)} disabled={guardandoEditar}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={guardandoEditar}>{guardandoEditar ? 'Guardando…' : 'Guardar cambios'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {mostrarNuevoLease && (
        <div className="modal-backdrop" onClick={() => !guardandoLease && setMostrarNuevoLease(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Nuevo lease</h3>
            <p className="muted" style={{ marginTop: -6 }}>Después de crearlo, entra a su detalle para llenar el resto de los campos (fechas, renovación, landlord, renta, etc.)</p>
            {errorLease && <div className="alert alert-error">{errorLease}</div>}
            <form onSubmit={crearLease}>
              <div className="field">
                <label htmlFor="nuevo-lease-nombre">Nombre del lease</label>
                <input id="nuevo-lease-nombre" type="text" value={nuevoLease.leaseName} onChange={(e) => setNuevoLease((p) => ({ ...p, leaseName: e.target.value }))} autoFocus />
              </div>
              <div className="field">
                <label htmlFor="nuevo-lease-estatus">Estatus</label>
                <select id="nuevo-lease-estatus" value={nuevoLease.estatus} onChange={(e) => setNuevoLease((p) => ({ ...p, estatus: e.target.value }))}>
                  {ESTATUS_LEASE.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="nuevo-lease-vencimiento">Vencimiento</label>
                <input id="nuevo-lease-vencimiento" type="date" value={nuevoLease.expirationDate} onChange={(e) => setNuevoLease((p) => ({ ...p, expirationDate: e.target.value }))} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setMostrarNuevoLease(false)} disabled={guardandoLease}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={guardandoLease}>{guardandoLease ? 'Creando…' : 'Crear lease'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

'@
$dir = Split-Path -Parent "frontend\src\pages\arrendamientos\LocationDetalle.jsx"
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
[System.IO.File]::WriteAllText((Resolve-Path ".").Path + "\frontend\src\pages\arrendamientos\LocationDetalle.jsx", $f4, $utf8NoBom)

Write-Host "Listo: 4 archivos escritos."
git add backend/src/sharepointUbicaciones.js backend/src/routes/arrendamientos/documentos.js backend/src/routes/arrendamientos/locations.js frontend/src/pages/arrendamientos/LocationDetalle.jsx
git commit -m "Leer/subir los documentos de Ubicaciones directo de SharePoint (sin tabla local)"
git push origin main