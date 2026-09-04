// Regla de visibilidad de contratos compartida entre el listado de contratos y el dashboard.
// admin/juridico/super_admin/lectura ven todos. solicitante ve solo los suyos.
// aprobador ve los suyos + aquellos en los que aparece como aprobador (por usuario o por rol)
// en cualquier paso, para poder darles seguimiento.
//
// Devuelve { condicion, valores } donde condicion es un fragmento SQL sobre el alias `c`
// (contratos) que puede insertarse en un WHERE, y null si el usuario ve todo (sin filtro).
function condicionVisibilidad(usuario, offsetParametros = 0) {
  if (['super_admin', 'admin', 'juridico', 'lectura'].includes(usuario.rol)) {
    return null;
  }

  if (usuario.rol === 'aprobador') {
    const p1 = offsetParametros + 1;
    const p2 = offsetParametros + 2;
    return {
      condicion: `(
        c.solicitado_por_id = $${p1}
        OR EXISTS (
          SELECT 1 FROM contrato_aprobaciones ca
          WHERE ca.contrato_id = c.id AND (ca.aprobador_id = $${p1} OR ca.rol_requerido = $${p2})
        )
      )`,
      valores: [usuario.id, usuario.rol],
    };
  }

  // solicitante (u otro rol no contemplado): solo lo propio.
  const p1 = offsetParametros + 1;
  return { condicion: `c.solicitado_por_id = $${p1}`, valores: [usuario.id] };
}

module.exports = { condicionVisibilidad };
