// Lógica de negocio de la integración con doc2sign: enviar un documento del expediente a
// firma, revisar su estatus (a mano, por webhook, o por el job periódico) y, cuando ya quedó
// firmado, descargarlo y agregarlo al expediente como nueva versión.
//
// El texto de estatus que regresa doc2sign (método "Estatus") no viene documentado con sus
// valores exactos en el manual (solo dice "ID y descripción del estatus del documento"), así
// que se guarda tal cual se recibe y se interpreta por palabras clave. Si en la práctica
// doc2sign regresa un texto que esta función no reconoce, el documento se queda en "en_proceso"
// (nunca se pierde información: doc2sign_estatus siempre trae el texto crudo para revisar a
// mano) — basta con ampliar las listas de palabras de abajo.

const { query, withTransaction } = require('../db');
const doc2sign = require('../doc2signClient');
const storageContratos = require('../storageContratos');
const { registrarAuditoria } = require('./audit');
const { estatusLabel } = require('./estatusLabels');
const { enviarCorreo } = require('../email');

const PALABRAS_FIRMADO = ['firmado', 'completo', 'completado', 'finalizado', 'signed', 'complete', 'terminado'];
const PALABRAS_RECHAZADO = ['rechazado', 'rejected', 'cancelado', 'declined', 'declinado'];

function interpretarEstatus(textoCrudo) {
  const texto = (textoCrudo || '').toLowerCase();
  if (PALABRAS_RECHAZADO.some((p) => texto.includes(p))) return 'rechazado';
  if (PALABRAS_FIRMADO.some((p) => texto.includes(p))) return 'firmado';
  return 'en_proceso';
}

/** Guarda en la fila del documento que se mandó a firmar (se llama justo después de doc2sign.cargarDocumento). */
async function marcarEnviado(documentoId, { doc2signDocumentoId, firmantes, usuarioId }) {
  await query(
    `UPDATE contrato_documentos
     SET doc2sign_documento_id = $1,
         doc2sign_firmantes = $2,
         doc2sign_enviado_por_id = $3,
         doc2sign_enviado_at = now(),
         doc2sign_actualizado_at = now(),
         doc2sign_estatus = 'Enviado a firma',
         doc2sign_firmado_en = NULL,
         doc2sign_rechazado_en = NULL
     WHERE id = $4`,
    [doc2signDocumentoId, JSON.stringify(firmantes), usuarioId, documentoId]
  );
}

async function buscarPorDocumentoId(doc2signDocumentoId) {
  const { rows } = await query('SELECT * FROM contrato_documentos WHERE doc2sign_documento_id = $1', [
    doc2signDocumentoId,
  ]);
  return rows[0] || null;
}

/**
 * Descarga el PDF ya firmado y lo agrega al expediente como una NUEVA VERSIÓN (categoría
 * version_firmada, origen 'doc2sign') del mismo documento que se mandó a firmar.
 */
async function procesarDocumentoFirmado(documentoDb, estatusCrudo) {
  const bufferFirmado = await doc2sign.descargarDocumento(documentoDb.doc2sign_documento_id);
  const nombreFirmado = `Firmado - ${documentoDb.nombre_archivo}`;

  const { rows: contratoRows } = await query(
    `SELECT c.*, tc.nombre AS tipo_contrato_nombre FROM contratos c
     JOIN tipos_contrato tc ON tc.id = c.tipo_contrato_id WHERE c.id = $1`,
    [documentoDb.contrato_id]
  );
  const contrato = contratoRows[0];
  if (!contrato) {
    console.error(`[firmaElectronica] Documento ${documentoDb.id} firmado pero su contrato ya no existe.`);
    return;
  }

  const rutaArchivo = await storageContratos.save({
    buffer: bufferFirmado,
    originalname: nombreFirmado,
    contratoId: contrato.id,
    tipoContratoNombre: contrato.tipo_contrato_nombre,
    folio: contrato.folio,
    tituloContrato: contrato.titulo,
    contraparteNombre: contrato.contraparte_nombre,
    estatusLabel: estatusLabel(contrato.estatus),
  });

  await withTransaction(async (client) => {
    await client.query(`UPDATE contrato_documentos SET es_version_actual = false WHERE id = $1`, [documentoDb.id]);
    await client.query(
      `INSERT INTO contrato_documentos
         (contrato_id, nombre_archivo, ruta_archivo, categoria, subido_por_id, grupo_id, version, reemplaza_a_id, es_version_actual, origen)
       VALUES ($1, $2, $3, 'version_firmada', $4, $5, $6, $7, true, 'doc2sign')`,
      [
        contrato.id,
        nombreFirmado,
        rutaArchivo,
        documentoDb.doc2sign_enviado_por_id || documentoDb.subido_por_id,
        documentoDb.grupo_id,
        documentoDb.version + 1,
        documentoDb.id,
      ]
    );
    await client.query(`UPDATE contrato_documentos SET doc2sign_firmado_en = now() WHERE id = $1`, [documentoDb.id]);
  });

  await registrarAuditoria({
    contratoId: contrato.id,
    accion: 'documento_firmado_doc2sign',
    detalle: `"${documentoDb.nombre_archivo}" quedó firmado en doc2sign (estatus: "${estatusCrudo}") y se agregó como nueva versión al expediente.`,
  });

  try {
    const destinatarios = [];
    if (documentoDb.doc2sign_enviado_por_id) {
      const { rows } = await query('SELECT email FROM usuarios WHERE id = $1', [documentoDb.doc2sign_enviado_por_id]);
      if (rows[0]?.email) destinatarios.push(rows[0].email);
    }
    if (destinatarios.length > 0) {
      await enviarCorreo(
        destinatarios.join(','),
        `Contrato ${contrato.folio}: documento ya firmado`,
        `<p>El documento "<b>${documentoDb.nombre_archivo}</b>" del contrato <b>${contrato.folio} - ${contrato.titulo}</b> ya fue firmado por todas las partes en doc2sign y se agregó como nueva versión al expediente.</p>`
      );
    }
  } catch (err) {
    console.error('[firmaElectronica] Error notificando documento firmado:', err);
  }
}

async function procesarDocumentoRechazado(documentoDb, estatusCrudo) {
  await query(`UPDATE contrato_documentos SET doc2sign_rechazado_en = now() WHERE id = $1`, [documentoDb.id]);
  await registrarAuditoria({
    contratoId: documentoDb.contrato_id,
    accion: 'firma_rechazada_doc2sign',
    detalle: `Firma de "${documentoDb.nombre_archivo}" rechazada o cancelada en doc2sign (estatus: "${estatusCrudo}").`,
  });
}

/**
 * Consulta el estatus actual en doc2sign de un documento ya enviado a firmar y actúa en
 * consecuencia (guarda el estatus crudo; si ya quedó firmado, descarga y versiona; si fue
 * rechazado, lo marca). Nunca truena el llamador — todo error queda en consola.
 * @returns {Promise<'firmado'|'rechazado'|'en_proceso'|null>}
 */
async function revisarEstatusDocumento(documentoDb) {
  if (!documentoDb?.doc2sign_documento_id) return null;
  if (documentoDb.doc2sign_firmado_en || documentoDb.doc2sign_rechazado_en) {
    return documentoDb.doc2sign_firmado_en ? 'firmado' : 'rechazado';
  }
  try {
    const estatusCrudo = await doc2sign.consultarEstatus(documentoDb.doc2sign_documento_id);
    const interpretado = interpretarEstatus(estatusCrudo);

    await query(`UPDATE contrato_documentos SET doc2sign_estatus = $1, doc2sign_actualizado_at = now() WHERE id = $2`, [
      estatusCrudo,
      documentoDb.id,
    ]);

    if (interpretado === 'firmado') {
      await procesarDocumentoFirmado(documentoDb, estatusCrudo);
    } else if (interpretado === 'rechazado') {
      await procesarDocumentoRechazado(documentoDb, estatusCrudo);
    }
    return interpretado;
  } catch (err) {
    console.error(`[firmaElectronica] Error revisando estatus del documento ${documentoDb.id}:`, err.message);
    return null;
  }
}

/** Revisa TODOS los documentos con firma pendiente (job periódico, ver jobs/scheduler.js). */
async function revisarPendientes() {
  const { rows } = await query(
    `SELECT * FROM contrato_documentos
     WHERE doc2sign_documento_id IS NOT NULL AND doc2sign_firmado_en IS NULL AND doc2sign_rechazado_en IS NULL`
  );
  const resumen = { revisados: rows.length, firmados: 0, rechazados: 0, sinCambio: 0 };
  for (const documento of rows) {
    const resultado = await revisarEstatusDocumento(documento);
    if (resultado === 'firmado') resumen.firmados++;
    else if (resultado === 'rechazado') resumen.rechazados++;
    else resumen.sinCambio++;
  }
  return resumen;
}

module.exports = {
  marcarEnviado,
  buscarPorDocumentoId,
  revisarEstatusDocumento,
  revisarPendientes,
  interpretarEstatus,
};
