// Errores de aplicación con código HTTP explícito, más un traductor de errores de
// Postgres (constraint/FK/etc.) a mensajes claros para el cliente en vez de un 500 genérico.

class AppError extends Error {
  constructor(status, message, detalle) {
    super(message);
    this.status = status;
    this.detalle = detalle;
  }
}

const badRequest = (msg, detalle) => new AppError(400, msg, detalle);
const unauthorized = (msg = 'No autenticado.') => new AppError(401, msg);
const forbidden = (msg = 'No tienes permiso para realizar esta acción.') => new AppError(403, msg);
const notFound = (msg = 'Recurso no encontrado.') => new AppError(404, msg);
const conflict = (msg, detalle) => new AppError(409, msg, detalle);

// Códigos de error de Postgres: https://www.postgresql.org/docs/current/errcodes-appendix.html
const PG_ERROR_MESSAGES = {
  '23503': 'La operación hace referencia a un registro que no existe (violación de llave foránea).',
  '23505': 'Ya existe un registro con ese valor único (violación de restricción unique).',
  '23502': 'Falta un campo obligatorio (violación de NOT NULL).',
  '23514': 'El valor no cumple con una restricción de datos (CHECK constraint).',
  '22P02': 'Formato de dato inválido (por ejemplo, un UUID o número mal formado).',
};

/** Convierte un error de `pg` en un AppError con mensaje claro, o null si no aplica. */
function traducirErrorPostgres(err) {
  if (!err || !err.code || !PG_ERROR_MESSAGES[err.code]) return null;
  const base = PG_ERROR_MESSAGES[err.code];
  const detalle = err.detail || err.constraint || undefined;
  const status = err.code === '23505' ? 409 : 400;
  return new AppError(status, base, detalle);
}

module.exports = {
  AppError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  traducirErrorPostgres,
};
