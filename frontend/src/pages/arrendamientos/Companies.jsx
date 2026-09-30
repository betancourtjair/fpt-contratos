import { useEffect, useState } from 'react';
import { api, unwrap } from '../../api.js';
import Spinner from '../../components/Spinner.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';

const CAMPOS_COMPANY = [
  { key: 'nombre', label: 'Nombre *', type: 'text' },
  { key: 'ein', label: 'RFC / EIN', type: 'text' },
  { key: 'yearEstablished', label: 'Año de constitución', type: 'number' },
  { key: 'address1', label: 'Dirección 1', type: 'text' },
  { key: 'address2', label: 'Dirección 2', type: 'text' },
  { key: 'city', label: 'Ciudad', type: 'text' },
  { key: 'state', label: 'Estado', type: 'text' },
  { key: 'zip', label: 'C.P.', type: 'text' },
  { key: 'country', label: 'País', type: 'text' },
];

const VACIO = Object.fromEntries(CAMPOS_COMPANY.map((c) => [c.key, '']));

export default function Companies() {
  const { esAdmin } = useAuth();
  const [companies, setCompanies] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [mostrarModal, setMostrarModal] = useState(false);
  const [form, setForm] = useState(VACIO);
  const [errorModal, setErrorModal] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      const d = await api.get('/arrendamientos/companies');
      setCompanies(unwrap(d, 'companies') || []);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las companies.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  function abrirModal() {
    setForm(VACIO);
    setErrorModal('');
    setMostrarModal(true);
  }

  async function crear(e) {
    e.preventDefault();
    if (!form.nombre.trim()) { setErrorModal('El nombre es requerido.'); return; }
    setGuardando(true);
    try {
      await api.post('/arrendamientos/companies', form);
      setMostrarModal(false);
      await cargar();
    } catch (err) {
      setErrorModal(err.message || 'No se pudo crear la company.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Companies</h1>
          <p className="page-header-sub">Entidades legales inquilinas (tenant) que firman los leases.</p>
        </div>
        {esAdmin && <button className="btn btn-primary" onClick={abrirModal}>+ Nueva company</button>}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {cargando ? (
        <Spinner />
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nombre</th><th>RFC / EIN</th><th>Ciudad</th><th>Ubicaciones</th><th>Leases activos</th></tr></thead>
            <tbody>
              {companies.length === 0 ? (
                <tr><td colSpan={5} className="table-empty">No hay companies registradas.</td></tr>
              ) : (
                companies.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nombre}</td>
                    <td>{c.ein || '—'}</td>
                    <td>{c.city || '—'}</td>
                    <td>{c.numeroUbicaciones}</td>
                    <td>{c.leasesActivos}</td>
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
            <h3>Nueva company</h3>
            {errorModal && <div className="alert alert-error">{errorModal}</div>}
            <form onSubmit={crear}>
              <div className="form-row">
                {CAMPOS_COMPANY.map((c) => (
                  <div className="field" key={c.key}>
                    <label htmlFor={`company-${c.key}`}>{c.label}</label>
                    <input
                      id={`company-${c.key}`}
                      type={c.type}
                      value={form[c.key]}
                      onChange={(e) => setForm((prev) => ({ ...prev, [c.key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setMostrarModal(false)} disabled={guardando}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Crear company'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
