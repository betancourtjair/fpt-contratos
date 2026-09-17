// Lógica de negocio de la integración con DocuSeal: enviar un documento del expediente a
// firma, revisar su estatus (a mano, por webhook, o por el job periódico) y, cuando ya quedó
// firmado, descargarlo y agregarlo al expediente como nueva versión.
//
// A diferencia de doc2sign (cuyo texto de estatus libre había que interpretar por palabras
// clave), DocuSeal regresa un campo "status" limpio y documentado: "pending", "completed",
// "declined" o "expired". Aun así se guarda tal cual se recibe en docuseal_estatus (nunca se
// pierde información) y se interpreta con un mapeo simple; si DocuSeal llegara a agregar un
// valor nuevo que esta función no reconoce, el documento se queda en "en_proceso" hasta
// revisarlo a mano.

const { query, withTransaction } = require('../db');
const docuseal = require('../docusealClient');
const storageContratos = require('../storageContratos');
const { registrarAuditoria } = require('./audit');
const { estatusLabel } = require('./estatusLabels');
const { enviarCorreo } = require('../email');

function interpretarEstatus(estatusCrudo) {
  const texto = (estatusCrudo || '').toLowerCase();
  if (texto === 'declined' || texto === 'expired') return 'rechazado';
  if (texto === 'completed') return 'firmado';
  return 'en_proceso';
}

/** Guarda en la fila del documento que se mandó a firmar (se llama justo después de docuseal.crearSubmission). */
async function marcarEnviado(documentoId, { submissionId, firmantes, usuarioId }) {
  await query(
    `UPDATE contrato_documentos
     SET docuseal_submission_id = $1,
         docuseal_firmantes = $2,
         docuseal_enviado_por_id = $3,
         docuseal_enviado_at = now(),
         docuseal_actualizado_at = now(),
         docuseal_estatus = 'pending',
         docuseal_firmado_en = NULL,
         docuseal_rechazado_en = NULL
     WHERE id = $4`,
    [submissionId, JSON.stringify(firmantes), usuarioId, documentoId]
  );
}

async function buscarPorSubmissionId(submissionId) {
  const { rows } = await query('SELECT * FROM contrato_documentos WHERE docuseal_submission_id = $1', [submissionId]);
  return rows[0] || null;
}

/**
 * Descarga el PDF ya firmado y lo agrega al expediente como una NUEVA VERSIÓN (categoría
 * version_firmada, origen 'docuseal') del mismo documento que se mandó a firmar.
 */
async function procesarDocumentoFirmado(documentoDb, estatusCrudo) {
  const bufferFirmado = await docuseal.descargarDocumento(documentoDb.docuseal_submission_id);
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
       VALUES ($1, $2, $3, 'version_firmada', $4, $5, $6, $7, true, 'docuseal')`,
      [
        contrato.id,
        nombreFirmado,
        rutaArchivo,
        documentoDb.docuseal_enviado_por_id || documentoDb.subido_por_id,
        documentoDb.grupo_id,
        documentoDb.version + 1,
        documentoDb.id,
      ]
    );
    await client.query(`UPDATE contrato_documentos SET docuseal_firmado_en = now() WHERE id = $1`, [documentoDb.id]);
  });

  await registrarAuditoria({
    contratoId: contrato.id,
    accion: 'documento_firmado_docuseal',
    detalle: `"${documentoDb.nombre_archivo}" quedó firmado en DocuSeal (estatus: "${estatusCrudo}") y se agregó como nueva versión al expediente.`,
  });

  try {
    const destinatarios = [];
    if (documentoDb.docuseal_enviado_por_id) {
      const { rows } = await query('SELECT email FROM usuarios WHERE id = $1', [documentoDb.docuseal_enviado_por_id]);
      if (rows[0]?.email) destinatarios.push(rows[0].email);
    }
    if (destinatarios.length > 0) {
      await enviarCorreo(
        destinatarios.join(','),
        `Contrato ${contrato.folio}: documento ya firmado`,
        `<p>El documento "<b>${documentoDb.nombre_archivo}</b>" del contrato <b>${contrato.folio} - ${contrato.titulo}</b> ya fue firmado por todas las partes en DocuSeal y se agregó como nueva versión al expediente.</p>`
      );
    }
  } catch (err) {
    console.error('[firmaElectronica] Error notificando documento firmado:', err);
  }
}

async function procesarDocumentoRechazado(documentoDb, estatusCrudo) {
  await query(`UPDATE contrato_documentos SET docuseal_rechazado_en = now() WHERE id = $1`, [documentoDb.id]);
  await registrarAuditoria({
    contratoId: documentoDb.contrato_id,
    accion: 'firma_rechazada_docuseal',
    detalle: `Firma de "${documentoDb.nombre_archivo}" rechazada o vencida en DocuSeal (estatus: "${estatusCrudo}").`,
  });
}

/**
 * Consulta el estatus actual en DocuSeal de un documento ya enviado a firmar y actúa en
 * consecuencia (guarda el estatus crudo; si ya quedó firmado, descarga y versiona; si fue
 * rechazado o venció, lo marca). Nunca truena el llamador — todo error queda en consola.
 * @returns {Promise<'firmado'|'rechazado'|'en_proceso'|null>}
 */
async function revisarEstatusDocumento(documentoDb) {
  if (!documentoDb?.docuseal_submission_id) return null;
  if (documentoDb.docuseal_firmado_en || documentoDb.docuseal_rechazado_en) {
    return documentoDb.docuseal_firmado_en ? 'firmado' : 'rechazado';
  }
  try {
    const submission = await docuseal.consultarSubmission(documentoDb.docuseal_submission_id);
    const estatusCrudo = submission?.status || 'pending';
    const interpretado = interpretarEstatus(estatusCrudo);

    await query(`UPDATE contrato_documentos SET docuseal_estatus = $1, docuseal_actualizado_at = now() WHERE id = $2`, [
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
     WHERE docuseal_submission_id IS NOT NULL AND docuseal_firmado_en IS NULL AND docuseal_rechazado_en IS NULL`
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
  buscarPorSubmissionId,
  revisarEstatusDocumento,
  revisarPendientes,
  interpretarEstatus,
};
