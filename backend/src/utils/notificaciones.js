// Helpers compartidos por las tareas de notificación automática
// (src/utils/vencimientos.js, src/utils/franquicias.js y src/utils/alertasArrendamientos.js).

const { ROLES_NIVEL_ADMIN } = require('./roles');

/** Correos de jurídico/admin/super_admin activos, para copiar en avisos automáticos. */
async function obtenerCorreosJuridicoAdmin(client) {
  const { rows } = await client.query(
    `SELECT email FROM usuarios WHERE rol IN ('juridico', 'admin', 'super_admin') AND activo = true`
  );
  return rows.map((r) => r.email);
}

/** Correos de todos los roles con nivel de acceso admin (usado por el módulo de Arrendamientos). */
async function obtenerCorreosNivelAdmin(client) {
  const { rows } = await client.query(
    `SELECT email FROM usuarios WHERE activo = true AND rol = ANY($1::rol_usuario[])`,
    [ROLES_NIVEL_ADMIN]
  );
  return rows.map((r) => r.email).filter(Boolean);
}

function formatFecha(fecha) {
  if (!fecha) return '(sin fecha)';
  return fecha instanceof Date ? fecha.toISOString().slice(0, 10) : String(fecha);
}

module.exports = { obtenerCorreosJuridicoAdmin, obtenerCorreosNivelAdmin, formatFecha };
