import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { api, unwrap } from '../../api.js';
import { TIPOS, TIPO_POR_RUTA, CATEGORIAS } from './operacionesConfig.js';

const MAX_ARCHIVOS = 8;
const MAX_MB = 40;

export default function NuevaSolicitudOperaciones() {
  const { categoria, ruta } = useParams();
  const tipoKey = TIPO_POR_RUTA[ruta];
  const tipo = tipoKey ? TIPOS[tipoKey] : null;
  const navigate = useNavigate();

  const [clubes, setClubes] = useState([]);
  const [clubId, setClubId] = useState('');
  const [gerenteNombre, setGerenteNombre] = useState('');
  const [datos, setDatos] = useState({});
  const [validaciones, setValidaciones] = useState({});
  const [archivos, setArchivos] = useState([]);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.get('/operaciones/clubes')
      .then((data) => setClubes(unwrap(data, 'clubes') || []))
      .catch(() => setError('No se pudo cargar el catálogo de clubes.'));
  }, []);

  // Al cambiar de tipo de formulario (otra ruta) se limpia todo.
  useEffect(() => {
    setClubId('');
    setGerenteNombre('');
    setDatos({});
    setValidaciones({});
    setArchivos([]);
    setError('');
  }, [tipoKey]);

  const validacionesCompletas = useMemo(
    () => !tipo || tipo.validaciones.every((v) => validaciones[v.key] === true),
    [tipo, validaciones]
  );

  if (!tipo || tipo.categoria !== categoria) return <Navigate to="/operaciones" replace />;

  function agregarArchivos(e) {
    const nuevos = Array.from(e.target.files || []);
    e.target.value = '';
    const grandes = nuevos.filter((f) => f.size > MAX_MB * 1024 * 1024);
    if (grandes.length) {
      setError(`Cada archivo debe pesar máximo ${MAX_MB} MB: ${grandes.map((f) => f.name).join(', ')}.`);
      return;
    }
    setArchivos((prev) => {
      const total = [...prev, ...nuevos];
      if (total.length > MAX_ARCHIVOS) {
        setError(`Máximo ${MAX_ARCHIVOS} archivos por solicitud.`);
        return prev;
      }
      setError('');
      return total;
    });
  }

  function validar() {
    if (!clubId) return 'Selecciona el club.';
    if (!gerenteNombre.trim()) return 'Escribe el nombre del Gerente / Subgerente.';
    for (const c of tipo.campos) {
      const valor = String(datos[c.key] ?? '').trim();
      const obligatorio = c.requerido || (c.requeridoSi && datos[c.requeridoSi.key] === c.requeridoSi.valor);
      if (obligatorio && !valor) return `${c.label} es obligatorio${c.requeridoSi ? ' cuando no cuentas con las videograbaciones' : ''}.`;
    }
    if (tipo.archivos.requerido && archivos.length === 0) return `Adjunta: ${tipo.archivos.label}.`;
    if (!validacionesCompletas) return 'Debes marcar las tres validaciones antes de enviar.';
    return '';
  }

  async function enviar(e) {
    e.preventDefault();
    const msg = validar();
    if (msg) {
      setError(msg);
      return;
    }
    setEnviando(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('tipo', tipoKey);
      fd.append('clubId', clubId);
      fd.append('gerenteNombre', gerenteNombre.trim());
      fd.append('datos', JSON.stringify(datos));
      fd.append('validaciones', JSON.stringify(validaciones));
      archivos.forEach((f) => fd.append('archivos', f));
      const data = await api.post('/operaciones/solicitudes', fd);
      const solicitud = unwrap(data, 'solicitud');
      navigate(`/operaciones/solicitudes/${solicitud.id}`, { replace: true, state: { recienCreada: true } });
    } catch (err) {
      setError(err.message || 'No se pudo enviar la solicitud.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{tipo.label}</h1>
          <p className="page-header-sub">{CATEGORIAS[categoria].label} · {tipo.descripcion}</p>
        </div>
        <Link to="/operaciones" className="btn btn-secondary">Cancelar</Link>
      </div>

      <form className="card" onSubmit={enviar}>
        {error && <div className="alert alert-error">{error}</div>}

        <div className="field">
          <label htmlFor="club">Club *</label>
          <select id="club" value={clubId} onChange={(e) => setClubId(e.target.value)} required>
            <option value="">Selecciona un club…</option>
            {clubes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <small className="hint">{tipo.clubAyuda}</small>
        </div>

        <div className="field">
          <label htmlFor="gerente">Gerente / Subgerente *</label>
          <input id="gerente" type="text" value={gerenteNombre} onChange={(e) => setGerenteNombre(e.target.value)} required />
          <small className="hint">{tipo.gerenteAyuda}</small>
        </div>

        {tipo.campos.map((c) => {
          const obligatorio = c.requerido || (c.requeridoSi && datos[c.requeridoSi.key] === c.requeridoSi.valor);
          return (
            <div className="field" key={c.key}>
              <label htmlFor={c.key}>{c.label}{obligatorio ? ' *' : ''}</label>
              {c.tipo === 'textarea' && (
                <textarea id={c.key} rows={5} value={datos[c.key] || ''} onChange={(e) => setDatos((p) => ({ ...p, [c.key]: e.target.value }))} />
              )}
              {c.tipo === 'text' && (
                <input id={c.key} type="text" value={datos[c.key] || ''} onChange={(e) => setDatos((p) => ({ ...p, [c.key]: e.target.value }))} />
              )}
              {c.tipo === 'date' && (
                <input id={c.key} type="date" value={datos[c.key] || ''} onChange={(e) => setDatos((p) => ({ ...p, [c.key]: e.target.value }))} />
              )}
              {c.tipo === 'si_no' && (
                <select id={c.key} value={datos[c.key] || ''} onChange={(e) => setDatos((p) => ({ ...p, [c.key]: e.target.value }))}>
                  <option value="">Selecciona…</option>
                  <option value="si">Sí</option>
                  <option value="no">No</option>
                </select>
              )}
              <small className="hint">{c.ayuda}</small>
            </div>
          );
        })}

        <div className="field">
          <label htmlFor="archivos">{tipo.archivos.label}{tipo.archivos.requerido ? ' *' : ''}</label>
          <input id="archivos" type="file" multiple onChange={agregarArchivos} />
          <small className="hint">
            {tipo.archivos.ayuda} Hasta {MAX_ARCHIVOS} archivos de {MAX_MB} MB cada uno.
          </small>
          {archivos.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {archivos.map((f, i) => (
                <li key={`${f.name}-${i}`}>
                  {f.name} ({(f.size / 1024 / 1024).toFixed(1)} MB){' '}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setArchivos((p) => p.filter((_, j) => j !== i))}>Quitar</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {tipo.validaciones.length > 0 && (
          <div className="field-group">
            <div className="field-group-title">Validaciones</div>
            {tipo.validaciones.map((v) => (
              <div className="field checkbox-row" key={v.key}>
                <input
                  id={v.key}
                  type="checkbox"
                  checked={validaciones[v.key] === true}
                  onChange={(e) => setValidaciones((p) => ({ ...p, [v.key]: e.target.checked }))}
                />
                <label htmlFor={v.key} style={{ marginBottom: 0 }}>{v.label}</label>
              </div>
            ))}
          </div>
        )}

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={enviando || !validacionesCompletas}>
            {enviando ? 'Enviando…' : 'Enviar solicitud'}
          </button>
          <Link to="/operaciones" className="btn btn-secondary">Cancelar</Link>
        </div>
      </form>
    </div>
  );
}
