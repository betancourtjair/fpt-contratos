// Lógica de negocio de la integración con Documenso: enviar un documento del expediente a
// firma, revisar su estatus (a mano, por webhook, o por el job periódico) y, cuando ya quedó
// firmado, descargarlo y agregarlo al expediente como nueva versión.
//
// A diferencia de doc2sign (cuyo texto de estatus libre había que interpretar por palabras
// clave), Documenso regresa un estatus de envelope limpio y documentado: "DRAFT", "PENDING",
// "COMPLETED", "REJECTED" o "CANCELLED". Aun así se guarda tal cual se recibe en
// documenso_estatus (nunca se pierde información) y se interpreta con un mapeo simple; si
// Documenso llegara a agregar un valor nuevo que esta función no reconoce, el documento se
// queda en "en_proceso" hasta revisarlo a mano.

const { query, withTransaction } = require('../db');
const documenso = require('../documensoClient');
const storageContratos = require('../storageContratos');
const { registrarAuditoria } = require('./audit');
const { estatusLabel } = require('./estatusLabels');
const { enviarCorreo } = require('../email');

function interpretarEstatus(estatusCrudo) {
  const texto = (estatusCrudo || '').toUpperCase();
  if (texto === 'REJECTED' || texto === 'CANCELLED') return 'rechazado';
  if (texto === 'COMPLETED') return 'firmado';
  return 'en_proceso'; // DRAFT, PENDING, o cualquier valor nuevo no reconocido
}

/** Guarda en la fila del documento que se mandó a firmar (se llama justo después de documenso.crearSubmission). */
async function marcarEnviado(documentoId, { submissionId, firmantes, usuarioId }) {
  await query(
    `UPDATE contrato_documentos
     SET documenso_submission_id = $1,
         documenso_firmantes = $2,
         documenso_enviado_por_id = $3,
         documenso_enviado_at = now(),
         documenso_actualizado_at = now(),
         documenso_estatus = 'PENDING',
         documenso_firmado_en = NULL,
         documenso_rechazado_en = NULL
     WHERE id = $4`,
    [submissionId, JSON.stringify(firmantes), usuarioId, documentoId]
  );
}

async function buscarPorSubmissionId(submissionId) {
  const { rows } = await query('SELECT * FROM contrato_documentos WHERE documenso_submission_id = $1', [submissionId]);
  return rows[0] || null;
}

/**
 * Cancela en Documenso el envío a firma de un documento (botón "Cancelar" en el frontend,
 * mientras sigue "En firma") y lo deja localmente en el mismo estado que usa el sistema cuando
 * Documenso reporta REJECTED/CANCELLED por su cuenta (ver interpretarEstatus / procesarDocumentoRechazado):
 * documenso_rechazado_en queda con la fecha, lo que además libera el botón "Enviar a firmar" para
 * volver a mandarlo (ver el checkeo en POST /:id/documentos/:documentoId/enviar-a-firmar). Se guarda
 * el estatus crudo como 'CANCELLED' (en vez de 'REJECTED') para que el frontend pueda distinguir
 * "lo cancelamos nosotros" de "lo rechazó el firmante".
 */
async function cancelarEnvio(documentoDb, { motivo } = {}) {
  await documenso.cancelarSubmission(documentoDb.documenso_submission_id, motivo);

  await query(
    `UPDATE contrato_documentos
     SET documenso_estatus = 'CANCELLED',
         documenso_rechazado_en = now(),
         documenso_actualizado_at = now()
     WHERE id = $1`,
    [documentoDb.id]
  );
  // El registro de auditoría lo hace el llamador (ver POST .../cancelar-firma en routes/contratos.js),
  // igual que marcarEnviado — a diferencia de procesarDocumentoRechazado, que sí audita aquí porque
  // ese caso lo dispara el job periódico o el webhook, sin una petición HTTP de por medio.
}

/**
 * Descarga el PDF ya firmado y lo agrega al expediente como una NUEVA VERSIÓN (categoría
 * version_firmada, origen 'documenso') del mismo documento que se mandó a firmar.
 */
async function procesarDocumentoFirmado(documentoDb, estatusCrudo) {
  const bufferFirmado = await documenso.descargarDocumento(documentoDb.documenso_submission_id);
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
       VALUES ($1, $2, $3, 'version_firmada', $4, $5, $6, $7, true, 'documenso')`,
      [
        contrato.id,
        nombreFirmado,
        rutaArchivo,
        documentoDb.documenso_enviado_por_id || documentoDb.subido_por_id,
        documentoDb.grupo_id,
        documentoDb.version + 1,
        documentoDb.id,
      ]
    );
    await client.query(`UPDATE contrato_documentos SET documenso_firmado_en = now() WHERE id = $1`, [documentoDb.id]);
  });

  await registrarAuditoria({
    contratoId: contrato.id,
    accion: 'documento_firmado_documenso',
    detalle: `"${documentoDb.nombre_archivo}" quedó firmado en Documenso (estatus: "${estatusCrudo}") y se agregó como nueva versión al expediente.`,
  });

  try {
    const destinatarios = [];
    if (documentoDb.documenso_enviado_por_id) {
      const { rows } = await query('SELECT email FROM usuarios WHERE id = $1', [documentoDb.documenso_enviado_por_id]);
      if (rows[0]?.email) destinatarios.push(rows[0].email);
    }
    if (destinatarios.length > 0) {
      await enviarCorreo(
        destinatarios.join(','),
        `Contrato ${contrato.folio}: documento ya firmado`,
        `<p>El documento "<b>${documentoDb.nombre_archivo}</b>" del contrato <b>${contrato.folio} - ${contrato.titulo}</b> ya fue firmado por todas las partes en Documenso y se agregó como nueva versión al expediente.</p>`
      );
    }
  } catch (err) {
    console.error('[firmaElectronica] Error notificando documento firmado:', err);
  }
}

async function procesarDocumentoRechazado(documentoDb, estatusCrudo) {
  await query(`UPDATE contrato_documentos SET documenso_rechazado_en = now() WHERE id = $1`, [documentoDb.id]);
  await registrarAuditoria({
    contratoId: documentoDb.contrato_id,
    accion: 'firma_rechazada_documenso',
    detalle: `Firma de "${documentoDb.nombre_archivo}" rechazada o cancelada en Documenso (estatus: "${estatusCrudo}").`,
  });
}

/**
 * Consulta el estatus actual en Documenso de un documento ya enviado a firmar y actúa en
 * consecuencia (guarda el estatus crudo; si ya quedó firmado, descarga y versiona; si fue
 * rechazado o cancelado, lo marca). Nunca truena el llamador — todo error queda en consola.
 * @returns {Promise<'firmado'|'rechazado'|'en_proceso'|null>}
 */
async function revisarEstatusDocumento(documentoDb) {
  if (!documentoDb?.documenso_submission_id) return null;
  if (documentoDb.documenso_firmado_en || documentoDb.documenso_rechazado_en) {
    return documentoDb.documenso_firmado_en ? 'firmado' : 'rechazado';
  }
  try {
    const submission = await documenso.consultarSubmission(documentoDb.documenso_submission_id);
    const estatusCrudo = submission?.status || 'PENDING';
    const interpretado = interpretarEstatus(estatusCrudo);

    await query(`UPDATE contrato_documentos SET documenso_estatus = $1, documenso_actualizado_at = now() WHERE id = $2`, [
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
     WHERE documenso_submission_id IS NOT NULL AND documenso_firmado_en IS NULL AND documenso_rechazado_en IS NULL`
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
  cancelarEnvio,
};
