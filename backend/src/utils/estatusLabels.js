// Etiquetas legibles para el estatus de un contrato. Espejo de
// frontend/src/components/EstatusBadge.jsx — se usa aquí para escribir un valor humano
// (no el código interno "en_autorizacion") en la columna "EstatusContrato" de SharePoint.
// Si se agrega un estatus nuevo al enum, actualizar ambos archivos.
const LABELS = {
  borrador: 'Borrador',
  en_revision: 'En revisión',
  en_autorizacion: 'En autorización',
  rechazado: 'Rechazado',
  autorizado: 'Autorizado',
  activo: 'Activo',
  por_vencer: 'Por vencer',
  vencido: 'Vencido',
  cancelado: 'Cancelado',
};

function estatusLabel(estatus) {
  return LABELS[estatus] || estatus;
}

module.exports = { estatusLabel, LABELS };
