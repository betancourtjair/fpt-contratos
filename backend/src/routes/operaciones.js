// Modulo "Operaciones": solicitudes de Operaciones hacia Juridico.
//
//   Atencion a Socios      -> baja_socio, baja_invitado
//   Atencion a Autoridades -> citatorio_profeco, solicitud_fiscalia
//
// Quien captura es el rol 'operaciones' (solo ve sus propias solicitudes); Juridico, Cabeza de
// Juridico y super_admin ven todas y les dan seguimiento (cambian el estatus). Al crear una
// solicitud se avisa por correo a Juridico y a Cabeza de Juridico. Los archivos adjuntos
// (evidencias, citatorios, oficios) se guardan igual que los documentos de contratos
// (storageContratos: disco o SharePoint segun CONTRATOS_STORAGE_DRIVER).
const express = require('express');
const multer = require('multer');
const { query, withTransaction } = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { badRequest, notFound, forbidden } = require('../utils/errors');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES_MODULO_OPERACIONES, ROLES_GESTION_OPERACIONES } = require('../utils/roles');
const storageContratos = require('../storageContratos');
const { enviarCorreo } = require('../email');

const router = express.Router();
router.use(requireAuth, requireRole(...ROLES_MODULO_OPERACIONES));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024, files: 8 } });

// multer entrega originalname como latin1: un archivo "Cómo.pptx" llega como "CÃ³mo.pptx".
// Se reinterpreta como UTF-8 cuando el resultado es valido.
function normalizarNombresArchivos(req, res, next) {
  for (const f of req.files || []) {
    const utf8 = Buffer.from(f.originalname, 'latin1').toString('utf8');
    if (!utf8.includes('\uFFFD')) f.originalname = utf8;
  }
  next();
}

const ESTATUS = ['recibida', 'en_proceso', 'atendida'];

// Definicion de cada formulario: que campos de `datos` son obligatorios, en que campo se
// guardan los archivos adjuntos y si adjuntar es obligatorio.
const TIPOS = {
  baja_socio: {
    categoria: 'socios',
    label: 'Baja extraordinaria de socio',
    campoArchivos: 'evidencia',
    archivosRequeridos: false,
    requeridos: { socioNombre: 'Socio', socioNumero: 'No. de socio', hechos: 'Hechos que motivan la baja extraordinaria' },
    opcionales: ['comentarios'],
    validaciones: true,
  },
  baja_invitado: {
    categoria: 'socios',
    label: 'Baja extraordinaria de invitado',
    campoArchivos: 'evidencia',
    archivosRequeridos: false,
    requeridos: {
      socioTitularNombre: 'Socio titular',
      socioNumero: 'No. de socio',
      invitadoNombre: 'Invitado',
      hechos: 'Hechos que motivan la baja extraordinaria',
    },
    opcionales: ['comentarios'],
    validaciones: true,
  },
  citatorio_profeco: {
    categoria: 'autoridades',
    label: 'Citatorio para audiencia de conciliacion ante PROFECO',
    campoArchivos: 'citatorio',
    archivosRequeridos: true,
    requeridos: { fechaRecepcion: 'Fecha de recepcion', antecedentes: 'Antecedentes de la queja' },
    opcionales: [],
    validaciones: false,
  },
  solicitud_fiscalia: {
    categoria: 'autoridades',
    label: 'Solicitud de videograbaciones y/o informacion de Fiscalia o Ministerio Publico',
    campoArchivos: 'oficio',
    archivosRequeridos: true,
    requeridos: { disponibilidadVideo: 'Disponibilidad de videograbaciones' },
    opcionales: ['comentarios'],
    validaciones: false,
  },
};

const VALIDACIONES_BAJAS = ['autorizacionGerenteRegional', 'informacionCompleta', 'evidenciasAdjuntas'];

const COLUMNAS_LISTA = `s.id, s.folio, s.categoria, s.tipo, s.estatus, s.created_at, s.updated_at, s.asignado_a_id,
  (SELECT nombre FROM usuarios WHERE id = s.asignado_a_id) AS asignado_a_nombre,
  s.gerente_nombre, s.club_id, cl.nombre AS club_nombre, s.solicitante_id, u.nombre AS solicitante_nombre`;

function esGestor(usuario) {
  return ROLES_GESTION_OPERACIONES.includes(usuario.rol);
}

// Solo Cabeza de Juridico (y super_admin) asigna quien de Juridico toma el caso.
function puedeAsignar(usuario) {
  return ['super_admin', 'cabeza_juridico'].includes(usuario.rol);
}

// Cabeza/super_admin trabajan cualquier caso; una persona de Juridico solo los que le asignaron.
function puedeTrabajar(usuario, solicitud) {
  return puedeAsignar(usuario) || solicitud.asignado_a_id === usuario.id;
}

const MAX_BYTES_ADJUNTOS_CORREO = 3 * 1024 * 1024; // Graph sendMail acepta ~4 MB por peticion

function urlApp() {
  return (process.env.FRONTEND_URL || 'https://contratos.fpt.com.mx').replace(/\/+$/, '');
}

async function generarFolioOperaciones(client, anio = new Date().getFullYear()) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`folio-operaciones-${anio}`]);
  const prefijo = `OP-${anio}-`;
  const { rows } = await client.query(
    `SELECT folio FROM operaciones_solicitudes WHERE folio LIKE $1 ORDER BY folio DESC LIMIT 1`,
    [`${prefijo}%`]
  );
  let siguiente = 1;
  if (rows.length > 0) {
    const numero = parseInt(rows[0].folio.slice(prefijo.length), 10);
    if (!Number.isNaN(numero)) siguiente = numero + 1;
  }
  return `${prefijo}${String(siguiente).padStart(4, '0')}`;
}

function parseJsonCampo(valor, nombre) {
  if (valor === undefined || valor === null || valor === '') return {};
  if (typeof valor === 'object') return valor;
  try {
    const parsed = JSON.parse(valor);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // cae al error de abajo
  }
  throw badRequest(`${nombre} debe ser un JSON valido.`);
}

function escaparHtml(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// GET /api/operaciones/clubes - catalogo de clubes activos (solo id y nombre) para el formulario.
// Va aqui y no en /api/clubes porque el rol 'operaciones' no tiene acceso al resto de la API.
router.get(
  '/clubes',
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT id, nombre FROM clubes WHERE activo = true ORDER BY nombre ASC');
    res.json({ clubes: rows });
  })
);

// GET /api/operaciones/solicitudes?tipo=&categoria=&estatus=&clubId=&texto=
router.get(
  '/solicitudes',
  asyncHandler(async (req, res) => {
    const { tipo, categoria, estatus, clubId, texto } = req.query;
    const condiciones = [];
    const valores = [];
    let i = 1;

    // El rol 'operaciones' solo ve lo que el mismo capturo; Juridico/admin ven todo.
    if (!esGestor(req.usuario)) {
      condiciones.push(`s.solicitante_id = $${i++}`);
      valores.push(req.usuario.id);
    }
    if (tipo) { condiciones.push(`s.tipo = $${i++}`); valores.push(tipo); }
    if (categoria) { condiciones.push(`s.categoria = $${i++}`); valores.push(categoria); }
    if (estatus) { condiciones.push(`s.estatus = $${i++}`); valores.push(estatus); }
    if (clubId) { condiciones.push(`s.club_id = $${i++}`); valores.push(clubId); }
    if (texto) {
      condiciones.push(`(s.folio ILIKE $${i} OR cl.nombre ILIKE $${i} OR s.gerente_nombre ILIKE $${i} OR s.datos::text ILIKE $${i})`);
      valores.push(`%${texto}%`);
      i++;
    }

    const { rows } = await query(
      `SELECT ${COLUMNAS_LISTA}
       FROM operaciones_solicitudes s
       JOIN clubes cl ON cl.id = s.club_id
       JOIN usuarios u ON u.id = s.solicitante_id
       ${condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : ''}
       ORDER BY s.created_at DESC`,
      valores
    );
    res.json({ solicitudes: rows });
  })
);

// GET /api/operaciones/solicitudes/:id
router.get(
  '/solicitudes/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT s.*, cl.nombre AS club_nombre, u.nombre AS solicitante_nombre, u.email AS solicitante_email,
              ua.nombre AS atendido_por_nombre, uas.nombre AS asignado_a_nombre
       FROM operaciones_solicitudes s
       JOIN clubes cl ON cl.id = s.club_id
       JOIN usuarios u ON u.id = s.solicitante_id
       LEFT JOIN usuarios ua ON ua.id = s.atendido_por_id
       LEFT JOIN usuarios uas ON uas.id = s.asignado_a_id
       WHERE s.id = $1`,
      [req.params.id]
    );
    const solicitud = rows[0];
    if (!solicitud) throw notFound('Solicitud no encontrada.');
    if (!esGestor(req.usuario) && solicitud.solicitante_id !== req.usuario.id) {
      throw forbidden('Solo puedes ver las solicitudes que tu capturaste.');
    }
    const { rows: docs } = await query(
      `SELECT d.*, us.nombre AS subido_por_nombre
       FROM operaciones_documentos d
       LEFT JOIN usuarios us ON us.id = d.subido_por_id
       WHERE d.solicitud_id = $1 ORDER BY d.created_at ASC`,
      [solicitud.id]
    );
    res.json({
      solicitud,
      documentos: docs.map((d) => ({ ...d, url: storageContratos.getUrl(d.ruta_archivo) })),
    });
  })
);

// POST /api/operaciones/solicitudes (multipart/form-data)
//   campos: tipo, clubId, gerenteNombre, datos (JSON), validaciones (JSON), archivos (0..8)
router.post(
  '/solicitudes',
  upload.array('archivos', 8),
  normalizarNombresArchivos,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const def = TIPOS[body.tipo];
    if (!def) throw badRequest(`tipo invalido. Valores permitidos: ${Object.keys(TIPOS).join(', ')}.`);

    const gerenteNombre = String(body.gerenteNombre || '').trim();
    if (!gerenteNombre) throw badRequest('Gerente / Subgerente es requerido.');
    if (!body.clubId) throw badRequest('Club es requerido.');

    const datosEntrada = parseJsonCampo(body.datos, 'datos');
    const datos = {};
    for (const [campo, etiqueta] of Object.entries(def.requeridos)) {
      const valor = String(datosEntrada[campo] ?? '').trim();
      if (!valor) throw badRequest(`${etiqueta} es requerido.`);
      datos[campo] = valor;
    }
    for (const campo of def.opcionales) {
      const valor = String(datosEntrada[campo] ?? '').trim();
      if (valor) datos[campo] = valor;
    }

    if (body.tipo === 'solicitud_fiscalia') {
      if (!['si', 'no'].includes(datos.disponibilidadVideo)) {
        throw badRequest('Disponibilidad de videograbaciones debe ser "si" o "no".');
      }
      if (datos.disponibilidadVideo === 'no' && !datos.comentarios) {
        throw badRequest('Si no cuentas con las videograbaciones o la informacion, indica el motivo en comentarios adicionales.');
      }
    }
    if (body.tipo === 'citatorio_profeco' && Number.isNaN(Date.parse(datos.fechaRecepcion))) {
      throw badRequest('Fecha de recepcion invalida.');
    }

    let validaciones = {};
    if (def.validaciones) {
      const entrada = parseJsonCampo(body.validaciones, 'validaciones');
      for (const v of VALIDACIONES_BAJAS) {
        if (entrada[v] !== true && entrada[v] !== 'true') {
          throw badRequest('Debes marcar las tres validaciones antes de enviar la solicitud.');
        }
        validaciones[v] = true;
      }
    }

    const archivos = req.files || [];
    if (def.archivosRequeridos && archivos.length === 0) {
      throw badRequest(
        body.tipo === 'citatorio_profeco'
          ? 'Adjunta el citatorio completo notificado por PROFECO, escaneado.'
          : 'Adjunta el oficio de solicitud completo, escaneado.'
      );
    }

    const { rows: clubRows } = await query('SELECT id, nombre FROM clubes WHERE id = $1 AND activo = true', [body.clubId]);
    if (!clubRows[0]) throw badRequest('El club seleccionado no existe o esta inactivo.');
    const club = clubRows[0];

    const solicitud = await withTransaction(async (client) => {
      const folio = await generarFolioOperaciones(client);
      const { rows } = await client.query(
        `INSERT INTO operaciones_solicitudes
           (folio, categoria, tipo, club_id, gerente_nombre, datos, validaciones, solicitante_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [folio, def.categoria, body.tipo, club.id, gerenteNombre, JSON.stringify(datos), JSON.stringify(validaciones), req.usuario.id]
      );
      const creada = rows[0];

      for (const archivo of archivos) {
        const ruta = await storageContratos.save({
          buffer: archivo.buffer,
          originalname: archivo.originalname,
          contratoId: creada.id,
          carpetaBase: 'operaciones',
          tipoContratoNombre: `Operaciones - ${def.categoria === 'socios' ? 'Atencion a Socios' : 'Atencion a Autoridades'}`,
          folio,
          tituloContrato: def.label,
          contraparteNombre: club.nombre,
          estatusLabel: 'Recibida',
        });
        await client.query(
          `INSERT INTO operaciones_documentos (solicitud_id, campo, nombre_archivo, ruta_archivo, subido_por_id)
           VALUES ($1,$2,$3,$4,$5)`,
          [creada.id, def.campoArchivos, archivo.originalname, ruta, req.usuario.id]
        );
      }
      return creada;
    });

    // Aviso por correo a Juridico. Un fallo de correo nunca debe tumbar la solicitud.
    try {
      const { rows: destinatarios } = await query(
        `SELECT email FROM usuarios WHERE activo = true AND rol IN ('juridico', 'cabeza_juridico') AND email IS NOT NULL`
      );
      const correos = destinatarios.map((d) => d.email).join(',');
      if (correos) {
        const urlApp = (process.env.FRONTEND_URL || 'https://contratos.fpt.com.mx').replace(/\/+$/, '');
        await enviarCorreo(
          correos,
          `[Operaciones] Nueva solicitud ${solicitud.folio} - ${def.label} - ${club.nombre}`,
          `<p>Operaciones registro una nueva solicitud para Juridico.</p>
           <p><strong>Folio:</strong> ${escaparHtml(solicitud.folio)}<br>
              <strong>Tipo:</strong> ${escaparHtml(def.label)}<br>
              <strong>Club:</strong> ${escaparHtml(club.nombre)}<br>
              <strong>Gerente / Subgerente:</strong> ${escaparHtml(gerenteNombre)}<br>
              <strong>Capturada por:</strong> ${escaparHtml(req.usuario.nombre)}</p>
           <p><a href="${urlApp}/#/operaciones/solicitudes/${solicitud.id}">Ver la solicitud en la plataforma</a></p>`
        );
      }
    } catch (err) {
      console.error('[operaciones] No se pudo enviar el aviso por correo:', err.message);
    }

    res.status(201).json({ solicitud });
  })
);

// GET /api/operaciones/juridicos - personas de Juridico a las que se puede asignar un caso.
router.get(
  '/juridicos',
  requireRole('super_admin', 'cabeza_juridico'),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT id, nombre, email, rol FROM usuarios
       WHERE activo = true AND rol IN ('juridico', 'cabeza_juridico')
       ORDER BY nombre ASC`
    );
    res.json({ usuarios: rows });
  })
);

// PATCH /api/operaciones/solicitudes/:id
//   asignadoAId (solo Cabeza de Juridico / super_admin; null quita la asignacion)
//   estatus, respuestaJuridico (Cabeza/super_admin, o la persona de Juridico asignada)
router.patch(
  '/solicitudes/:id',
  requireRole(...ROLES_GESTION_OPERACIONES),
  asyncHandler(async (req, res) => {
    const { estatus, respuestaJuridico, asignadoAId } = req.body || {};
    if (estatus !== undefined && !ESTATUS.includes(estatus)) {
      throw badRequest(`estatus invalido. Valores permitidos: ${ESTATUS.join(', ')}.`);
    }
    if (estatus === undefined && respuestaJuridico === undefined && asignadoAId === undefined) {
      throw badRequest('Envia estatus, respuestaJuridico y/o asignadoAId.');
    }

    const { rows: actuales } = await query('SELECT * FROM operaciones_solicitudes WHERE id = $1', [req.params.id]);
    const actual = actuales[0];
    if (!actual) throw notFound('Solicitud no encontrada.');

    const sets = ['updated_at = now()'];
    const valores = [];
    let i = 1;
    let nuevoAsignado = null;

    if (asignadoAId !== undefined) {
      if (!puedeAsignar(req.usuario)) {
        throw forbidden('Solo Cabeza de Juridico puede asignar el caso.');
      }
      if (asignadoAId === null || asignadoAId === '') {
        sets.push('asignado_a_id = NULL', 'asignado_en = NULL');
      } else {
        const { rows } = await query(
          `SELECT id, nombre, email FROM usuarios
           WHERE id = $1 AND activo = true AND rol IN ('juridico', 'cabeza_juridico')`,
          [asignadoAId]
        );
        if (!rows[0]) throw badRequest('El usuario asignado debe ser una persona activa de Juridico.');
        nuevoAsignado = rows[0];
        sets.push(`asignado_a_id = $${i++}`, 'asignado_en = now()');
        valores.push(nuevoAsignado.id);
        // Al tomar el caso deja de estar "recibida".
        if (actual.estatus === 'recibida' && estatus === undefined) sets.push("estatus = 'en_proceso'");
      }
    }

    if (estatus !== undefined || respuestaJuridico !== undefined) {
      if (!puedeTrabajar(req.usuario, actual)) {
        throw forbidden('Este caso esta asignado a otra persona de Juridico. Pide a Cabeza de Juridico que te lo asigne.');
      }
    }
    if (estatus !== undefined) {
      sets.push(`estatus = $${i++}`);
      valores.push(estatus);
      if (estatus === 'atendida') {
        sets.push(`atendido_por_id = $${i++}`, 'atendido_en = now()');
        valores.push(req.usuario.id);
      }
    }
    if (respuestaJuridico !== undefined) {
      sets.push(`respuesta_juridico = $${i++}`);
      valores.push(String(respuestaJuridico).trim() || null);
    }
    valores.push(req.params.id);
    const { rows } = await query(
      `UPDATE operaciones_solicitudes SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      valores
    );

    // Aviso a quien toma el caso (si no se lo asigno a si mismo). Un fallo de correo no tumba el cambio.
    if (nuevoAsignado && nuevoAsignado.email && nuevoAsignado.id !== req.usuario.id) {
      try {
        await enviarCorreo(
          nuevoAsignado.email,
          `[Operaciones] Se te asigno la solicitud ${actual.folio}`,
          `<p>${escaparHtml(req.usuario.nombre)} te asigno una solicitud de Operaciones.</p>
           <p><strong>Folio:</strong> ${escaparHtml(actual.folio)}<br>
              <strong>Tipo:</strong> ${escaparHtml(TIPOS[actual.tipo]?.label || actual.tipo)}</p>
           <p><a href="${urlApp()}/#/operaciones/solicitudes/${actual.id}">Abrir la solicitud en la plataforma</a></p>`
        );
      } catch (err) {
        console.error('[operaciones] No se pudo avisar al asignado:', err.message);
      }
    }

    res.json({ solicitud: { ...rows[0], asignado_a_nombre: nuevoAsignado?.nombre } });
  })
);

// POST /api/operaciones/solicitudes/:id/documentos (multipart: archivos 1..8, notificar, mensaje)
// Juridico adjunta archivos de respuesta (campo 'respuesta'). Con notificar=true se manda correo a
// quien capturo la solicitud con los archivos adjuntos (para imprimirlos); si pesan mas de ~3 MB
// el correo lleva solo la liga a la plataforma.
router.post(
  '/solicitudes/:id/documentos',
  requireRole(...ROLES_GESTION_OPERACIONES),
  upload.array('archivos', 8),
  normalizarNombresArchivos,
  asyncHandler(async (req, res) => {
    const archivos = req.files || [];
    if (archivos.length === 0) throw badRequest('Adjunta al menos un archivo.');
    const { rows } = await query(
      `SELECT s.*, cl.nombre AS club_nombre, u.nombre AS solicitante_nombre, u.email AS solicitante_email
       FROM operaciones_solicitudes s
       JOIN clubes cl ON cl.id = s.club_id
       JOIN usuarios u ON u.id = s.solicitante_id
       WHERE s.id = $1`,
      [req.params.id]
    );
    const solicitud = rows[0];
    if (!solicitud) throw notFound('Solicitud no encontrada.');
    if (!puedeTrabajar(req.usuario, solicitud)) {
      throw forbidden('Este caso esta asignado a otra persona de Juridico.');
    }
    const def = TIPOS[solicitud.tipo];

    for (const archivo of archivos) {
      const ruta = await storageContratos.save({
        buffer: archivo.buffer,
        originalname: archivo.originalname,
        contratoId: solicitud.id,
        carpetaBase: 'operaciones',
        tipoContratoNombre: `Operaciones - ${solicitud.categoria === 'socios' ? 'Atencion a Socios' : 'Atencion a Autoridades'}`,
        folio: solicitud.folio,
        tituloContrato: def?.label || solicitud.tipo,
        contraparteNombre: solicitud.club_nombre,
        estatusLabel: 'Respuesta de Juridico',
      });
      await query(
        `INSERT INTO operaciones_documentos (solicitud_id, campo, nombre_archivo, ruta_archivo, subido_por_id)
         VALUES ($1,'respuesta',$2,$3,$4)`,
        [solicitud.id, archivo.originalname, ruta, req.usuario.id]
      );
    }
    await query('UPDATE operaciones_solicitudes SET updated_at = now() WHERE id = $1', [solicitud.id]);

    const notificar = ['true', '1', 'on', true].includes(req.body?.notificar);
    let notificado = false;
    let adjuntadoEnCorreo = false;
    if (notificar && solicitud.solicitante_email) {
      try {
        const total = archivos.reduce((n, a) => n + a.size, 0);
        adjuntadoEnCorreo = total <= MAX_BYTES_ADJUNTOS_CORREO;
        const mensaje = String(req.body?.mensaje || '').trim();
        const nombres = archivos.map((a) => `<li>${escaparHtml(a.originalname)}</li>`).join('');
        const r = await enviarCorreo(
          solicitud.solicitante_email,
          `[Operaciones] Juridico adjunto documentos a tu solicitud ${solicitud.folio}`,
          `<p>${escaparHtml(req.usuario.nombre)} (Juridico) adjunto documentos a tu solicitud.</p>
           <p><strong>Folio:</strong> ${escaparHtml(solicitud.folio)}<br>
              <strong>Tipo:</strong> ${escaparHtml(def?.label || solicitud.tipo)}<br>
              <strong>Club:</strong> ${escaparHtml(solicitud.club_nombre)}</p>
           ${mensaje ? `<p><strong>Mensaje de Juridico:</strong><br>${escaparHtml(mensaje).replace(/\n/g, '<br>')}</p>` : ''}
           <p><strong>Documentos:</strong></p><ul>${nombres}</ul>
           <p>${adjuntadoEnCorreo
             ? 'Los documentos van adjuntos a este correo para que puedas imprimirlos.'
             : 'Por su tamano no se adjuntaron al correo: descargalos desde la plataforma.'}</p>
           <p><a href="${urlApp()}/#/operaciones/solicitudes/${solicitud.id}">Ver la solicitud en la plataforma</a></p>`,
          adjuntadoEnCorreo
            ? archivos.map((a) => ({ nombre: a.originalname, contentType: a.mimetype, buffer: a.buffer }))
            : []
        );
        notificado = r?.enviado === true || r?.modo === 'dev';
      } catch (err) {
        console.error('[operaciones] No se pudo notificar al solicitante:', err.message);
      }
    }

    const { rows: docs } = await query(
      `SELECT d.*, us.nombre AS subido_por_nombre FROM operaciones_documentos d
       LEFT JOIN usuarios us ON us.id = d.subido_por_id
       WHERE d.solicitud_id = $1 ORDER BY d.created_at ASC`,
      [solicitud.id]
    );
    res.status(201).json({
      documentos: docs.map((d) => ({ ...d, url: storageContratos.getUrl(d.ruta_archivo) })),
      notificado,
      adjuntadoEnCorreo,
    });
  })
);

module.exports = router;
