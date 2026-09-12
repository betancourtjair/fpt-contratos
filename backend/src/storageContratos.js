// Almacenamiento de los documentos del EXPEDIENTE de un contrato (tabla contrato_documentos):
// tanto los que sube un usuario a mano como los que se generan desde la plantilla Word del
// tipo de contrato. Es un módulo aparte de storage.js (que sigue usándose sin cambios para
// las plantillas de tipos_contrato) para poder migrar SOLO los documentos de contrato a
// SharePoint sin tocar nada más.
//
// CONTRATOS_STORAGE_DRIVER=local (default) guarda en disco, igual que siempre, vía storage.js.
// CONTRATOS_STORAGE_DRIVER=sharepoint hace que todo documento NUEVO se suba a SharePoint
// (ver sharepointStorage.js) en la carpeta <Tipo de contrato>/<Folio>/.
//
// Los documentos ya subidos antes del cambio se quedan en disco tal cual — no se migran — y
// se siguen sirviendo normal: cada clave (ruta_archivo) sabe a qué driver pertenece por su
// prefijo ("sharepoint:" o, si no lo tiene, es una clave del storage local de siempre), así
// que da igual qué driver esté configurado como default en un momento dado para las cargas
// NUEVAS: leer/ver/borrar un documento viejo siempre usa el driver correcto para esa clave.

const storageLocal = require('./storage');
const sharepoint = require('./sharepointStorage');

const PREFIJO_SHAREPOINT = 'sharepoint:';

function esClaveSharePoint(clave) {
  return typeof clave === 'string' && clave.startsWith(PREFIJO_SHAREPOINT);
}

function driverParaNuevasCargas() {
  return (process.env.CONTRATOS_STORAGE_DRIVER || 'local').toLowerCase();
}

/**
 * @param {{ buffer?: Buffer, path?: string, originalname: string, contratoId: string,
 *           tipoContratoNombre?: string, folio?: string }} file
 */
async function save(file) {
  if (driverParaNuevasCargas() === 'sharepoint') {
    return sharepoint.save(file);
  }
  return storageLocal.save(file);
}

function getUrl(clave) {
  return esClaveSharePoint(clave) ? sharepoint.getUrl(clave) : storageLocal.getUrl(clave);
}

async function eliminar(clave) {
  return esClaveSharePoint(clave) ? sharepoint.delete(clave) : storageLocal.delete(clave);
}

// Actualiza metadatos (Folio/Título/Contraparte/Estatus) de un documento ya subido, sin
// volver a subir el archivo. El storage local no tiene metadatos que actualizar, así que
// para una clave local esto simplemente no hace nada.
async function actualizarMetadatos(clave, metadatos) {
  if (esClaveSharePoint(clave)) {
    return sharepoint.actualizarCampos(clave, metadatos);
  }
}

module.exports = { save, getUrl, delete: eliminar, actualizarMetadatos };
