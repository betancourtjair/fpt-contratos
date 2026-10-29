// Solicitudes de contrato de Arrendamiento (formulario "Solicitud de contrato de Arrendamiento").
// Quien solicita (cualquier usuario autenticado salvo el rol 'operaciones') llena el formulario y
// adjunta los documentos; le llega a Juridico. Juridico / Cabeza de Juridico / super_admin dan
// seguimiento (estatus, respuesta, documentos de respuesta); solo Cabeza de Juridico (y
// super_admin) asigna a quien de Juridico toma el caso. Quien solicita ve solo las suyas;
// admin, CEO, CFO y Juridico ven todas. Las tablas se crean solas la primera vez (IF NOT EXISTS).
const express = require('express');
const multer = require('multer');
const { query, withTransaction } = require('../../db');
const asyncHandler = require('../../utils/asyncHandler');
const { badRequest, notFound, forbidden } = require('../../utils/errors');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { ROLES_NIVEL_ADMIN } = require('../../utils/roles');
const storageContratos = require('../../storageContratos');
const { enviarCorreo } = require('../../email');
const form = require('../../utils/arrSolicitudForm');

const router = express.Router();
router.use(requireAuth);

const ROLES_GESTION = ['super_admin', 'cabeza_juridico', 'juridico'];
const ROLES_VEN_TODO = [...new Set([...ROLES_NIVEL_ADMIN, 'juridico'])];
const ESTATUS = ['recibida', 'en_proceso', 'atendida'];
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024, files: 30 } });

function normalizarNombresArchivos(req, res, next) {
  for (const f of req.files || []) {
    const utf8 = Buffer.from(f.originalname, 'latin1').toString('utf8');
    if (!utf8.includes('�')) f.originalname = utf8;
  }
  next();
}

let tablasListas = null;
function asegurarTablas() {
  if (!tablasListas) {
    tablasListas = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS arr_solicitudes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        folio TEXT NOT NULL UNIQUE,
        tipo_tramite TEXT NOT NULL,
        arrendador_nombre TEXT NOT NULL,
        inmueble_resumen TEXT,
        datos JSONB NOT NULL DEFAULT '{}'::jsonb,
        estatus TEXT NOT NULL DEFAULT 'recibida' CHECK (estatus IN ('recibida','en_proceso','atendida')),
        respuesta_juridico TEXT,
        asignado_a_id UUID REFERENCES usuarios(id),
        asignado_en TIMESTAMPTZ,
        atendido_por_id UUID REFERENCES usuarios(id),
        atendido_en TIMESTAMPTZ,
        solicitante_id UUID NOT NULL REFERENCES usuarios(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
      await query('CREATE INDEX IF NOT EXISTS idx_arr_solicitudes_estatus ON arr_solicitudes(estatus)');
      await query('CREATE INDEX IF NOT EXISTS idx_arr_solicitudes_solicitante ON arr_solicitudes(solicitante_id)');
      await query(`CREATE TABLE IF NOT EXISTS arr_solicitud_documentos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        solicitud_id UUID NOT NULL REFERENCES arr_solicitudes(id) ON DELETE CASCADE,
        campo TEXT NOT NULL,
        nombre_archivo TEXT NOT NULL,
        ruta_archivo TEXT NOT NULL,
        subido_por_id UUID NOT NULL REFERENCES usuarios(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
      await query('CREATE INDEX IF NOT EXISTS idx_arr_solicitud_docs_solicitud ON arr_solicitud_documentos(solicitud_id)');
    })().catch((err) => { tablasListas = null; throw err; });
  }
  return tablasListas;
}
router.use(asyncHandler(async (req, res, next) => { await asegurarTablas(); next(); }));

const esGestor = (u) => ROLES_GESTION.includes(u.rol);
const venTodo = (u) => ROLES_VEN_TODO.includes(u.rol);
const puedeAsignar = (u) => ['super_admin', 'cabeza_juridico'].includes(u.rol);
const puedeTrabajar = (u, s) => puedeAsignar(u) || s.asignado_a_id === u.id;
const CAMPOS_INTERNOS = ['asignado_a_id', 'asignado_a_nombre', 'asignado_en', 'atendido_por_id', 'atendido_por_nombre'];
function ocultar(obj, campos) { const c = { ...obj }; for (const k of campos) delete c[k]; return c; }
const urlApp = () => (process.env.FRONTEND_URL || 'https://contratos.fpt.com.mx').replace(/\/+$/, '');
function esc(t) { return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
const ETIQUETA_TRAMITE = Object.fromEntries(form.SECCIONES[0].campos[0].opciones.map((o) => [o.value, o.label]));

async function generarFolio(client, anio = new Date().getFullYear()) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`folio-arr-solicitud-${anio}`]);
  const prefijo = `SA-${anio}-`;
  const { rows } = await client.query('SELECT folio FROM arr_solicitudes WHERE folio LIKE $1 ORDER BY folio DESC LIMIT 1', [`${prefijo}%`]);
  let n = 1;
  if (rows.length) { const x = parseInt(rows[0].folio.slice(prefijo.length), 10); if (!Number.isNaN(x)) n = x + 1; }
  return `${prefijo}${String(n).padStart(4, '0')}`;
}

// Definicion del formulario (para que el frontend arme la pantalla).
router.get('/formulario', (req, res) => {
  if (req.usuario.rol === 'operaciones') throw forbidden('Sin acceso.');
  res.json({ secciones: form.SECCIONES, etiquetasTramite: ETIQUETA_TRAMITE });
});

router.get('/juridicos', requireRole('super_admin', 'cabeza_juridico'), asyncHandler(async (req, res) => {
  const { rows } = await query(`SELECT id, nombre, email, rol FROM usuarios WHERE activo = true AND rol IN ('juridico','cabeza_juridico') ORDER BY nombre ASC`);
  res.json({ usuarios: rows });
}));

router.get('/', asyncHandler(async (req, res) => {
  const { estatus, texto, tipoTramite } = req.query;
  const cond = []; const val = []; let i = 1;
  if (!venTodo(req.usuario)) { cond.push(`s.solicitante_id = $${i++}`); val.push(req.usuario.id); }
  if (estatus) { cond.push(`s.estatus = $${i++}`); val.push(estatus); }
  if (tipoTramite) { cond.push(`s.tipo_tramite = $${i++}`); val.push(tipoTramite); }
  if (texto) {
    cond.push(`(s.folio ILIKE $${i} OR s.arrendador_nombre ILIKE $${i} OR s.inmueble_resumen ILIKE $${i} OR s.datos::text ILIKE $${i})`);
    val.push(`%${texto}%`); i++;
  }
  const { rows } = await query(
    `SELECT s.id, s.folio, s.tipo_tramite, s.arrendador_nombre, s.inmueble_resumen, s.estatus, s.created_at,
            s.asignado_a_id, (SELECT nombre FROM usuarios WHERE id = s.asignado_a_id) AS asignado_a_nombre,
            s.solicitante_id, u.nombre AS solicitante_nombre
     FROM arr_solicitudes s JOIN usuarios u ON u.id = s.solicitante_id
     ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''} ORDER BY s.created_at DESC`, val);
  res.json({ solicitudes: venTodo(req.usuario) ? rows : rows.map((r) => ocultar(r, CAMPOS_INTERNOS)) });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT s.*, u.nombre AS solicitante_nombre, u.email AS solicitante_email,
            ua.nombre AS atendido_por_nombre, uas.nombre AS asignado_a_nombre
     FROM arr_solicitudes s JOIN usuarios u ON u.id = s.solicitante_id
     LEFT JOIN usuarios ua ON ua.id = s.atendido_por_id LEFT JOIN usuarios uas ON uas.id = s.asignado_a_id
     WHERE s.id = $1`, [req.params.id]);
  const s = rows[0];
  if (!s) throw notFound('Solicitud no encontrada.');
  if (!venTodo(req.usuario) && s.solicitante_id !== req.usuario.id) throw forbidden('Solo puedes ver las solicitudes que tu capturaste.');
  const { rows: docs } = await query(
    `SELECT d.*, us.nombre AS subido_por_nombre FROM arr_solicitud_documentos d
     LEFT JOIN usuarios us ON us.id = d.subido_por_id WHERE d.solicitud_id = $1 ORDER BY d.created_at ASC`, [s.id]);
  const interno = venTodo(req.usuario);
  res.json({
    solicitud: interno ? s : ocultar(s, CAMPOS_INTERNOS),
    documentos: docs.map((d) => { const x = { ...d, url: storageContratos.getUrl(d.ruta_archivo) }; return interno ? x : ocultar(x, ['subido_por_id', 'subido_por_nombre']); }),
  });
}));

// POST multipart: datos (JSON) + un archivo por documento (el nombre del campo es el id del documento)
router.post('/', upload.any(), normalizarNombresArchivos, asyncHandler(async (req, res) => {
  if (req.usuario.rol === 'operaciones') throw forbidden('Sin acceso.');
  let entrada = {};
  try { entrada = req.body?.datos ? JSON.parse(req.body.datos) : {}; } catch { throw badRequest('datos debe ser un JSON valido.'); }
  const archivos = (req.files || []).filter((f) => form.IDS_DOCUMENTOS.includes(f.fieldname));
  const { datos, errores } = form.validar(entrada, [...new Set(archivos.map((f) => f.fieldname))]);
  if (errores.length) throw badRequest(errores.join(' '));

  const arrendador = form.nombreArrendador(datos);
  const inmueble = [datos.inmuebleNombre, datos.inmuebleCalle && `${datos.inmuebleCalle} ${datos.inmuebleNumero || ''}`.trim(), datos.inmuebleMunicipio, datos.inmuebleEstado].filter(Boolean).join(', ');
  const etiquetas = Object.fromEntries(form.SECCIONES.flatMap((sec) => (sec.documentos || []).map((d) => [d.id, d.label])));

  const solicitud = await withTransaction(async (client) => {
    const folio = await generarFolio(client);
    const { rows } = await client.query(
      `INSERT INTO arr_solicitudes (folio, tipo_tramite, arrendador_nombre, inmueble_resumen, datos, solicitante_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [folio, datos.tipoTramite, arrendador, inmueble, JSON.stringify(datos), req.usuario.id]);
    const creada = rows[0];
    for (const a of archivos) {
      const ruta = await storageContratos.save({
        buffer: a.buffer, originalname: a.originalname, contratoId: creada.id, carpetaBase: 'arrendamientos-solicitudes',
        tipoContratoNombre: 'Arrendamientos - Solicitudes', folio, tituloContrato: ETIQUETA_TRAMITE[datos.tipoTramite] || datos.tipoTramite,
        contraparteNombre: arrendador, estatusLabel: 'Recibida',
      });
      await client.query(
        'INSERT INTO arr_solicitud_documentos (solicitud_id, campo, nombre_archivo, ruta_archivo, subido_por_id) VALUES ($1,$2,$3,$4,$5)',
        [creada.id, a.fieldname, a.originalname, ruta, req.usuario.id]);
    }
    return creada;
  });

  try {
    const { rows: dest } = await query(`SELECT email FROM usuarios WHERE activo = true AND rol IN ('juridico','cabeza_juridico') AND email IS NOT NULL`);
    const correos = dest.map((d) => d.email).join(',');
    if (correos) {
      await enviarCorreo(correos,
        `[Arrendamientos] Nueva solicitud ${solicitud.folio} - ${ETIQUETA_TRAMITE[datos.tipoTramite]} - ${arrendador}`,
        `<p>Se registro una nueva solicitud de contrato de Arrendamiento.</p>
         <p><strong>Folio:</strong> ${esc(solicitud.folio)}<br><strong>Tramite:</strong> ${esc(ETIQUETA_TRAMITE[datos.tipoTramite])}<br>
         <strong>Arrendador:</strong> ${esc(arrendador)}<br><strong>Inmueble:</strong> ${esc(inmueble)}<br>
         <strong>Solicitante:</strong> ${esc(req.usuario.nombre)}<br><strong>Documentos adjuntos:</strong> ${archivos.length}</p>
         <p><a href="${urlApp()}/#/arrendamientos/solicitudes/${solicitud.id}">Ver la solicitud en la plataforma</a></p>`);
    }
  } catch (err) { console.error('[arr-solicitudes] No se pudo enviar el aviso por correo:', err.message); }

  res.status(201).json({ solicitud });
}));

router.patch('/:id', requireRole(...ROLES_GESTION), asyncHandler(async (req, res) => {
  const { estatus, respuestaJuridico, asignadoAId } = req.body || {};
  if (estatus !== undefined && !ESTATUS.includes(estatus)) throw badRequest(`estatus invalido. Valores permitidos: ${ESTATUS.join(', ')}.`);
  if (estatus === undefined && respuestaJuridico === undefined && asignadoAId === undefined) throw badRequest('Envia estatus, respuestaJuridico y/o asignadoAId.');
  const { rows: act } = await query('SELECT * FROM arr_solicitudes WHERE id = $1', [req.params.id]);
  const actual = act[0];
  if (!actual) throw notFound('Solicitud no encontrada.');
  const sets = ['updated_at = now()']; const val = []; let i = 1; let nuevo = null;
  if (asignadoAId !== undefined) {
    if (!puedeAsignar(req.usuario)) throw forbidden('Solo Cabeza de Juridico puede asignar el caso.');
    if (asignadoAId === null || asignadoAId === '') sets.push('asignado_a_id = NULL', 'asignado_en = NULL');
    else {
      const { rows } = await query(`SELECT id, nombre, email FROM usuarios WHERE id = $1 AND activo = true AND rol IN ('juridico','cabeza_juridico')`, [asignadoAId]);
      if (!rows[0]) throw badRequest('El usuario asignado debe ser una persona activa de Juridico.');
      nuevo = rows[0];
      sets.push(`asignado_a_id = $${i++}`, 'asignado_en = now()'); val.push(nuevo.id);
      if (actual.estatus === 'recibida' && estatus === undefined) sets.push("estatus = 'en_proceso'");
    }
  }
  if (estatus !== undefined || respuestaJuridico !== undefined) {
    if (!puedeTrabajar(req.usuario, actual)) throw forbidden('Este caso esta asignado a otra persona de Juridico. Pide a Cabeza de Juridico que te lo asigne.');
  }
  if (estatus !== undefined) {
    sets.push(`estatus = $${i++}`); val.push(estatus);
    if (estatus === 'atendida') { sets.push(`atendido_por_id = $${i++}`, 'atendido_en = now()'); val.push(req.usuario.id); }
  }
  if (respuestaJuridico !== undefined) { sets.push(`respuesta_juridico = $${i++}`); val.push(String(respuestaJuridico).trim() || null); }
  val.push(req.params.id);
  const { rows } = await query(`UPDATE arr_solicitudes SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, val);
  if (nuevo && nuevo.email && nuevo.id !== req.usuario.id) {
    try {
      await enviarCorreo(nuevo.email, `[Arrendamientos] Se te asigno la solicitud ${actual.folio}`,
        `<p>${esc(req.usuario.nombre)} te asigno una solicitud de contrato de Arrendamiento.</p>
         <p><strong>Folio:</strong> ${esc(actual.folio)}<br><strong>Arrendador:</strong> ${esc(actual.arrendador_nombre)}</p>
         <p><a href="${urlApp()}/#/arrendamientos/solicitudes/${actual.id}">Abrir la solicitud en la plataforma</a></p>`);
    } catch (err) { console.error('[arr-solicitudes] No se pudo avisar al asignado:', err.message); }
  }
  res.json({ solicitud: { ...rows[0], asignado_a_nombre: nuevo?.nombre } });
}));

// Juridico adjunta documentos de respuesta (campo 'respuesta').
router.post('/:id/documentos', requireRole(...ROLES_GESTION), upload.array('archivos', 8), normalizarNombresArchivos, asyncHandler(async (req, res) => {
  const archivos = req.files || [];
  if (!archivos.length) throw badRequest('Adjunta al menos un archivo.');
  const { rows } = await query('SELECT * FROM arr_solicitudes WHERE id = $1', [req.params.id]);
  const s = rows[0];
  if (!s) throw notFound('Solicitud no encontrada.');
  if (!puedeTrabajar(req.usuario, s)) throw forbidden('Este caso esta asignado a otra persona de Juridico.');
  for (const a of archivos) {
    const ruta = await storageContratos.save({
      buffer: a.buffer, originalname: a.originalname, contratoId: s.id, carpetaBase: 'arrendamientos-solicitudes',
      tipoContratoNombre: 'Arrendamientos - Solicitudes', folio: s.folio, tituloContrato: ETIQUETA_TRAMITE[s.tipo_tramite] || s.tipo_tramite,
      contraparteNombre: s.arrendador_nombre, estatusLabel: 'Respuesta de Juridico',
    });
    await query(`INSERT INTO arr_solicitud_documentos (solicitud_id, campo, nombre_archivo, ruta_archivo, subido_por_id) VALUES ($1,'respuesta',$2,$3,$4)`,
      [s.id, a.originalname, ruta, req.usuario.id]);
  }
  await query('UPDATE arr_solicitudes SET updated_at = now() WHERE id = $1', [s.id]);
  const { rows: docs } = await query(
    `SELECT d.*, us.nombre AS subido_por_nombre FROM arr_solicitud_documentos d LEFT JOIN usuarios us ON us.id = d.subido_por_id
     WHERE d.solicitud_id = $1 ORDER BY d.created_at ASC`, [s.id]);
  res.status(201).json({ documentos: docs.map((d) => ({ ...d, url: storageContratos.getUrl(d.ruta_archivo) })) });
}));

module.exports = router;
