import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, unwrap } from '../../api.js';
import Spinner from '../../components/Spinner.jsx';
import { esVisible } from './solicitudesConfig.jsx';

const MAX_MB = 40;
const RAPIDOS = ['Pendiente de confirmar', 'No disponible', 'No aplica'];

function Campo({ c, valor, onChange }) {
  const id = `f-${c.id}`;
  const obligatorio = c.requerido ? ' *' : '';
  if (c.tipo === 'radio' || c.tipo === 'select') {
    return (
      <div className="field">
        <label htmlFor={id}>{c.label}{obligatorio}</label>
        <select id={id} value={valor || ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">Selecciona…</option>
          {c.opciones.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    );
  }
  if (c.tipo === 'multicheck') {
    const sel = Array.isArray(valor) ? valor : [];
    return (
      <div className="field">
        <label>{c.label}{obligatorio}</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px' }}>
          {c.opciones.map((o) => (
            <label key={o.value} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={sel.includes(o.value)}
                onChange={(e) => onChange(e.target.checked ? [...sel, o.value] : sel.filter((x) => x !== o.value))}
              />
              {o.label}
            </label>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="field">
      <label htmlFor={id}>{c.label}{obligatorio}</label>
      {c.tipo === 'textarea' ? (
        <textarea id={id} rows={3} value={valor || ''} onChange={(e) => onChange(e.target.value)} />
      ) : c.tipo === 'date' ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input id={id} type="text" style={{ flex: 1 }} placeholder="dd/mm/aaaa o texto libre (p. ej. Pendiente de confirmar)" value={valor || ''} onChange={(e) => onChange(e.target.value)} />
          <input
            type="date"
            aria-label={`Elegir fecha: ${c.label}`}
            title="Elegir fecha del calendario"
            style={{ width: 150 }}
            value=""
            onChange={(e) => { if (e.target.value) { const [y, m, d] = e.target.value.split('-'); onChange(`${d}/${m}/${y}`); } }}
          />
        </div>
      ) : (
        <input id={id} type="text" value={valor || ''} onChange={(e) => onChange(e.target.value)} />
      )}
      {c.ayuda && <small className="hint">{c.ayuda}</small>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
        {RAPIDOS.map((t) => (
          <button key={t} type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(t)}>{t}</button>
        ))}
      </div>
    </div>
  );
}

export default function NuevaSolicitudArrendamiento() {
  const navigate = useNavigate();
  const [secciones, setSecciones] = useState(null);
  const [datos, setDatos] = useState({});
  const [archivos, setArchivos] = useState({});
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.get('/arrendamientos/solicitudes/formulario')
      .then((d) => setSecciones(d.secciones || []))
      .catch((err) => setError(err.message || 'No se pudo cargar el formulario.'));
  }, []);

  function poner(id, v) { setDatos((p) => ({ ...p, [id]: v })); }

  function elegirArchivo(docId, e) {
    const f = e.target.files?.[0];
    if (f && f.size > MAX_MB * 1024 * 1024) {
      setError(`Cada archivo debe pesar máximo ${MAX_MB} MB: ${f.name}.`);
      e.target.value = '';
      return;
    }
    setError('');
    setArchivos((p) => {
      const n = { ...p };
      if (f) n[docId] = f; else delete n[docId];
      return n;
    });
  }

  function validar() {
    const faltan = [];
    for (const s of secciones) {
      for (const c of s.campos) {
        if (!esVisible(c, datos) || !c.requerido) continue;
        const v = datos[c.id];
        if (v === undefined || v === null || (Array.isArray(v) ? v.length === 0 : String(v).trim() === '')) faltan.push(c.label);
      }
    }
    return faltan;
  }

  async function enviar(e) {
    e.preventDefault();
    const faltan = validar();
    if (faltan.length) {
      setError(`Faltan campos obligatorios: ${faltan.join('; ')}.`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setEnviando(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('datos', JSON.stringify(datos));
      for (const s of secciones) {
        for (const d of s.documentos || []) {
          if (esVisible(d, datos) && archivos[d.id]) fd.append(d.id, archivos[d.id]);
        }
      }
      const data = await api.post('/arrendamientos/solicitudes', fd);
      const solicitud = unwrap(data, 'solicitud');
      navigate(`/arrendamientos/solicitudes/${solicitud.id}`, { replace: true, state: { recienCreada: true } });
    } catch (err) {
      setError(err.message || 'No se pudo enviar la solicitud.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setEnviando(false);
    }
  }

  if (!secciones) return error ? <div className="alert alert-error">{error}</div> : <Spinner label="Cargando formulario…" />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Solicitud de contrato de Arrendamiento</h1>
          <p className="page-header-sub">Llena la información para iniciar el trámite con Jurídico. Los campos con * son obligatorios, pero si todavía no tienes el dato puedes escribir "Pendiente de confirmar", "No disponible" o "No aplica". Los documentos pueden quedar pendientes y adjuntarse después desde la solicitud.</p>
        </div>
        <Link to="/arrendamientos/solicitudes" className="btn btn-secondary">Cancelar</Link>
      </div>

      <form onSubmit={enviar}>
        {error && <div className="alert alert-error">{error}</div>}
        {secciones.map((s) => (
          <div className="card" key={s.id}>
            <div className="card-title">{s.titulo}</div>
            {s.campos.filter((c) => esVisible(c, datos)).map((c) => (
              <Campo key={c.id} c={c} valor={datos[c.id]} onChange={(v) => poner(c.id, v)} />
            ))}
            {(s.documentos || []).filter((d) => esVisible(d, datos)).length > 0 && (
              <div className="field-group">
                <div className="field-group-title">Documentos</div>
                {s.documentos.filter((d) => esVisible(d, datos)).map((d) => (
                  <div className="field" key={d.id}>
                    <label htmlFor={`d-${d.id}`}>{d.label}{d.requerido ? ' (se espera adjuntar)' : ''}</label>
                    <input id={`d-${d.id}`} type="file" onChange={(e) => elegirArchivo(d.id, e)} />
                    {archivos[d.id] && (
                      <small className="hint">
                        {archivos[d.id].name} ({(archivos[d.id].size / 1024 / 1024).toFixed(1)} MB){' '}
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { const i = document.getElementById(`d-${d.id}`); if (i) i.value = ''; elegirArchivo(d.id, { target: { files: [] } }); }}>Quitar</button>
                      </small>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar solicitud'}</button>
          <Link to="/arrendamientos/solicitudes" className="btn btn-secondary">Cancelar</Link>
        </div>
      </form>
    </div>
  );
}
