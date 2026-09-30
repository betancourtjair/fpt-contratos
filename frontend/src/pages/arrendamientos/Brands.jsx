import { useEffect, useState } from 'react';
import { api, unwrap } from '../../api.js';
import Spinner from '../../components/Spinner.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';

export default function Brands() {
  const { esAdmin } = useAuth();
  const [brands, setBrands] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [creando, setCreando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [nombreEditar, setNombreEditar] = useState('');

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      const d = await api.get('/arrendamientos/brands');
      setBrands(unwrap(d, 'brands') || []);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los brands.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  async function crear(e) {
    e.preventDefault();
    if (!nombreNuevo.trim()) return;
    setCreando(true);
    try {
      await api.post('/arrendamientos/brands', { nombre: nombreNuevo.trim() });
      setNombreNuevo('');
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo crear el brand.');
    } finally {
      setCreando(false);
    }
  }

  function abrirEditar(b) {
    setEditandoId(b.id);
    setNombreEditar(b.nombre);
  }

  async function guardarEditar(id) {
    try {
      await api.patch(`/arrendamientos/brands/${id}`, { nombre: nombreEditar });
      setEditandoId(null);
      await cargar();
    } catch (err) {
      window.alert(err.message || 'No se pudo renombrar el brand.');
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Brands</h1>
          <p className="page-header-sub">Marcas franquiciadas operadas por FPT (p. ej. Planet Fitness).</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {esAdmin && (
        <form onSubmit={crear} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input type="text" placeholder="Nombre del nuevo brand" value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} style={{ maxWidth: 320 }} />
          <button type="submit" className="btn btn-primary" disabled={creando}>+ Agregar brand</button>
        </form>
      )}

      {cargando ? (
        <Spinner />
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nombre</th><th>Ubicaciones</th><th>Leases activos</th>{esAdmin && <th></th>}</tr></thead>
            <tbody>
              {brands.length === 0 ? (
                <tr><td colSpan={4} className="table-empty">No hay brands registrados.</td></tr>
              ) : (
                brands.map((b) => (
                  <tr key={b.id}>
                    <td>
                      {editandoId === b.id ? (
                        <input type="text" value={nombreEditar} onChange={(e) => setNombreEditar(e.target.value)} autoFocus />
                      ) : b.nombre}
                    </td>
                    <td>{b.numeroUbicaciones}</td>
                    <td>{b.leasesActivos}</td>
                    {esAdmin && (
                      <td>
                        {editandoId === b.id ? (
                          <>
                            <button className="icon-btn" onClick={() => guardarEditar(b.id)}>Guardar</button>
                            <button className="icon-btn" onClick={() => setEditandoId(null)}>Cancelar</button>
                          </>
                        ) : (
                          <button className="icon-btn" onClick={() => abrirEditar(b)}>Renombrar</button>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
