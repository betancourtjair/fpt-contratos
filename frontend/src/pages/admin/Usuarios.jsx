import { useEffect, useState } from 'react';
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

export default function Usuarios() {
  const { usuario: usuarioActual } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [guardandoId, setGuardandoId] = useState(null);

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
                          {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
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
    </div>
  );
}
