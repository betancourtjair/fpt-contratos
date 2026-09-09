import { useEffect, useState } from 'react';
import { api, unwrap } from '../../api.js';
import Spinner from '../../components/Spinner.jsx';

const CLUB_VACIO = { nombre: '', direccion: '' };

export default function Clubes() {
  const [clubes, setClubes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [guardandoId, setGuardandoId] = useState(null);

  const [mostrarModal, setMostrarModal] = useState(false);
  const [clubEditando, setClubEditando] = useState(null);
  const [formClub, setFormClub] = useState(CLUB_VACIO);
  const [errorModal, setErrorModal] = useState('');
  const [guardandoModal, setGuardandoModal] = useState(false);

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      const data = await api.get('/clubes');
      setClubes(unwrap(data, 'clubes') || []);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los clubes.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  function abrirModalNuevo() {
    setClubEditando(null);
    setFormClub(CLUB_VACIO);
    setErrorModal('');
    setMostrarModal(true);
  }

  function abrirModalEditar(club) {
    setClubEditando(club);
    setFormClub({ nombre: club.nombre || '', direccion: club.direccion || '' });
    setErrorModal('');
    setMostrarModal(true);
  }

  function cerrarModal() {
    if (guardandoModal) return;
    setMostrarModal(false);
  }

  async function guardarClub(e) {
    e.preventDefault();
    setErrorModal('');

    if (!formClub.nombre.trim()) {
      setErrorModal('El nombre del club es requerido.');
      return;
    }

    setGuardandoModal(true);
    try {
      if (clubEditando) {
        await api.patch(`/clubes/${clubEditando.id}`, {
          nombre: formClub.nombre.trim(),
          direccion: formClub.direccion || null,
        });
      } else {
        await api.post('/clubes', {
          nombre: formClub.nombre.trim(),
          direccion: formClub.direccion || null,
        });
      }
      setMostrarModal(false);
      await cargar();
    } catch (err) {
      setErrorModal(err.message || 'No se pudo guardar el club.');
    } finally {
      setGuardandoModal(false);
    }
  }

  async function toggleActivo(club) {
    setGuardandoId(club.id);
    setError('');
    try {
      await api.patch(`/clubes/${club.id}`, { activo: !(club.activo !== false) });
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo actualizar el estatus del club.');
    } finally {
      setGuardandoId(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Clubes</h1>
          <p className="page-header-sub">Catálogo de clubes (sucursales) para contratos de franquicia.</p>
        </div>
        <button className="btn btn-primary" onClick={abrirModalNuevo}>+ Nuevo club</button>
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
                <th>Dirección</th>
                <th>Contratos vigentes</th>
                <th>Estatus</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clubes.length === 0 ? (
                <tr><td colSpan={5} className="table-empty">No hay clubes registrados.</td></tr>
              ) : (
                clubes.map((cl) => (
                  <tr key={cl.id}>
                    <td>{cl.nombre}</td>
                    <td>{cl.direccion || '—'}</td>
                    <td>{cl.contratosVigentes ?? 0}</td>
                    <td>
                      <span className={`badge ${cl.activo !== false ? 'badge-activo' : 'badge-cancelado'}`}>
                        {cl.activo !== false ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td style={{ display: 'flex', gap: 8 }}>
                      <button className="icon-btn" disabled={guardandoId === cl.id} onClick={() => abrirModalEditar(cl)}>
                        Editar
                      </button>
                      <button className="icon-btn" disabled={guardandoId === cl.id} onClick={() => toggleActivo(cl)}>
                        {cl.activo !== false ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {mostrarModal && (
        <div className="modal-backdrop" onClick={cerrarModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{clubEditando ? 'Editar club' : 'Nuevo club'}</h3>

            {errorModal && <div className="alert alert-error">{errorModal}</div>}

            <form onSubmit={guardarClub}>
              <div className="field">
                <label htmlFor="club-nombre">Nombre *</label>
                <input
                  id="club-nombre"
                  type="text"
                  value={formClub.nombre}
                  onChange={(e) => setFormClub((prev) => ({ ...prev, nombre: e.target.value }))}
                  autoFocus
                />
              </div>

              <div className="field">
                <label htmlFor="club-direccion">Dirección (opcional)</label>
                <input
                  id="club-direccion"
                  type="text"
                  value={formClub.direccion}
                  onChange={(e) => setFormClub((prev) => ({ ...prev, direccion: e.target.value }))}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={cerrarModal} disabled={guardandoModal}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={guardandoModal}>
                  {guardandoModal ? 'Guardando…' : clubEditando ? 'Guardar cambios' : 'Crear club'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
