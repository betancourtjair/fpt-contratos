import { useEffect, useMemo, useState } from 'react';
import { api, unwrap } from '../../api.js';
import Spinner from '../../components/Spinner.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';

const ROLES = [
  { value: 'super_admin', label: 'Super admin' },
  { value: 'admin', label: 'Administrador' },
  { value: 'juridico', label: 'Jurídico' },
  { value: 'aprobador', label: 'Aprobador' },
  { value: 'solicitante', label: 'Solicitante' },
  { value: 'lectura', label: 'Lectura' },
];

const NUEVO_USUARIO_VACIO = { nombre: '', email: '', password: '', rol: 'solicitante', area: '' };

export default function Usuarios() {
  const { usuario: usuarioActual } = useAuth();
  const esSuperAdmin = usuarioActual?.rol === 'super_admin';
  // Un admin normal no puede crear ni asignar super_admin; solo otro super_admin puede.
  const rolesAsignables = useMemo(
    () => (esSuperAdmin ? ROLES : ROLES.filter((r) => r.value !== 'super_admin')),
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

    setCreando(true);
    try {
      await api.post('/auth/register', {
        nombre: nuevoUsuario.nombre,
        email: nuevoUsuario.email,
        password: nuevoUsuario.password,
        rol: nuevoUsuario.rol,
        area: nuevoUsuario.area || undefined,
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
                <th>Estatus</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {usuarios.length === 0 ? (
                <tr><td colSpan={5} className="table-empty">No hay usuarios registrados.</td></tr>
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
                          {/* Si el usuario ya es super_admin y quien mira la pantalla no lo es,
                              se conserva la opción actual aunque no pueda asignarla de nuevo. */}
                          {(u.rol === 'super_admin' && !esSuperAdmin
                            ? [ROLES[0], ...rolesAsignables]
                            : rolesAsignables
                          ).map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      </td>
                      <td>
                        <span className={`badge ${u.activo !== false ? 'badge-activo' : 'badge-cancelado'}`}>
                          {u.activo !== false ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td>
                        <button
                          className="icon-btn"
                          disabled={guardandoId === u.id || esYo}
                          onClick={() => toggleActivo(u)}
                        >
                          {u.activo !== false ? 'Desactivar' : 'Activar'}
                        </button>
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
    </div>
  );
}
