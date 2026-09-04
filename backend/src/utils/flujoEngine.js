// Motor del flujo de autorización multi-nivel configurable.
//
// - resolverPlantillaAplicable: dado un tipo de contrato, resuelve la FlujoPlantilla a usar
//   (la propia del tipo si existe y está activa, si no la plantilla "default" con
//   tipo_contrato_id NULL que esté activa).
// - generarAprobaciones: a partir de los flujo_pasos de la plantilla, crea las filas
//   contrato_aprobaciones en orden, marcando 'omitido' los pasos cuyo rango de monto no
//   aplica al contrato.

const { badRequest } = require('./errors');

async function resolverPlantillaAplicable(client, tipoContratoId) {
  // 1) Plantilla propia del tipo de contrato, si existe y está activa.
  const propia = await client.query(
    `SELECT * FROM flujo_plantillas WHERE tipo_contrato_id = $1 AND activo = true
     ORDER BY created_at DESC LIMIT 1`,
    [tipoContratoId]
  );
  if (propia.rows[0]) return propia.rows[0];

  // 2) Plantilla default (tipo_contrato_id IS NULL) activa.
  const defecto = await client.query(
    `SELECT * FROM flujo_plantillas WHERE tipo_contrato_id IS NULL AND activo = true
     ORDER BY created_at DESC LIMIT 1`
  );
  if (defecto.rows[0]) return defecto.rows[0];

  return null;
}

/** ¿El monto del contrato cae dentro del rango [montoMinimo, montoMaximo] del paso? */
function pasoAplicaPorMonto(paso, monto) {
  const min = paso.monto_minimo !== null ? Number(paso.monto_minimo) : null;
  const max = paso.monto_maximo !== null ? Number(paso.monto_maximo) : null;
  if (min === null && max === null) return true; // paso sin condición de monto: siempre aplica

  const montoNum = monto !== null && monto !== undefined ? Number(monto) : 0;
  if (min !== null && montoNum < min) return false;
  if (max !== null && montoNum > max) return false;
  return true;
}

/**
 * Genera las filas contrato_aprobaciones para un contrato a partir de su plantilla aplicable.
 * Debe ejecutarse dentro de una transacción. Devuelve { aprobaciones, primerOrdenPendiente }.
 */
async function generarAprobaciones(client, contrato, plantilla) {
  const { rows: pasos } = await client.query(
    'SELECT * FROM flujo_pasos WHERE plantilla_id = $1 ORDER BY orden ASC',
    [plantilla.id]
  );

  if (pasos.length === 0) {
    throw badRequest('La plantilla de flujo aplicable no tiene pasos configurados.');
  }

  const aprobaciones = [];
  let primerOrdenPendiente = null;

  for (const paso of pasos) {
    const aplica = pasoAplicaPorMonto(paso, contrato.monto);
    const decision = aplica ? 'pendiente' : 'omitido';
    const { rows } = await client.query(
      `INSERT INTO contrato_aprobaciones
         (contrato_id, orden, nombre_paso, aprobador_id, rol_requerido, decision, decidido_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        contrato.id,
        paso.orden,
        paso.nombre,
        paso.aprobador_id,
        paso.rol_aprobador,
        decision,
        decision === 'omitido' ? new Date() : null,
      ]
    );
    aprobaciones.push(rows[0]);
    if (decision === 'pendiente' && primerOrdenPendiente === null) {
      primerOrdenPendiente = paso.orden;
    }
  }

  return { aprobaciones, primerOrdenPendiente };
}

/** Siguiente orden con decision='pendiente' después de `ordenActual`, o null si no hay más. */
async function siguienteOrdenPendiente(client, contratoId, ordenActual) {
  const { rows } = await client.query(
    `SELECT orden FROM contrato_aprobaciones
     WHERE contrato_id = $1 AND decision = 'pendiente' AND orden > $2
     ORDER BY orden ASC LIMIT 1`,
    [contratoId, ordenActual]
  );
  return rows[0] ? rows[0].orden : null;
}

/** Emails de los aprobadores de una fila de contrato_aprobaciones (por usuario específico o por rol). */
async function destinatariosDePaso(client, aprobacionRow) {
  if (aprobacionRow.aprobador_id) {
    const { rows } = await client.query(
      'SELECT email FROM usuarios WHERE id = $1 AND activo = true',
      [aprobacionRow.aprobador_id]
    );
    return rows.map((r) => r.email);
  }
  if (aprobacionRow.rol_requerido) {
    const { rows } = await client.query(
      'SELECT email FROM usuarios WHERE rol = $1 AND activo = true',
      [aprobacionRow.rol_requerido]
    );
    return rows.map((r) => r.email);
  }
  return [];
}

module.exports = {
  resolverPlantillaAplicable,
  generarAprobaciones,
  pasoAplicaPorMonto,
  siguienteOrdenPendiente,
  destinatariosDePaso,
};
