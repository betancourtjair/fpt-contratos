const { query } = require('../db');

/**
 * Inserta un registro de auditoría. Acepta un client de transacción opcional (`db`) para que
 * quede dentro de la misma transacción que el cambio que audita.
 * @param {{ contratoId?: string, usuarioId?: string, accion: string, detalle?: string, db?: { query: Function } }} opts
 */
async function registrarAuditoria({ contratoId = null, usuarioId = null, accion, detalle = null, db }) {
  const executor = db || { query };
  await executor.query(
    `INSERT INTO audit_logs (contrato_id, usuario_id, accion, detalle) VALUES ($1, $2, $3, $4)`,
    [contratoId, usuarioId, accion, detalle]
  );
}

module.exports = { registrarAuditoria };
