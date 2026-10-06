const jwt = require('jsonwebtoken');
const { unauthorized, forbidden } = require('../utils/errors');

/** Verifica el JWT del header Authorization: Bearer <token> y adjunta req.usuario. */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw unauthorized('Falta el token de autenticación (header Authorization: Bearer <token>).');
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = payload; // { id, email, rol, nombre }
    next();
  } catch (err) {
    throw unauthorized('Token inválido o expirado.');
  }
}

/** Restringe el acceso a los roles dados. Debe usarse después de requireAuth. */
function requireRole(...rolesPermitidos) {
  return function (req, res, next) {
    if (!req.usuario) throw unauthorized();
    if (!rolesPermitidos.includes(req.usuario.rol)) {
      throw forbidden(`Esta acción requiere uno de estos roles: ${rolesPermitidos.join(', ')}.`);
    }
    next();
  };
}

/**
 * El rol 'operaciones' solo puede usar el modulo Operaciones: cualquier otra ruta de /api
 * (contratos, franquicias, arrendamientos, usuarios...) se rechaza con 403, aunque esa ruta
 * hoy sea "abierta a cualquier usuario autenticado". Se monta una sola vez en server.js, antes
 * de todos los routers. Las rutas publicas (sin token) y los demas roles no se tocan.
 * Permitido: /auth (login, /me, cambio de contrasena) y /operaciones.
 */
function restringirRolOperaciones(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) return next();
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return next(); // token invalido: que lo maneje requireAuth en la ruta
  }
  if (payload.rol !== 'operaciones') return next();
  if (req.path.startsWith('/auth') || req.path.startsWith('/operaciones')) return next();
  throw forbidden('Tu rol (Operaciones) solo tiene acceso al modulo de Operaciones.');
}

module.exports = { requireAuth, requireRole, restringirRolOperaciones };
