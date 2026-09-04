import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, unwrap } from '../../api.js';
import Spinner from '../../components/Spinner.jsx';
import EstatusBadge, { estatusLabel } from '../../components/EstatusBadge.jsx';
import { formatMonto, formatFecha } from '../../utils.js';

const ESTATUS_OPCIONES = [
  'borrador', 'en_revision', 'en_autorizacion', 'rechazado',
  'autorizado', 'activo', 'por_vencer', 'vencido', 'cancelado',
];

export default function ListaContratos() {
  const [contratos, setContratos] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [estatus, setEstatus] = useState('');
  const [tipo, setTipo] = useState('');
  const [q, setQ] = useState('');
  const [qInput, setQInput] = useState('');

  useEffect(() => {
    api.get('/tipos-contrato', { activo: 'false' })
      .then((data) => setTipos(unwrap(data, 'tiposContrato') || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let activo = true;
    async function cargar() {
      setCargando(true);
      setError('');
      try {
        // Se envían ambos nombres de parámetro (tipo/tipoContratoId, q/texto) para ser
        // compatibles tanto con el contrato de API original como con el backend real.
        const data = await api.get('/contratos', { estatus, tipo, tipoContratoId: tipo, q, texto: q });
        if (activo) setContratos(unwrap(data, 'contratos') || []);
      } catch (err) {
        if (activo) setError(err.message || 'No se pudieron cargar los contratos.');
      } finally {
        if (activo) setCargando(false);
      }
    }
    cargar();
    return () => { activo = false; };
  }, [estatus, tipo, q]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setQ(qInput.trim());
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Contratos</h1>
          <p className="page-header-sub">Listado y búsqueda de expedientes contractuales.</p>
        </div>
        <Link to="/contratos/nueva" className="btn btn-primary">+ Nueva solicitud</Link>
      </div>

      <form className="filters-bar" onSubmit={handleSearchSubmit}>
        <input
          className="search-input"
          type="search"
          placeholder="Buscar por folio, título o contraparte…"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
        />
        <select value={estatus} onChange={(e) => setEstatus(e.target.value)}>
          <option value="">Todos los estatus</option>
          {ESTATUS_OPCIONES.map((op) => (
            <option key={op} value={op}>{estatusLabel(op)}</option>
          ))}
        </select>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          {tipos.map((t) => (
            <option key={t.id} value={t.id}>{t.nombre}</option>
          ))}
        </select>
        <button type="submit" className="btn btn-secondary">Buscar</button>
        {(estatus || tipo || q) && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => { setEstatus(''); setTipo(''); setQ(''); setQInput(''); }}
          >
            Limpiar filtros
          </button>
        )}
      </form>

      {error && <div className="alert alert-error">{error}</div>}

      {cargando ? (
        <Spinner label="Cargando contratos…" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Folio</th>
                <th>Título</th>
                <th>Tipo</th>
                <th>Parte</th>
                <th>Contraparte</th>
                <th>Monto</th>
                <th>Vencimiento</th>
                <th>Estatus</th>
              </tr>
            </thead>
            <tbody>
              {contratos.length === 0 ? (
                <tr>
                  <td colSpan={8} className="table-empty">No se encontraron contratos con estos filtros.</td>
                </tr>
              ) : (
                contratos.map((c) => (
                  <tr key={c.id}>
                    <td><Link to={`/contratos/${c.id}`}>{c.folio}</Link></td>
                    <td>{c.titulo}</td>
                    <td>{c.tipoContrato?.nombre || c.tipoContratoNombre || '—'}</td>
                    <td>{c.parte || '—'}</td>
                    <td>{c.contraparteNombre}</td>
                    <td>{formatMonto(c.monto, c.moneda)}</td>
                    <td>{formatFecha(c.fechaFin)}</td>
                    <td><EstatusBadge estatus={c.estatus} /></td>
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
