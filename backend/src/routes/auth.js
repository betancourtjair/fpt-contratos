const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query } = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { badRequest, unauthorized, traducirErrorPostgres } = require('../utils/errors');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const ROLES_VALIDOS = ['super_admin', 'admin', 'juridico', 'aprobador', 'solicitante', 'lectura'];

function firmarToken(usuario) {
  return jwt.sign(
    { id: usuario.id, email: usuario.email, nombre: usuario.nombre, rol: usuario.rol },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

function serializarUsuario(row) {
  if (!row) return null;
  const { password_hash, ...resto } = row;
  return resto;
}

// POST /api/auth/login
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) throw badRequest('email y password son requeridos.');

    const { rows } = await query('SELECT * FROM usuarios WHERE email = $1', [String(email).toLowerCase()]);
    const usuario = rows[0];
    if (!usuario) throw unauthorized('Credenciales inválidas.');
    if (!usuario.activo) throw unauthorized('El usuario está desactivado.');

    const passwordOk = await bcrypt.compare(password, usuario.password_hash);
    if (!passwordOk) throw unauthorized('Credenciales inválidas.');

    const token = firmarToken(usuario);
    res.json({ token, usuario: serializarUsuario(usuario) });
  })
);

// POST /api/auth/register - solo super_admin/admin puede crear usuarios
router.post(
  '/register',
  requireAuth,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const { email, nombre, password, rol, area } = req.body || {};
    if (!email || !nombre || !password) {
      throw badRequest('email, nombre y password son requeridos.');
    }
    const rolFinal = rol || 'solicitante';
    if (!ROLES_VALIDOS.includes(rolFinal)) {
      throw badRequest(`rol inválido. Valores permitidos: ${ROLES_VALIDOS.join(', ')}.`);
    }
    // Solo super_admin puede crear otro super_admin.
    if (rolFinal === 'super_admin' && req.usuario.rol !== 'super_admin') {
      throw badRequest('Solo un super_admin puede crear otro super_admin.');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    try {
      const { rows } = await query(
        `INSERT INTO usuarios (email, nombre, password_hash, rol, area)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [String(email).toLowerCase(), nombre, passwordHash, rolFinal, area || null]
      );
      res.status(201).json({ usuario: serializarUsuario(rows[0]) });
    } catch (err) {
      const traducido = traducirErrorPostgres(err);
      if (traducido) throw traducido;
      throw err;
    }
  })
);

// GET /api/auth/me
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM usuarios WHERE id = $1', [req.usuario.id]);
    if (!rows[0]) throw unauthorized('El usuario ya no existe.');
    res.json({ usuario: serializarUsuario(rows[0]) });
  })
);

module.exports = router;
