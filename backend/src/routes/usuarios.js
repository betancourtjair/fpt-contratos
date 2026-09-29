const express = require('express');
const bcrypt = require('bcrypt');
const { query } = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { badRequest, forbidden, notFound, traducirErrorPostgres } = require('../utils/errors');
const { requireAuth, requireRole } = require('../middleware/auth');
const { enviarCorreo } = require('../email');
const { ROLES_NIVEL_ADMIN } = require('../utils/roles');

const router = express.Router();
const ROLES_VALIDOS = ['super_admin', 'admin', 'juridico', 'cabeza_juridico', 'aprobador', 'solicitante', 'ceo', 'cfo', 'lectura'];
// CEO, CFO y Cabeza de Jurídico son, sobre todo, un "puesto" informativo (los pasos de flujo ya
// los referencian como personas fijas vía aprobador_id, no por rol); pero como cualquier otro rol
// elevado, solo un super_admin puede asignarlos — igual que super_admin.
const ROLES_SOLO_SUPER_ADMIN = ['super_admin', 'ceo', 'cfo', 'cabeza_juridico'];

function serializarUsuario(row) {
  if (!row) return null;
  const { password_hash, ...resto } = row;
  return resto;
}

// GET /api/usuarios (admin+)
router.get(
  '/',
  requireAuth,
  requireRole(...ROLES_NIVEL_ADMIN),
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM usuarios ORDER BY nombre ASC');
    res.json({ usuarios: rows.map(serializarUsuario) });
  })
);

// GET /api/usuarios/directorio — lista liviana (id, nombre, email) de usuarios activos.
// A diferencia de GET / (arriba, solo admin+), cualquier usuario autenticado puede consultarla:
// no expone rol, area ni ningun otro dato del usuario. Pensada para autocompletar firmantes
// internos al enviar un documento a firma (ver EnviarAFirmarModal.jsx en el frontend).
// Query opcional "rol": filtra por uno o más roles separados por coma (p.ej. "juridico" o
// "juridico,cabeza_juridico") — usado para el selector de "Jurídico asignado" en un contrato
// (ver DetalleContrato.jsx). Sigue sin exponer el rol de cada quien en la respuesta.
router.get(
    '/directorio',
    requireAuth,
    asyncHandler(async (req, res) => {
          const rolesFiltro = req.query.rol
            ? String(req.query.rol).split(',').map((r) => r.trim()).filter(Boolean)
            : null;
          const { rows } = rolesFiltro && rolesFiltro.length > 0
            ? await query(
                'SELECT id, nombre, email FROM usuarios WHERE activo = true AND rol = ANY($1) ORDER BY nombre ASC',
                [rolesFiltro]
              )
            : await query(
                'SELECT id, nombre, email FROM usuarios WHERE activo = true ORDER BY nombre ASC'
              );
          res.json({ usuarios: rows });
    })
  );

// PATCH /api/usuarios/:id (rol, activo, nombre, area, jefeDirectoId - admin+; email y los roles
// de ROLES_SOLO_SUPER_ADMIN - solo super_admin)
router.patch(
  '/:id',
  requireAuth,
  requireRole(...ROLES_NIVEL_ADMIN),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { rol, activo, nombre, area, jefeDirectoId, email } = req.body || {};

    if (rol !== undefined && !ROLES_VALIDOS.includes(rol)) {
      throw badRequest(`rol inválido. Valores permitidos: ${ROLES_VALIDOS.join(', ')}.`);
    }
    if (rol !== undefined && ROLES_SOLO_SUPER_ADMIN.includes(rol) && req.usuario.rol !== 'super_admin') {
      throw badRequest(`Solo un super_admin puede asignar el rol ${rol}.`);
    }
    if (jefeDirectoId !== undefined && jefeDirectoId !== null && String(jefeDirectoId) === String(id)) {
      throw badRequest('Un usuario no puede ser su propio jefe directo.');
    }
    // El correo es el usuario de acceso (login); cambiarlo es más sensible que el resto de los
    // campos, así que —a diferencia de rol/activo/nombre/area/jefeDirecto, editables por admin+—
    // se reserva a super_admin.
    if (email !== undefined) {
      if (req.usuario.rol !== 'super_admin') {
        throw forbidden('Solo un super_admin puede cambiar el correo de un usuario.');
      }
      if (!email || typeof email !== 'string' || !email.includes('@')) {
        throw badRequest('El correo no es válido.');
      }
    }

    const campos = [];
    const valores = [];
    let i = 1;
    if (rol !== undefined) { campos.push(`rol = $${i++}`); valores.push(rol); }
    if (activo !== undefined) { campos.push(`activo = $${i++}`); valores.push(Boolean(activo)); }
    if (nombre !== undefined) { campos.push(`nombre = $${i++}`); valores.push(nombre); }
    if (area !== undefined) { campos.push(`area = $${i++}`); valores.push(area); }
    if (jefeDirectoId !== undefined) { campos.push(`jefe_directo_id = $${i++}`); valores.push(jefeDirectoId); }
    if (email !== undefined) { campos.push(`email = $${i++}`); valores.push(String(email).toLowerCase()); }

    if (campos.length === 0) throw badRequest('No se envió ningún campo para actualizar.');

    campos.push(`updated_at = now()`);
    valores.push(id);

    try {
      const { rows } = await query(
        `UPDATE usuarios SET ${campos.join(', ')} WHERE id = $${i} RETURNING *`,
        valores
      );
      if (!rows[0]) throw notFound('Usuario no encontrado.');
      res.json({ usuario: serializarUsuario(rows[0]) });
    } catch (err) {
      const traducido = traducirErrorPostgres(err);
      if (traducido) throw traducido;
      throw err;
    }
  })
);

// PATCH /api/usuarios/:id/password - solo super_admin puede fijarle una contraseña nueva a
// cualquier usuario, sin necesidad de conocer la actual (a diferencia de
// POST /api/auth/cambiar-password, pensado para que cada quien cambie la suya). Pensado para
// soporte: recuperar acceso a alguien que se quedó fuera, o (como en este caso) fijar la
// contraseña de una cuenta de prueba antes de asignarla a su usuario real.
router.patch(
  '/:id/password',
  requireAuth,
  requireRole('super_admin'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { passwordNueva, debeCambiarPassword } = req.body || {};

    if (!passwordNueva || String(passwordNueva).length < 8) {
      throw badRequest('La nueva contraseña debe tener al menos 8 caracteres.');
    }

    const { rows: existentes } = await query('SELECT * FROM usuarios WHERE id = $1', [id]);
    const usuario = existentes[0];
    if (!usuario) throw notFound('Usuario no encontrado.');

    // Por default se exige cambiarla en el siguiente inicio de sesión, igual que en el alta;
    // quien tiene el rol super_admin puede desmarcarlo si de verdad quiere dejarla fija.
    const forzarCambio = debeCambiarPassword !== false;
    const nuevoHash = await bcrypt.hash(passwordNueva, 10);

    const { rows } = await query(
      `UPDATE usuarios SET password_hash = $1, debe_cambiar_password = $2, updated_at = now()
       WHERE id = $3 RETURNING *`,
      [nuevoHash, forzarCambio, id]
    );

    // Aviso por correo de que su contraseña cambió; nunca debe impedir que la operación se
    // reporte como exitosa si el envío falla.
    try {
      await enviarCorreo(
        usuario.email,
        'Tu contraseña de FPT Contratos fue actualizada',
        `<p style="margin:0 0 16px;">Un administrador estableció una nueva contraseña temporal para tu cuenta en <b>FPT Contratos</b>.</p>
         <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f6f2fa; border-radius:8px; margin:0 0 20px;">
           <tr>
             <td style="padding:16px 18px; font-size:14px; line-height:1.8;">
               <b>Usuario (correo):</b> ${usuario.email}<br/>
               <b>Contraseña temporal:</b> ${passwordNueva}
             </td>
           </tr>
         </table>
         ${forzarCambio ? '<p style="margin:0 0 20px;">Al iniciar sesión se te pedirá cambiarla.</p>' : ''}
         <p style="margin:0;">Si no esperabas este cambio, contacta a un administrador.</p>`
      );
    } catch (err) {
      console.error('Error enviando correo de cambio de contraseña:', err);
    }

    res.json({ usuario: serializarUsuario(rows[0]) });
  })
);

module.exports = router;
