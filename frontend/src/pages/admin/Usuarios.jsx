import { useEffect, useMemo, useState } from 'react';
import { api, unwrap } from '../../api.js';
import Spinner from '../../components/Spinner.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';

const ROLES = [
  { value: 'super_admin', label: 'Super admin' },
  { value: 'admin', label: 'Administrador' },
  { value: 'ceo', label: 'CEO' },
  { value: 'cfo', label: 'CFO' },
  { value: 'juridico', label: 'Jurídico' },
  { value: 'aprobador', label: 'Aprobador' },
  { value: 'solicitante', label: 'Solicitante' },
  { value: 'lectura', label: 'Lectura' },
];

// Igual que en el backend: solo un super_admin puede asignar estos roles (CEO/CFO son, sobre
// todo, un "puesto" — los pasos de flujo ya identifican a la persona fija por id, no por rol).
const ROLES_RESTRINGIDOS = ['super_admin', 'ceo', 'cfo'];

// Sentinel del <select> de jefe directo para "esta persona no tiene" (dirección general) — se
// manda como jefeDirectoId: null, distinto de dejarlo sin tocar (por eso no puede ser '').
const SIN_JEFE_DIRECTO = '__sin_jefe_directo__';

const NUEVO_USUARIO_VACIO = {
  nombre: '', email: '', password: '', rol: 'solicitante', area: '', jefeDirectoId: '',
  // Marcado por default: al primer login se le exige establecer su propia contraseña.
  debeCambiarPassword: true,
};

export default function Usuarios() {
  const { usuario: usuarioActual } = useAuth();
  const esSuperAdmin = usuarioActual?.rol === 'super_admin';
  // Un admin normal no puede crear ni asignar super_admin, CEO ni CFO; solo otro super_admin puede.
  const rolesAsignables = useMemo(
    () => (esSuperAdmin ? ROLES : ROLES.filter((r) => !ROLES_RESTRINGIDOS.includes(r.value))),
    [esSuperAdmin]
  );

  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [guardandoId, setGuardandoId] = useState(null);

  const [mostrarModal, setMostrarModal] = useState(false);
  const [nuevoUsuario, setNuevoUsuario] = useState(NUEVO_USUARIO_VACIO);
  const [errorModal, setErrorModal] = useState('');
  const [creando, setCreando] = useState(false);

  // Modal de "Super Admin" para fijarle una contraseña nueva a cualquier usuario sin
  // conocer la actual (soporte / recuperación de acceso).
  const [usuarioPasswordObjetivo, setUsuarioPasswordObjetivo] = useState(null);
  const [nuevaPassword, setNuevaPassword] = useState('');
  const [forzarCambioPassword, setForzarCambioPassword] = useState(true);
  const [errorModalPassword, setErrorModalPassword] = useState('');
  const [guardandoPassword, setGuardandoPassword] = useState(false);

  // Modal de "Super Admin" para editar nombre, correo y rol (incluido CEO/CFO) de cualquier
  // usuario. El resto de la tabla (rol/jefe directo/activo) ya era editable inline para admin+;
  // esto se agrega aparte porque el correo (usuario de acceso) es más sensible y se reserva a
  // super_admin.
  const [usuarioEditar, setUsuarioEditar] = useState(null);
  const [formEditar, setFormEditar] = useState(null);
  const [errorModalEditar, setErrorModalEditar] = useState('');
  const [guardandoEditar, setGuardandoEditar] = useState(false);

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      const data = await api.get('/usuarios');
      setUsuarios(unwrap(data, 'usuarios') || []);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los usuarios.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  function abrirModal() {
    setNuevoUsuario(NUEVO_USUARIO_VACIO);
    setErrorModal('');
    setMostrarModal(true);
  }

  function cerrarModal() {
    if (creando) return;
    setMostrarModal(false);
  }

  function actualizarCampo(campo, valor) {
    setNuevoUsuario((prev) => ({ ...prev, [campo]: valor }));
  }

  async function crearUsuario(e) {
    e.preventDefault();
    setErrorModal('');

    if (!nuevoUsuario.nombre || !nuevoUsuario.email || !nuevoUsuario.password) {
      setErrorModal('Nombre, correo y contraseña son requeridos.');
      return;
    }
    if (nuevoUsuario.password.length < 8) {
      setErrorModal('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    // Obligatorio desde el alta (aunque la respuesta válida sea "no tiene"): el flujo de
    // autorización de contratos usa el jefe directo para resolver quién es "Cabeza del Área
    // Solicitante", y pedirlo aquí evita que quede en blanco por descuido.
    if (!nuevoUsuario.jefeDirectoId) {
      setErrorModal('Indica el jefe directo (o marca "No tiene jefe directo" si aplica).');
      return;
    }

    setCreando(true);
    try {
      await api.post('/auth/register', {
        nombre: nuevoUsuario.nombre,
        email: nuevoUsuario.email,
        password: nuevoUsuario.password,
        rol: nuevoUsuario.rol,
        area: nuevoUsuario.area || undefined,
        jefeDirectoId: nuevoUsuario.jefeDirectoId === SIN_JEFE_DIRECTO ? null : nuevoUsuario.jefeDirectoId,
        debeCambiarPassword: nuevoUsuario.debeCambiarPassword,
      });
      setMostrarModal(false);
      await cargar();
    } catch (err) {
      setErrorModal(err.message || 'No se pudo crear el usuario.');
    } finally {
      setCreando(false);
    }
  }

  async function cambiarRol(u, rol) {
    setGuardandoId(u.id);
    setError('');
    try {
      await api.patch(`/usuarios/${u.id}`, { rol });
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo cambiar el rol.');
    } finally {
      setGuardandoId(null);
    }
  }

  async function cambiarJefeDirecto(u, jefeDirectoId) {
    setGuardandoId(u.id);
    setError('');
    try {
      await api.patch(`/usuarios/${u.id}`, {
        jefeDirectoId: jefeDirectoId === SIN_JEFE_DIRECTO ? null : jefeDirectoId,
      });
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo cambiar el jefe directo.');
    } finally {
      setGuardandoId(null);
    }
  }

  function abrirModalPassword(u) {
    setUsuarioPasswordObjetivo(u);
    setNuevaPassword('');
    setForzarCambioPassword(true);
    setErrorModalPassword('');
  }

  function cerrarModalPassword() {
    if (guardandoPassword) return;
    setUsuarioPasswordObjetivo(null);
  }

  function generarPasswordAleatoria() {
    const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let pass = '';
    for (let i = 0; i < 12; i++) pass += alfabeto[Math.floor(Math.random() * alfabeto.length)];
    setNuevaPassword(pass);
  }

  async function guardarNuevaPassword(e) {
    e.preventDefault();
    setErrorModalPassword('');
    if (!nuevaPassword || nuevaPassword.length < 8) {
      setErrorModalPassword('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    setGuardandoPassword(true);
    try {
      await api.patch(`/usuarios/${usuarioPasswordObjetivo.id}/password`, {
        passwordNueva: nuevaPassword,
        debeCambiarPassword: forzarCambioPassword,
      });
      setUsuarioPasswordObjetivo(null);
    } catch (err) {
      setErrorModalPassword(err.message || 'No se pudo cambiar la contraseña.');
    } finally {
      setGuardandoPassword(false);
    }
  }

  function abrirModalEditar(u) {
    setUsuarioEditar(u);
    setFormEditar({ nombre: u.nombre || '', email: u.email || '', rol: u.rol, area: u.area || '' });
    setErrorModalEditar('');
  }

  function cerrarModalEditar() {
    if (guardandoEditar) return;
    setUsuarioEditar(null);
  }

  function actualizarCampoEditar(campo, valor) {
    setFormEditar((prev) => ({ ...prev, [campo]: valor }));
  }

  async function guardarEdicion(e) {
    e.preventDefault();
    setErrorModalEditar('');
    if (!formEditar.nombre || !formEditar.email) {
      setErrorModalEditar('Nombre y correo son requeridos.');
      return;
    }
    setGuardandoEditar(true);
    try {
      await api.patch(`/usuarios/${usuarioEditar.id}`, {
        nombre: formEditar.nombre,
        email: formEditar.email,
        rol: formEditar.rol,
        area: formEditar.area || null,
      });
      setUsuarioEditar(null);
      await cargar();
    } catch (err) {
      setErrorModalEditar(err.message || 'No se pudo guardar los cambios.');
    } finally {
      setGuardandoEditar(false);
    }
  }

  async function toggleActivo(u) {
    setGuardandoId(u.id);
    setError('');
    try {
      await api.patch(`/usuarios/${u.id}`, { activo: !(u.activo !== false) });
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo actualizar el estatus del usuario.');
    } finally {
      setGuardandoId(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Usuarios</h1>
          <p className="page-header-sub">Administra roles y acceso de los usuarios de la plataforma.</p>
        </div>
        <button className="btn btn-primary" onClick={abrirModal}>+ Nuevo usuario</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {cargando ? (
        <Spinner />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Rol</th>
                <th>Jefe directo</th>
                <th>Estatus</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {usuarios.length === 0 ? (
                <tr><td colSpan={6} className="table-empty">No hay usuarios registrados.</td></tr>
              ) : (
                usuarios.map((u) => {
                  const esYo = String(u.id) === String(usuarioActual?.id);
                  return (
                    <tr key={u.id}>
                      <td>{u.nombre} {esYo && <span className="tag-pill">Tú</span>}</td>
                      <td>{u.email}</td>
                      <td>
                        <select
                          value={u.rol}
                          disabled={guardandoId === u.id || esYo}
                          onChange={(e) => cambiarRol(u, e.target.value)}
                        >
                          {/* Si el usuario ya tiene un rol restringido (super_admin/CEO/CFO) y quien
                              mira la pantalla no es super_admin, se conserva la opción actual
                              aunque no pueda asignarla de nuevo. */}
                          {(ROLES_RESTRINGIDOS.includes(u.rol) && !esSuperAdmin
                            ? [ROLES.find((r) => r.value === u.rol), ...rolesAsignables]
                            : rolesAsignables
                          ).map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      </td>
                      <td>
                        <select
                          value={u.jefeDirectoId || SIN_JEFE_DIRECTO}
                          disabled={guardandoId === u.id}
                          onChange={(e) => cambiarJefeDirecto(u, e.target.value)}
                        >
                          <option value={SIN_JEFE_DIRECTO}>— Sin jefe directo —</option>
                          {usuarios.filter((otro) => otro.id !== u.id).map((otro) => (
                            <option key={otro.id} value={otro.id}>{otro.nombre}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <span className={`badge ${u.activo !== false ? 'badge-activo' : 'badge-cancelado'}`}>
                          {u.activo !== false ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button
                            className="icon-btn"
                            disabled={guardandoId === u.id || esYo}
                            onClick={() => toggleActivo(u)}
                          >
                            {u.activo !== false ? 'Desactivar' : 'Activar'}
                          </button>
                          {esSuperAdmin && (
                            <button
                              className="icon-btn"
                              disabled={guardandoId === u.id}
                              onClick={() => abrirModalEditar(u)}
                            >
                              Editar
                            </button>
                          )}
                          {esSuperAdmin && (
                            <button
                              className="icon-btn"
                              disabled={guardandoId === u.id || esYo}
                              onClick={() => abrirModalPassword(u)}
                            >
                              Cambiar contraseña
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {mostrarModal && (
        <div className="modal-backdrop" onClick={cerrarModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Nuevo usuario</h3>

            {errorModal && <div className="alert alert-error">{errorModal}</div>}

            <form onSubmit={crearUsuario}>
              <div className="field">
                <label htmlFor="nuevo-nombre">Nombre completo *</label>
                <input
                  id="nuevo-nombre"
                  type="text"
                  value={nuevoUsuario.nombre}
                  onChange={(e) => actualizarCampo('nombre', e.target.value)}
                  autoFocus
                />
              </div>

              <div className="field">
                <label htmlFor="nuevo-email">Correo electrónico *</label>
                <input
                  id="nuevo-email"
                  type="email"
                  value={nuevoUsuario.email}
                  onChange={(e) => actualizarCampo('email', e.target.value)}
                  placeholder="nombre@fpt.com.mx"
                />
              </div>

              <div className="field">
                <label htmlFor="nuevo-password">Contraseña temporal *</label>
                <input
                  id="nuevo-password"
                  type="text"
                  value={nuevoUsuario.password}
                  onChange={(e) => actualizarCampo('password', e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                />
              </div>

              <div className="field">
                <label htmlFor="nuevo-rol">Rol *</label>
                <select
                  id="nuevo-rol"
                  value={nuevoUsuario.rol}
                  onChange={(e) => actualizarCampo('rol', e.target.value)}
                >
                  {rolesAsignables.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>

              <div className="field">
                <label htmlFor="nuevo-area">Área (opcional)</label>
                <input
                  id="nuevo-area"
                  type="text"
                  value={nuevoUsuario.area}
                  onChange={(e) => actualizarCampo('area', e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="nuevo-jefe-directo">Jefe directo *</label>
                <select
                  id="nuevo-jefe-directo"
                  value={nuevoUsuario.jefeDirectoId}
                  onChange={(e) => actualizarCampo('jefeDirectoId', e.target.value)}
                >
                  <option value="">Selecciona…</option>
                  <option value={SIN_JEFE_DIRECTO}>— No tiene jefe directo (dirección general) —</option>
                  {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                </select>
                <p className="hint" style={{ marginTop: 4, marginBottom: 0 }}>
                  El flujo de autorización de contratos lo usa para saber quién es la "Cabeza del Área" de esta persona.
                </p>
              </div>

              <div className="field checkbox-row">
                <input
                  id="nuevo-debe-cambiar-password"
                  type="checkbox"
                  checked={!!nuevoUsuario.debeCambiarPassword}
                  onChange={(e) => actualizarCampo('debeCambiarPassword', e.target.checked)}
                />
                <label htmlFor="nuevo-debe-cambiar-password" style={{ marginBottom: 0 }}>
                  Pedir cambiar la contraseña en el primer inicio de sesión
                </label>
              </div>

              <p className="muted" style={{ fontSize: 12, marginTop: -8 }}>
                Se le enviará un correo a {nuevoUsuario.email || 'su dirección'} con el sitio y esta contraseña temporal.
              </p>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={cerrarModal} disabled={creando}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={creando}>
                  {creando ? 'Creando…' : 'Crear usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {usuarioPasswordObjetivo && (
        <div className="modal-backdrop" onClick={cerrarModalPassword}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Cambiar contraseña</h3>
            <p className="muted" style={{ marginTop: -8 }}>
              Vas a establecer una nueva contraseña para <b>{usuarioPasswordObjetivo.nombre}</b> ({usuarioPasswordObjetivo.email}).
              No necesitas conocer la contraseña actual.
            </p>

            {errorModalPassword && <div className="alert alert-error">{errorModalPassword}</div>}

            <form onSubmit={guardarNuevaPassword}>
              <div className="field">
                <label htmlFor="reset-password">Nueva contraseña *</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    id="reset-password"
                    type="text"
                    value={nuevaPassword}
                    onChange={(e) => setNuevaPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    autoFocus
                    style={{ flex: 1 }}
                  />
                  <button type="button" className="btn btn-secondary" onClick={generarPasswordAleatoria}>
                    Generar
                  </button>
                </div>
              </div>

              <div className="field checkbox-row">
                <input
                  id="reset-debe-cambiar"
                  type="checkbox"
                  checked={forzarCambioPassword}
                  onChange={(e) => setForzarCambioPassword(e.target.checked)}
                />
                <label htmlFor="reset-debe-cambiar" style={{ marginBottom: 0 }}>
                  Pedir cambiarla en el siguiente inicio de sesión
                </label>
              </div>

              <p className="muted" style={{ fontSize: 12, marginTop: -8 }}>
                Se le enviará un correo a {usuarioPasswordObjetivo.email} avisando que su contraseña cambió.
              </p>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={cerrarModalPassword} disabled={guardandoPassword}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={guardandoPassword}>
                  {guardandoPassword ? 'Guardando…' : 'Guardar contraseña'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {usuarioEditar && formEditar && (
        <div className="modal-backdrop" onClick={cerrarModalEditar}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Editar usuario</h3>

            {errorModalEditar && <div className="alert alert-error">{errorModalEditar}</div>}

            <form onSubmit={guardarEdicion}>
              <div className="field">
                <label htmlFor="editar-nombre">Nombre completo *</label>
                <input
                  id="editar-nombre"
                  type="text"
                  value={formEditar.nombre}
                  onChange={(e) => actualizarCampoEditar('nombre', e.target.value)}
                  autoFocus
                />
              </div>

              <div className="field">
                <label htmlFor="editar-email">Correo electrónico *</label>
                <input
                  id="editar-email"
                  type="email"
                  value={formEditar.email}
                  onChange={(e) => actualizarCampoEditar('email', e.target.value)}
                  placeholder="nombre@fpt.com.mx"
                />
                <p className="hint" style={{ marginTop: 4, marginBottom: 0 }}>
                  Es el usuario con el que inicia sesión; si lo cambias, deberá usar el nuevo correo la próxima vez.
                </p>
              </div>

              <div className="field">
                <label htmlFor="editar-rol">Rol *</label>
                <select
                  id="editar-rol"
                  value={formEditar.rol}
                  onChange={(e) => actualizarCampoEditar('rol', e.target.value)}
                >
                  {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>

              <div className="field">
                <label htmlFor="editar-area">Área (opcional)</label>
                <input
                  id="editar-area"
                  type="text"
                  value={formEditar.area}
                  onChange={(e) => actualizarCampoEditar('area', e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={cerrarModalEditar} disabled={guardandoEditar}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={guardandoEditar}>
                  {guardandoEditar ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
