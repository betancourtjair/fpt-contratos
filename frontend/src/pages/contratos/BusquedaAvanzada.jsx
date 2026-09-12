import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, unwrap } from '../../api.js';
import Spinner from '../../components/Spinner.jsx';
import EstatusBadge, { estatusLabel } from '../../components/EstatusBadge.jsx';
import { formatMonto, formatFecha } from '../../utils.js';

// Mismas listas fijas que usa ContratoForm.jsx para "parte" y "moneda" (no están exportadas
// desde ahí, así que se replican aquí para los filtros de búsqueda).
const MONEDAS = ['MXN', 'USD'];
const PARTES_FPT = [
  'Fitness para todos, S. de R.L. de C.V.',
  'Jeg-México Bueno, S. de R.L. de C.V.',
];

const ESTATUS_OPCIONES = [
  'borrador', 'en_revision', 'en_autorizacion', 'rechazado',
  'autorizado', 'activo', 'por_vencer', 'vencido', 'cancelado',
];

const COLUMNAS_ORDEN = [
  { valor: 'createdAt', etiqueta: 'Creado' },
  { valor: 'folio', etiqueta: 'Folio' },
  { valor: 'titulo', etiqueta: 'Título' },
  { valor: 'contraparteNombre', etiqueta: 'Contraparte' },
  { valor: 'monto', etiqueta: 'Monto' },
  { valor: 'fechaInicio', etiqueta: 'Fecha inicio' },
  { valor: 'fechaFin', etiqueta: 'Fecha fin' },
  { valor: 'estatus', etiqueta: 'Estatus' },
];

const FILTROS_VACIOS = {
  estatusSeleccionados: [],
  tipoContratoId: '',
  parte: '',
  moneda: '',
  montoMin: '',
  montoMax: '',
  fechaInicioDesde: '',
  fechaInicioHasta: '',
  fechaFinDesde: '',
  fechaFinHasta: '',
  proximosAVencer: false,
};

function csvEscape(valor) {
  return `"${String(valor ?? '').replace(/"/g, '""')}"`;
}

export default function BusquedaAvanzada() {
  const [tipos, setTipos] = useState([]);
  const [contratos, setContratos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [buscoAlMenosUnaVez, setBuscoAlMenosUnaVez] = useState(false);

  const [textoInput, setTextoInput] = useState('');
  const [texto, setTexto] = useState('');
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [orderBy, setOrderBy] = useState('createdAt');
  const [orderDir, setOrderDir] = useState('desc');

  const [pendientesAprobar, setPendientesAprobar] = useState([]);
  const [cargandoPendientes, setCargandoPendientes] = useState(true);

  useEffect(() => {
    api.get('/tipos-contrato', { activo: 'false' })
      .then((data) => setTipos((unwrap(data, 'tiposContrato') || []).filter((t) => !t.esFranquicia)))
      .catch(() => {});
  }, []);

  // Panel secundario: pendientes de mi aprobación (solo tiene sentido para aprobadores/admins,
  // pero si el usuario no tiene ninguno pendiente simplemente no se muestra el panel).
  useEffect(() => {
    let activo = true;
    api.get('/contratos/mis-pendientes-aprobar')
      .then((data) => { if (activo) setPendientesAprobar(unwrap(data, 'pendientes') || []); })
      .catch(() => {})
      .finally(() => { if (activo) setCargandoPendientes(false); });
    return () => { activo = false; };
  }, []);

  useEffect(() => {
    let activo = true;
    async function cargar() {
      setCargando(true);
      setError('');
      try {
        const data = await api.get('/contratos', {
          estatusIn: filtros.estatusSeleccionados.join(','),
          tipoContratoId: filtros.tipoContratoId,
          texto,
          parte: filtros.parte,
          moneda: filtros.moneda,
          montoMin: filtros.montoMin,
          montoMax: filtros.montoMax,
          fechaInicioDesde: filtros.fechaInicioDesde,
          fechaInicioHasta: filtros.fechaInicioHasta,
          fechaFinDesde: filtros.fechaFinDesde,
          fechaFinHasta: filtros.fechaFinHasta,
          proximosAVencer: filtros.proximosAVencer ? 'true' : '',
          orderBy,
          orderDir,
        });
        if (activo) setContratos(unwrap(data, 'contratos') || []);
      } catch (err) {
        if (activo) setError(err.message || 'No se pudo completar la búsqueda.');
      } finally {
        if (activo) {
          setCargando(false);
          setBuscoAlMenosUnaVez(true);
        }
      }
    }
    cargar();
    return () => { activo = false; };
  }, [filtros, texto, orderBy, orderDir]);

  function actualizarFiltro(campo, valor) {
    setFiltros((prev) => ({ ...prev, [campo]: valor }));
  }

  function toggleEstatus(valor) {
    setFiltros((prev) => {
      const yaEsta = prev.estatusSeleccionados.includes(valor);
      return {
        ...prev,
        estatusSeleccionados: yaEsta
          ? prev.estatusSeleccionados.filter((e) => e !== valor)
          : [...prev.estatusSeleccionados, valor],
      };
    });
  }

  function handleSearchSubmit(e) {
    e.preventDefault();
    setTexto(textoInput.trim());
  }

  function limpiarFiltros() {
    setFiltros(FILTROS_VACIOS);
    setTexto('');
    setTextoInput('');
    setOrderBy('createdAt');
    setOrderDir('desc');
  }

  function aplicarPreset(preset) {
    if (preset === 'activos') {
      setFiltros({ ...FILTROS_VACIOS, estatusSeleccionados: ['activo'] });
    } else if (preset === 'porVencer') {
      setFiltros({ ...FILTROS_VACIOS, estatusSeleccionados: ['activo', 'por_vencer'], proximosAVencer: true });
    } else if (preset === 'enAutorizacion') {
      setFiltros({ ...FILTROS_VACIOS, estatusSeleccionados: ['en_autorizacion'] });
    } else if (preset === 'vencidos') {
      setFiltros({ ...FILTROS_VACIOS, estatusSeleccionados: ['vencido'] });
    } else if (preset === 'rechazados') {
      setFiltros({ ...FILTROS_VACIOS, estatusSeleccionados: ['rechazado'] });
    }
    setTexto('');
    setTextoInput('');
  }

  function cambiarOrden(columna) {
    if (orderBy === columna) {
      setOrderDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setOrderBy(columna);
      setOrderDir('asc');
    }
  }

  const hayFiltrosActivos = useMemo(() => {
    return (
      texto ||
      filtros.estatusSeleccionados.length > 0 ||
      filtros.tipoContratoId ||
      filtros.parte ||
      filtros.moneda ||
      filtros.montoMin ||
      filtros.montoMax ||
      filtros.fechaInicioDesde ||
      filtros.fechaInicioHasta ||
      filtros.fechaFinDesde ||
      filtros.fechaFinHasta ||
      filtros.proximosAVencer
    );
  }, [texto, filtros]);

  function exportarCSV() {
    const encabezados = [
      'Folio', 'Título', 'Tipo de contrato', 'Parte', 'Contraparte', 'RFC contraparte',
      'Monto', 'Moneda', 'Fecha inicio', 'Fecha fin', 'Estatus',
    ];
    const filas = contratos.map((c) => [
      c.folio,
      c.titulo,
      c.tipoContrato?.nombre || c.tipoContratoNombre || '',
      c.parte || '',
      c.contraparteNombre || '',
      c.contraparteRfc || '',
      c.monto ?? '',
      c.moneda || '',
      c.fechaInicio ? c.fechaInicio.slice(0, 10) : '',
      c.fechaFin ? c.fechaFin.slice(0, 10) : '',
      estatusLabel(c.estatus),
    ]);
    const csv = [encabezados, ...filas].map((fila) => fila.map(csvEscape).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `busqueda-contratos-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function flechaOrden(columna) {
    if (orderBy !== columna) return null;
    return <span className="sort-arrow">{orderDir === 'asc' ? '▲' : '▼'}</span>;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Búsqueda avanzada</h1>
          <p className="page-header-sub">
            Filtra y ordena todos los contratos (excepto franquicias) por cualquier combinación de criterios.
          </p>
        </div>
      </div>

      {!cargandoPendientes && pendientesAprobar.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-title">Pendientes de tu aprobación ({pendientesAprobar.length})</div>
          <ul className="simple-list">
            {pendientesAprobar.slice(0, 5).map((p) => (
              <li key={p.id}>
                <span>
                  <Link to={`/contratos/${p.contratoId}`}>{p.folio}</Link> — {p.titulo}
                </span>
                <span>{formatMonto(p.monto, p.moneda)}</span>
              </li>
            ))}
          </ul>
          {pendientesAprobar.length > 5 && (
            <p className="hint" style={{ marginTop: 8 }}>
              Y {pendientesAprobar.length - 5} más. Usa los filtros de abajo (estatus "En autorización") para verlos todos.
            </p>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-title">Filtros</div>

        <form onSubmit={handleSearchSubmit}>
          <div className="field" style={{ marginBottom: 16 }}>
            <label>Texto (folio, título, contraparte o RFC)</label>
            <input
              type="search"
              placeholder="Buscar por folio, título, contraparte o RFC…"
              value={textoInput}
              onChange={(e) => setTextoInput(e.target.value)}
            />
          </div>

          <div className="field">
            <label>Estatus</label>
            <div className="estatus-checks">
              {ESTATUS_OPCIONES.map((op) => (
                <label className="estatus-check-item" key={op}>
                  <input
                    type="checkbox"
                    checked={filtros.estatusSeleccionados.includes(op)}
                    onChange={() => toggleEstatus(op)}
                  />
                  {estatusLabel(op)}
                </label>
              ))}
            </div>
          </div>

          <div className="search-grid" style={{ marginTop: 16 }}>
            <div className="field">
              <label>Tipo de contrato</label>
              <select
                value={filtros.tipoContratoId}
                onChange={(e) => actualizarFiltro('tipoContratoId', e.target.value)}
              >
                <option value="">Todos los tipos</option>
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Parte de FPT</label>
              <select value={filtros.parte} onChange={(e) => actualizarFiltro('parte', e.target.value)}>
                <option value="">Todas</option>
                {PARTES_FPT.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div className="field">
              <label>Moneda</label>
              <select value={filtros.moneda} onChange={(e) => actualizarFiltro('moneda', e.target.value)}>
                <option value="">Todas</option>
                {MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div className="field">
              <label>Monto</label>
              <div className="range-row">
                <input
                  type="number"
                  placeholder="Mín."
                  value={filtros.montoMin}
                  onChange={(e) => actualizarFiltro('montoMin', e.target.value)}
                />
                <span>a</span>
                <input
                  type="number"
                  placeholder="Máx."
                  value={filtros.montoMax}
                  onChange={(e) => actualizarFiltro('montoMax', e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label>Fecha de inicio</label>
              <div className="range-row">
                <input
                  type="date"
                  value={filtros.fechaInicioDesde}
                  onChange={(e) => actualizarFiltro('fechaInicioDesde', e.target.value)}
                />
                <span>a</span>
                <input
                  type="date"
                  value={filtros.fechaInicioHasta}
                  onChange={(e) => actualizarFiltro('fechaInicioHasta', e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label>Fecha de vencimiento</label>
              <div className="range-row">
                <input
                  type="date"
                  value={filtros.fechaFinDesde}
                  onChange={(e) => actualizarFiltro('fechaFinDesde', e.target.value)}
                />
                <span>a</span>
                <input
                  type="date"
                  value={filtros.fechaFinHasta}
                  onChange={(e) => actualizarFiltro('fechaFinHasta', e.target.value)}
                />
              </div>
            </div>

            <div className="field checkbox-row" style={{ marginTop: 8 }}>
              <input
                id="proximosAVencer"
                type="checkbox"
                checked={filtros.proximosAVencer}
                onChange={(e) => actualizarFiltro('proximosAVencer', e.target.checked)}
              />
              <label htmlFor="proximosAVencer">Solo próximos a vencer</label>
            </div>
          </div>

          <div className="preset-row">
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => aplicarPreset('activos')}>Activos</button>
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => aplicarPreset('porVencer')}>Próximos a vencer</button>
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => aplicarPreset('enAutorizacion')}>En autorización</button>
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => aplicarPreset('rechazados')}>Rechazados</button>
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => aplicarPreset('vencidos')}>Vencidos</button>
          </div>

          <div className="search-actions">
            <button type="submit" className="btn btn-primary">Buscar</button>
            {hayFiltrosActivos && (
              <button type="button" className="btn btn-ghost" onClick={limpiarFiltros}>Limpiar filtros</button>
            )}
          </div>
        </form>
      </div>

      {error && <div className="alert alert-error" style={{ marginTop: 16 }}>{error}</div>}

      <div className="results-toolbar">
        <span className="muted">
          {cargando ? 'Buscando…' : `${contratos.length} resultado${contratos.length === 1 ? '' : 's'}`}
        </span>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={exportarCSV}
          disabled={contratos.length === 0}
        >
          Exportar CSV
        </button>
      </div>

      {cargando && !buscoAlMenosUnaVez ? (
        <Spinner label="Cargando…" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {COLUMNAS_ORDEN.map((col) => (
                  <th key={col.valor} className="sortable-th" onClick={() => cambiarOrden(col.valor)}>
                    {col.etiqueta}{flechaOrden(col.valor)}
                  </th>
                ))}
                <th>Tipo</th>
                <th>Parte</th>
              </tr>
            </thead>
            <tbody>
              {contratos.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNAS_ORDEN.length + 2} className="table-empty">
                    No se encontraron contratos con estos filtros.
                  </td>
                </tr>
              ) : (
                contratos.map((c) => (
                  <tr key={c.id}>
                    <td>{formatFecha(c.createdAt)}</td>
                    <td><Link to={`/contratos/${c.id}`}>{c.folio}</Link></td>
                    <td>{c.titulo}</td>
                    <td>{c.contraparteNombre}</td>
                    <td>{formatMonto(c.monto, c.moneda)}</td>
                    <td>{formatFecha(c.fechaInicio)}</td>
                    <td>{formatFecha(c.fechaFin)}</td>
                    <td><EstatusBadge estatus={c.estatus} /></td>
                    <td>{c.tipoContrato?.nombre || c.tipoContratoNombre || '—'}</td>
                    <td>{c.parte || '—'}</td>
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
