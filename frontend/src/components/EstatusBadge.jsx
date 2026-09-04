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

export function estatusLabel(estatus) {
  return LABELS[estatus] || estatus;
}

export default function EstatusBadge({ estatus }) {
  return <span className={`badge badge-${estatus}`}>{estatusLabel(estatus)}</span>;
}
