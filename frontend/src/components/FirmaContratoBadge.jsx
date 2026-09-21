// Sub-categoría de un contrato VIGENTE (autorizado/activo/por_vencer, ver ListaContratos.jsx):
// "Firmado" si ya hay un documento firmado por Documenso o un "Documento firmado manual" (ver
// SQL_FIRMADO en backend/src/routes/contratos.js); si no, "Pendiente de firma". Solo tiene
// sentido para contratos ya vigentes — un borrador o una solicitud en autorización todavía no
// llegan a la etapa de firma, así que este componente no se muestra para esos estatus.
export default function FirmaContratoBadge({ firmado }) {
  if (firmado === undefined || firmado === null) return null;
  return (
    <span className={`badge ${firmado ? 'badge-activo' : 'badge-por_vencer'}`}>
      {firmado ? 'Firmado' : 'Pendiente de firma'}
    </span>
  );
}
