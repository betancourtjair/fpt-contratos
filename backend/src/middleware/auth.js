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

module.exports = { requireAuth, requireRole };
