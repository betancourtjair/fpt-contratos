// Generación de documentos a partir de plantillas Word (.docx) con marcadores {{llave}}.
//
// Cada tipo de contrato puede tener una plantilla (ver plantillas_tipo_contrato en la BD,
// administrada desde src/routes/tiposContrato.js). Al generar el documento de un contrato
// (POST /api/contratos/:id/generar-documento) se toma esa plantilla, se reemplazan sus
// marcadores {{llave}} con los datos capturados del contrato (y de contrato_franquicia_detalles
// si aplica) y el resultado se agrega al expediente como un nuevo documento (o nueva versión
// del documento generado anteriormente; ver src/routes/contratos.js).

const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { badRequest } = require('./errors');

// Catálogo de marcadores disponibles. "franquicia: true" marca los que solo tienen sentido
// (y solo se llenan) cuando el tipo de contrato está marcado es_franquicia.
const LLAVES_PLANTILLA = [
  { llave: 'folio', etiqueta: 'Folio del contrato', categoria: 'General' },
  { llave: 'titulo', etiqueta: 'Título', categoria: 'General' },
  { llave: 'descripcion', etiqueta: 'Descripción', categoria: 'General' },
  { llave: 'tipoContratoNombre', etiqueta: 'Tipo de contrato', categoria: 'General' },
  { llave: 'parte', etiqueta: 'Parte que contrata (FPT)', categoria: 'General' },
  { llave: 'contraparteNombre', etiqueta: 'Nombre/razón social de la contraparte', categoria: 'Contraparte' },
  { llave: 'contraparteRFC', etiqueta: 'RFC de la contraparte', categoria: 'Contraparte' },
  { llave: 'contraparteContacto', etiqueta: 'Persona de contacto', categoria: 'Contraparte' },
  { llave: 'contraparteEmail', etiqueta: 'Correo de contacto', categoria: 'Contraparte' },
  { llave: 'monto', etiqueta: 'Monto (formateado, ej. $10,000.00)', categoria: 'Condiciones económicas' },
  { llave: 'moneda', etiqueta: 'Moneda', categoria: 'Condiciones económicas' },
  { llave: 'fechaInicio', etiqueta: 'Fecha de inicio', categoria: 'Condiciones económicas' },
  { llave: 'fechaFin', etiqueta: 'Fecha de fin', categoria: 'Condiciones económicas' },
  { llave: 'renovacionAutomatica', etiqueta: 'Renovación automática (Sí/No)', categoria: 'Condiciones económicas' },
  { llave: 'diasAvisoVencimiento', etiqueta: 'Días de aviso de vencimiento', categoria: 'Condiciones económicas' },
  { llave: 'fechaHoy', etiqueta: 'Fecha de generación del documento', categoria: 'General' },
  { llave: 'cuotaInicial', etiqueta: 'Cuota inicial de franquicia', categoria: 'Franquicia', franquicia: true },
  { llave: 'regaliasPorcentaje', etiqueta: 'Regalías (%)', categoria: 'Franquicia', franquicia: true },
  { llave: 'fondoMercadeoPorcentaje', etiqueta: 'Fondo de mercadeo (%)', categoria: 'Franquicia', franquicia: true },
  { llave: 'periodicidadPagoRegalias', etiqueta: 'Periodicidad de pago de regalías', categoria: 'Franquicia', franquicia: true },
  { llave: 'fechaProximoPagoRegalias', etiqueta: 'Próximo pago de regalías', categoria: 'Franquicia', franquicia: true },
  { llave: 'territorio', etiqueta: 'Territorio asignado', categoria: 'Franquicia', franquicia: true },
  { llave: 'radioExclusividadKm', etiqueta: 'Radio de exclusividad (km)', categoria: 'Franquicia', franquicia: true },
  { llave: 'direccionPunto', etiqueta: 'Dirección del punto', categoria: 'Franquicia', franquicia: true },
  { llave: 'fechaLimiteApertura', etiqueta: 'Fecha límite de apertura', categoria: 'Franquicia', franquicia: true },
  { llave: 'numeroRenovacionesPermitidas', etiqueta: 'Renovaciones permitidas', categoria: 'Franquicia', franquicia: true },
  { llave: 'condicionesRenovacion', etiqueta: 'Condiciones de renovación', categoria: 'Franquicia', franquicia: true },
  { llave: 'fechaProximaAuditoria', etiqueta: 'Próxima auditoría/inspección', categoria: 'Franquicia', franquicia: true },
  { llave: 'polizasSeguroRequeridas', etiqueta: 'Pólizas de seguro requeridas', categoria: 'Franquicia', franquicia: true },
  { llave: 'garantiaPersonal', etiqueta: 'Garantía personal (Sí/No)', categoria: 'Franquicia', franquicia: true },
  { llave: 'garanteNombre', etiqueta: 'Nombre del garante', categoria: 'Franquicia', franquicia: true },
];

function formatFecha(fecha) {
  if (!fecha) return '';
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: '2-digit', timeZone: 'UTC' });
}

function formatMonto(monto, moneda) {
  if (monto === null || monto === undefined || monto === '') return '';
  const num = Number(monto);
  if (Number.isNaN(num)) return '';
  try {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: moneda || 'MXN' }).format(num);
  } catch {
    return `$${num.toFixed(2)} ${moneda || 'MXN'}`;
  }
}

function siNo(valor) {
  return valor ? 'Sí' : 'No';
}

/** Arma el objeto plano { llave: valorFormateado } que docxtemplater usa para poblar la plantilla. */
function datosParaPlantilla({ contrato, tipoContrato, franquicia }) {
  const datos = {
    folio: contrato.folio || '',
    titulo: contrato.titulo || '',
    descripcion: contrato.descripcion || '',
    tipoContratoNombre: tipoContrato?.nombre || '',
    parte: contrato.parte || '',
    contraparteNombre: contrato.contraparte_nombre || '',
    contraparteRFC: contrato.contraparte_rfc || '',
    contraparteContacto: contrato.contraparte_contacto || '',
    contraparteEmail: contrato.contraparte_email || '',
    monto: formatMonto(contrato.monto, contrato.moneda),
    moneda: contrato.moneda || '',
    fechaInicio: formatFecha(contrato.fecha_inicio),
    fechaFin: formatFecha(contrato.fecha_fin),
    renovacionAutomatica: siNo(contrato.renovacion_automatica),
    diasAvisoVencimiento: contrato.dias_aviso_vencimiento ?? '',
    fechaHoy: formatFecha(new Date()),
  };

  if (franquicia) {
    Object.assign(datos, {
      cuotaInicial: formatMonto(franquicia.cuota_inicial, contrato.moneda),
      regaliasPorcentaje: franquicia.regalias_porcentaje != null ? `${franquicia.regalias_porcentaje}%` : '',
      fondoMercadeoPorcentaje: franquicia.fondo_mercadeo_porcentaje != null ? `${franquicia.fondo_mercadeo_porcentaje}%` : '',
      periodicidadPagoRegalias: franquicia.periodicidad_pago_regalias || '',
      fechaProximoPagoRegalias: formatFecha(franquicia.fecha_proximo_pago_regalias),
      territorio: franquicia.territorio || '',
      radioExclusividadKm: franquicia.radio_exclusividad_km != null ? `${franquicia.radio_exclusividad_km} km` : '',
      direccionPunto: franquicia.direccion_punto || '',
      fechaLimiteApertura: formatFecha(franquicia.fecha_limite_apertura),
      numeroRenovacionesPermitidas: franquicia.numero_renovaciones_permitidas ?? '',
      condicionesRenovacion: franquicia.condiciones_renovacion || '',
      fechaProximaAuditoria: formatFecha(franquicia.fecha_proxima_auditoria),
      polizasSeguroRequeridas: franquicia.polizas_seguro_requeridas || '',
      garantiaPersonal: siNo(franquicia.garantia_personal),
      garanteNombre: franquicia.garante_nombre || '',
    });
  }

  return datos;
}

/**
 * Reemplaza los marcadores {{llave}} de una plantilla .docx (buffer) con `datos` y devuelve
 * el buffer del documento resultante. Un marcador sin dato correspondiente se deja visible
 * como {{llave}} en el resultado (en vez de tronar o dejarlo en blanco) para que sea fácil
 * detectar typos al armar la plantilla.
 */
function renderizarPlantilla(bufferPlantilla, datos) {
  let zip;
  try {
    zip = new PizZip(bufferPlantilla);
  } catch (err) {
    throw badRequest('El archivo no parece ser un documento Word (.docx) válido.', err.message);
  }

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
    nullGetter: (part) => `{{${part.value}}}`,
  });

  try {
    doc.render(datos);
  } catch (err) {
    const detalles = (err.properties?.errors || [])
      .map((e) => e.properties?.explanation || e.message)
      .join(' | ');
    throw badRequest(
      'No se pudo generar el documento desde la plantilla. Revisa que los marcadores {{llave}} estén bien escritos (sin cortes de formato a la mitad).',
      detalles || err.message
    );
  }

  return doc.getZip().generate({ type: 'nodebuffer' });
}

module.exports = { LLAVES_PLANTILLA, datosParaPlantilla, renderizarPlantilla };
