import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, unwrap } from '../../api.js';
import Spinner from '../../components/Spinner.jsx';
import EstatusBadge, { estatusLabel } from '../../components/EstatusBadge.jsx';
import { formatMonto, formatFecha } from '../../utils.js';

// Cada "vista" agrupa los contratos por bloque de estatus, según la organización acordada:
// - Solicitudes: todo lo que aún no se autoriza, o que se rechazó.
// - Contratos vigentes: lo ya autorizado y en operación (activo/por_vencer). Nota: el estatus
//   'autorizado' del enum no llega a usarse en la práctica — el backend salta directo de
//   'en_autorizacion' a 'activo' en cuanto se aprueba el último paso — pero se incluye aquí
//   por si algún día se usa como estado intermedio.
// - Archivo: lo que ya terminó su ciclo de vida (vencido o cancelado).
const VISTAS = {
  solicitudes: {
    titulo: 'Solicitudes',
    subtitulo: 'Borradores, en revisión, en autorización o rechazados.',
    estatusPermitidos: ['borrador', 'en_revision', 'en_autorizacion', 'rechazado'],
    mostrarNuevaSolicitud: true,
    vacioTexto: 'No se encontraron solicitudes con estos filtros.',
  },
  vigentes: {
    titulo: 'Contratos vigentes',
    subtitulo: 'Contratos ya autorizados y en operación.',
    estatusPermitidos: ['autorizado', 'activo', 'por_vencer'],
    mostrarNuevaSolicitud: false,
    vacioTexto: 'No hay contratos vigentes con estos filtros.',
  },
  archivo: {
    titulo: 'Archivo',
    subtitulo: 'Contratos vencidos o cancelados.',
    estatusPermitidos: ['vencido', 'cancelado'],
    mostrarNuevaSolicitud: false,
    vacioTexto: 'No hay contratos archivados con estos filtros.',
  },
};

export default function ListaContratos({ vista = 'solicitudes' }) {
  const config = VISTAS[vista] || VISTAS.solicitudes;

  const [contratos, setContratos] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [estatus, setEstatus] = useState('');
  const [tipo, setTipo] = useState('');
  const [q, setQ] = useState('');
  const [qInput, setQInput] = useState('');

  // Si se navega entre vistas (Solicitudes -> Contratos vigentes, etc.) el filtro de estatus
  // del sub-dropdown no debe arrastrarse de una vista a otra.
  useEffect(() => {
    setEstatus('');
    setQ('');
    setQInput('');
  }, [vista]);

  useEffect(() => {
    api.get('/tipos-contrato', { activo: 'false' })
      // Los de franquicia no aparecen aquí: este listado los excluye (viven en su propio
      // módulo), así que ofrecerlos como filtro nunca traería resultados.
      .then((data) => setTipos((unwrap(data, 'tiposContrato') || []).filter((t) => !t.esFranquicia)))
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
        // estatusIn fija el bloque de estatus de la vista; si además hay un sub-filtro de
        // estatus específico (dentro de ese mismo bloque), se manda como estatus normal.
        const data = await api.get('/contratos', {
          estatus,
          estatusIn: estatus ? '' : config.estatusPermitidos.join(','),
          tipo,
          tipoContratoId: tipo,
          q,
          texto: q,
        });
        if (activo) setContratos(unwrap(data, 'contratos') || []);
      } catch (err) {
        if (activo) setError(err.message || 'No se pudieron cargar los contratos.');
      } finally {
        if (activo) setCargando(false);
      }
    }
    cargar();
    return () => { activo = false; };
  }, [vista, estatus, tipo, q]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    setQ(qInput.trim());
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{config.titulo}</h1>
          <p className="page-header-sub">{config.subtitulo}</p>
        </div>
        {config.mostrarNuevaSolicitud && (
          <Link to="/contratos/nueva" className="btn btn-primary">+ Nueva solicitud</Link>
        )}
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
          {config.estatusPermitidos.map((op) => (
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
                  <td colSpan={8} className="table-empty">{config.vacioTexto}</td>
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

export function rutaListaParaEstatus(estatus) {
  for (const [vista, config] of Object.entries(VISTAS)) {
    if (config.estatusPermitidos.includes(estatus)) {
      return `/${vista === 'solicitudes' ? 'solicitudes' : vista === 'vigentes' ? 'contratos-vigentes' : 'archivo'}`;
    }
  }
  return '/solicitudes';
}
