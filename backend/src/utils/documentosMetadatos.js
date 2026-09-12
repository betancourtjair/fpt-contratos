// Sincroniza el campo "EstatusContrato" en los metadatos de SharePoint de todos los
// documentos VIGENTES (es_version_actual = true) de un contrato, cada vez que su estatus
// cambia: envío a autorización, aprobación/rechazo de un paso, o las transiciones
// automáticas del job de vencimientos (por_vencer / vencido). Así, alguien que busca
// directamente en la biblioteca de SharePoint (sin entrar a la app) ve el estatus actual,
// no el que tenía el contrato cuando se subió el archivo.
//
// Si el driver activo no es SharePoint, o el documento en cuestión vive en el storage
// local (ruta_archivo sin el prefijo "sharepoint:"), storageContratos.actualizarMetadatos
// simplemente no hace nada para esa clave — no hace falta revisar el driver aquí.
const { query } = require('../db');
const storageContratos = require('../storageContratos');
const { estatusLabel } = require('./estatusLabels');

async function sincronizarEstatusEnDocumentos(contratoId, estatus) {
  try {
    const { rows } = await query(
      'SELECT ruta_archivo FROM contrato_documentos WHERE contrato_id = $1 AND es_version_actual = true',
      [contratoId]
    );
    if (rows.length === 0) return;
    const label = estatusLabel(estatus);
    await Promise.all(
      rows.map((d) => storageContratos.actualizarMetadatos(d.ruta_archivo, { estatusLabel: label }))
    );
  } catch (err) {
    // Nunca debe tumbar el flujo principal (autorizar/rechazar/activar/vencer) por un
    // problema al sincronizar metadatos en SharePoint.
    console.error(`Error sincronizando estatus en SharePoint para contrato ${contratoId}:`, err.message);
  }
}

module.exports = { sincronizarEstatusEnDocumentos };
