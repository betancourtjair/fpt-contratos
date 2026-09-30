import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, unwrap } from '../../api.js';
import Spinner from '../../components/Spinner.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { formatMonto, formatFecha } from '../../utils.js';
import CamposForm from './CamposForm.jsx';
import { GRUPOS_LOCATION, valoresIniciales } from './campos.js';

export default function Locations() {
  const { esAdmin } = useAuth();
  const [locations, setLocations] = useState([]);
  const [brands, setBrands] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [brandFiltro, setBrandFiltro] = useState('');

  const [mostrarModal, setMostrarModal] = useState(false);
  const [form, setForm] = useState(() => valoresIniciales(GRUPOS_LOCATION));
  const [errorModal, setErrorModal] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      const [dl, db, dc] = await Promise.all([
        api.get('/arrendamientos/locations'),
        api.get('/arrendamientos/brands'),
        api.get('/arrendamientos/companies'),
      ]);
      setLocations(unwrap(dl, 'locations') || []);
      setBrands(unwrap(db, 'brands') || []);
      setCompanies(unwrap(dc, 'companies') || []);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las ubicaciones.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  const opciones = useMemo(() => ({
    brands: brands.map((b) => ({ value: b.id, label: b.nombre })),
    companies: companies.map((c) => ({ value: c.id, label: c.nombre })),
  }), [brands, companies]);

  const filtradas = locations.filter((l) => {
    if (brandFiltro && l.brandId !== brandFiltro) return false;
    if (busqueda && !`${l.nombre} ${l.locationNumber || ''} ${l.city || ''}`.toLowerCase().includes(busqueda.toLowerCase())) return false;
    return true;
  });

  function abrirModal() {
    setForm(valoresIniciales(GRUPOS_LOCATION));
    setErrorModal('');
    setMostrarModal(true);
  }

  async function crear(e) {
    e.preventDefault();
    setErrorModal('');
    if (!form.nombre) { setErrorModal('El nombre es requerido.'); return; }
    setGuardando(true);
    try {
      await api.post('/arrendamientos/locations', form);
      setMostrarModal(false);
      await cargar();
    } catch (err) {
      setErrorModal(err.message || 'No se pudo crear la ubicación.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Ubicaciones</h1>
          <p className="page-header-sub">Todas las ubicaciones de FPT y su lease activo.</p>
        </div>
        {esAdmin && <button className="btn btn-primary" onClick={abrirModal}>+ Nueva ubicación</button>}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="filters-bar">
        <input
          className="search-input"
          placeholder="Buscar por nombre, número o ciudad…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <select value={brandFiltro} onChange={(e) => setBrandFiltro(e.target.value)}>
          <option value="">Todos los brands</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
        </select>
      </div>

      {cargando ? (
        <Spinner />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Brand</th>
                <th>Ciudad</th>
                <th>Landlord</th>
                <th>Renta actual</th>
                <th>Vence</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 ? (
                <tr><td colSpan={7} className="table-empty">No hay ubicaciones para este filtro.</td></tr>
              ) : (
                filtradas.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <Link to={`/arrendamientos/ubicaciones/${l.id}`}>{l.nombre}</Link>
                      {l.locationNumber && <div className="muted" style={{ fontSize: 12 }}>#{l.locationNumber}</div>}
                    </td>
                    <td>{l.brandNombre || '—'}</td>
                    <td>{l.city || '—'}</td>
                    <td>{l.landlordNombre || '—'}</td>
                    <td>{formatMonto(l.rentaActual)}</td>
                    <td>{formatFecha(l.expirationDate)}</td>
                    <td><Link className="btn btn-secondary btn-sm" to={`/arrendamientos/ubicaciones/${l.id}`}>Ver</Link></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {mostrarModal && (
        <div className="modal-backdrop" onClick={() => !guardando && setMostrarModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Nueva ubicación</h3>
            {errorModal && <div className="alert alert-error">{errorModal}</div>}
            <form onSubmit={crear}>
              <CamposForm
                grupos={GRUPOS_LOCATION}
                valores={form}
                opciones={opciones}
                onChange={(k, v) => setForm((prev) => ({ ...prev, [k]: v }))}
              />
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setMostrarModal(false)} disabled={guardando}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Crear ubicación'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
