// Helpers compartidos por las tareas de notificación automática
// (src/utils/vencimientos.js y src/utils/franquicias.js).

/** Correos de jurídico/admin/super_admin activos, para copiar en avisos automáticos. */
async function obtenerCorreosJuridicoAdmin(client) {
  const { rows } = await client.query(
    `SELECT email FROM usuarios WHERE rol IN ('juridico', 'admin', 'super_admin') AND activo = true`
  );
  return rows.map((r) => r.email);
}

function formatFecha(fecha) {
  if (!fecha) return '(sin fecha)';
  return fecha instanceof Date ? fecha.toISOString().slice(0, 10) : String(fecha);
}

module.exports = { obtenerCorreosJuridicoAdmin, formatFecha };
