const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query } = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { badRequest, unauthorized, traducirErrorPostgres } = require('../utils/errors');
const { requireAuth, requireRole } = require('../middleware/auth');
const { enviarCorreo } = require('../email');

const router = express.Router();

const ROLES_VALIDOS = ['super_admin', 'admin', 'juridico', 'aprobador', 'solicitante', 'lectura'];

// URL del sitio para incluir en el correo de bienvenida. Configurable vía env (Render);
// si no se define, cae al dominio propio de FPT Contratos.
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://contratos.fpt.com.mx/';

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
    // Por default se exige cambiar la contraseña en el primer login; el checkbox del alta
    // permite desmarcarlo (p.ej. para una cuenta de servicio).
    const debeCambiarPassword = req.body?.debeCambiarPassword !== false;

    const passwordHash = await bcrypt.hash(password, 10);

    let usuarioCreado;
    try {
      const { rows } = await query(
        `INSERT INTO usuarios (email, nombre, password_hash, rol, area, debe_cambiar_password)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [String(email).toLowerCase(), nombre, passwordHash, rolFinal, area || null, debeCambiarPassword]
      );
      usuarioCreado = rows[0];
    } catch (err) {
      const traducido = traducirErrorPostgres(err);
      if (traducido) throw traducido;
      throw err;
    }

    // Correo de bienvenida con el URL del sitio y las credenciales. Fuera del try/catch de
    // la inserción: un fallo de correo nunca debe impedir que el usuario quede creado.
    try {
      await enviarCorreo(
        usuarioCreado.email,
        'Acceso a FPT Contratos',
        `<p style="margin:0 0 16px;">Se creó una cuenta para ti en <b>FPT Contratos</b>, la plataforma de gestión de contratos de Fitness Para Todos.</p>
         <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f6f2fa; border-radius:8px; margin:0 0 20px;">
           <tr>
             <td style="padding:16px 18px; font-size:14px; line-height:1.8;">
               <b>Usuario (correo):</b> ${usuarioCreado.email}<br/>
               <b>Contraseña temporal:</b> ${password}
             </td>
           </tr>
         </table>
         ${debeCambiarPassword ? '<p style="margin:0 0 20px;">Al iniciar sesión por primera vez se te pedirá cambiar esta contraseña.</p>' : ''}
         <table role="presentation" cellpadding="0" cellspacing="0" border="0">
           <tr>
             <td style="border-radius:6px; background:#592c82;">
               <a href="${FRONTEND_URL}" style="display:inline-block; padding:12px 24px; color:#ffffff; font-weight:bold; text-decoration:none; font-size:14px;">Ir a FPT Contratos</a>
             </td>
           </tr>
         </table>`
      );
    } catch (err) {
      console.error('Error enviando correo de bienvenida al usuario nuevo:', err);
    }

    res.status(201).json({ usuario: serializarUsuario(usuarioCreado) });
  })
);

// POST /api/auth/cambiar-password - el propio usuario cambia su contraseña
// (usado tanto para el cambio forzoso del primer login como para un cambio voluntario).
router.post(
  '/cambiar-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { passwordActual, passwordNueva } = req.body || {};
    if (!passwordActual || !passwordNueva) {
      throw badRequest('passwordActual y passwordNueva son requeridos.');
    }
    if (String(passwordNueva).length < 8) {
      throw badRequest('La nueva contraseña debe tener al menos 8 caracteres.');
    }

    const { rows } = await query('SELECT * FROM usuarios WHERE id = $1', [req.usuario.id]);
    const usuario = rows[0];
    if (!usuario) throw unauthorized('El usuario ya no existe.');

    const passwordOk = await bcrypt.compare(passwordActual, usuario.password_hash);
    if (!passwordOk) throw badRequest('La contraseña actual no es correcta.');

    const nuevoHash = await bcrypt.hash(passwordNueva, 10);
    const { rows: actualizado } = await query(
      `UPDATE usuarios SET password_hash = $1, debe_cambiar_password = false, updated_at = now()
       WHERE id = $2 RETURNING *`,
      [nuevoHash, usuario.id]
    );
    res.json({ usuario: serializarUsuario(actualizado[0]) });
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
