import { useEffect, useMemo, useState } from 'react';
import { api, unwrap } from '../../api.js';
import Spinner from '../../components/Spinner.jsx';

const ROLES_APROBADOR = [
  { value: 'super_admin', label: 'Super admin' },
  { value: 'admin', label: 'Administrador' },
  { value: 'juridico', label: 'Jurídico' },
  { value: 'aprobador', label: 'Aprobador' },
];

const PASO_VACIO = {
  nombre: '',
  tipoAprobador: 'rol',
  rolAprobador: 'aprobador',
  aprobadorId: '',
  montoMinimo: '',
  montoMaximo: '',
  obligatorio: true,
};

function pasoAFormulario(paso) {
  return {
    nombre: paso.nombre || '',
    tipoAprobador: paso.aprobadorId ? 'usuario' : 'rol',
    rolAprobador: paso.rolAprobador || 'aprobador',
    aprobadorId: paso.aprobadorId || '',
    montoMinimo: paso.montoMinimo ?? '',
    montoMaximo: paso.montoMaximo ?? '',
    obligatorio: paso.obligatorio !== false,
  };
}

function PasoForm({ valores, onChange, usuarios, onCancel, onGuardar, guardando, error }) {
  return (
    <div className="step-card" style={{ background: '#fff', borderStyle: 'dashed' }}>
      <div className="form-row">
        <div className="field">
          <label>Nombre del paso *</label>
          <input
            type="text"
            value={valores.nombre}
            onChange={(e) => onChange({ ...valores, nombre: e.target.value })}
            placeholder="Ej. Revisión jurídica"
          />
        </div>
        <div className="field">
          <label>Tipo de aprobador</label>
          <select
            value={valores.tipoAprobador}
            onChange={(e) => onChange({ ...valores, tipoAprobador: e.target.value })}
          >
            <option value="rol">Por rol</option>
            <option value="usuario">Usuario específico</option>
          </select>
        </div>
      </div>

      {valores.tipoAprobador === 'rol' ? (
        <div className="field">
          <label>Rol aprobador</label>
          <select
            value={valores.rolAprobador}
            onChange={(e) => onChange({ ...valores, rolAprobador: e.target.value })}
          >
            {ROLES_APROBADOR.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
      ) : (
        <div className="field">
          <label>Usuario aprobador</label>
          <select
            value={valores.aprobadorId}
            onChange={(e) => onChange({ ...valores, aprobadorId: e.target.value })}
          >
            <option value="">Selecciona un usuario…</option>
            {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre} ({u.email})</option>)}
          </select>
        </div>
      )}

      <div className="form-row">
        <div className="field">
          <label>Monto mínimo (opcional)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={valores.montoMinimo}
            onChange={(e) => onChange({ ...valores, montoMinimo: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Monto máximo (opcional)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={valores.montoMaximo}
            onChange={(e) => onChange({ ...valores, montoMaximo: e.target.value })}
          />
        </div>
      </div>
      <p className="hint" style={{ marginTop: -8, marginBottom: 14 }}>
        Si se definen, este paso solo aplicará cuando el monto del contrato esté dentro de este rango.
      </p>

      <div className="field checkbox-row">
        <input
          type="checkbox"
          id="obligatorio"
          checked={valores.obligatorio}
          onChange={(e) => onChange({ ...valores, obligatorio: e.target.checked })}
        />
        <label htmlFor="obligatorio" style={{ marginBottom: 0 }}>Paso obligatorio</label>
      </div>

      {error && <div className="error-text" style={{ marginBottom: 10 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={onGuardar} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar paso'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onCancel} disabled={guardando}>Cancelar</button>
      </div>
    </div>
  );
}

function describePaso(paso, usuarios) {
  if (paso.aprobadorId) {
    const u = usuarios.find((u) => String(u.id) === String(paso.aprobadorId));
    return u ? `Usuario: ${u.nombre}` : 'Usuario específico';
  }
  if (paso.rolAprobador) {
    const r = ROLES_APROBADOR.find((r) => r.value === paso.rolAprobador);
    return `Rol: ${r?.label || paso.rolAprobador}`;
  }
  return 'Sin aprobador asignado';
}

export default function FlujosAutorizacion() {
  const [plantillas, setPlantillas] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [seleccionId, setSeleccionId] = useState(null);

  const [nuevaAbierta, setNuevaAbierta] = useState(false);
  const [nuevaNombre, setNuevaNombre] = useState('');
  const [nuevoTipoId, setNuevoTipoId] = useState('');
  const [creandoPlantilla, setCreandoPlantilla] = useState(false);
  const [errorNueva, setErrorNueva] = useState('');

  const [editandoPlantilla, setEditandoPlantilla] = useState(false);
  const [valoresPlantilla, setValoresPlantilla] = useState({ nombre: '', tipoContratoId: '' });
  const [guardandoPlantilla, setGuardandoPlantilla] = useState(false);
  const [errorPlantilla, setErrorPlantilla] = useState('');

  const [pasoEditandoId, setPasoEditandoId] = useState(null);
  const [valoresPaso, setValoresPaso] = useState(PASO_VACIO);
  const [agregandoPaso, setAgregandoPaso] = useState(false);
  const [guardandoPaso, setGuardandoPaso] = useState(false);
  const [errorPaso, setErrorPaso] = useState('');

  async function cargarTodo() {
    setCargando(true);
    setError('');
    try {
      const [pl, tp, us] = await Promise.all([
        api.get('/flujo-plantillas'),
        api.get('/tipos-contrato', { activo: 'false' }),
        api.get('/usuarios').catch(() => null),
      ]);
      setPlantillas(unwrap(pl, 'flujoPlantillas') || []);
      setTipos(unwrap(tp, 'tiposContrato') || []);
      setUsuarios(unwrap(us, 'usuarios') || []);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los flujos de autorización.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargarTodo(); }, []);

  const plantillaSeleccionada = useMemo(
    () => plantillas.find((p) => String(p.id) === String(seleccionId)) || null,
    [plantillas, seleccionId]
  );

  const pasosOrdenados = useMemo(() => {
    if (!plantillaSeleccionada) return [];
    return [...(plantillaSeleccionada.pasos || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  }, [plantillaSeleccionada]);

  function tipoNombre(tipoContratoId) {
    return tipos.find((t) => String(t.id) === String(tipoContratoId))?.nombre || 'Sin tipo asignado';
  }

  async function crearPlantilla(e) {
    e.preventDefault();
    if (!nuevaNombre.trim()) {
      setErrorNueva('El nombre de la plantilla es obligatorio.');
      return;
    }
    setCreandoPlantilla(true);
    setErrorNueva('');
    try {
      const creada = await api.post('/flujo-plantillas', { nombre: nuevaNombre, tipoContratoId: nuevoTipoId || null });
      setNuevaAbierta(false);
      setNuevaNombre('');
      setNuevoTipoId('');
      await cargarTodo();
      const nuevoId = unwrap(creada, 'flujoPlantilla')?.id;
      if (nuevoId) setSeleccionId(nuevoId);
    } catch (err) {
      setErrorNueva(err.message || 'No se pudo crear la plantilla.');
    } finally {
      setCreandoPlantilla(false);
    }
  }

  function iniciarEditarPlantilla() {
    setValoresPlantilla({
      nombre: plantillaSeleccionada.nombre || '',
      tipoContratoId: plantillaSeleccionada.tipoContratoId || '',
    });
    setErrorPlantilla('');
    setEditandoPlantilla(true);
  }

  async function guardarPlantilla(e) {
    e.preventDefault();
    if (!valoresPlantilla.nombre.trim()) {
      setErrorPlantilla('El nombre de la plantilla es obligatorio.');
      return;
    }
    setGuardandoPlantilla(true);
    setErrorPlantilla('');
    try {
      await api.patch(`/flujo-plantillas/${plantillaSeleccionada.id}`, {
        nombre: valoresPlantilla.nombre,
        tipoContratoId: valoresPlantilla.tipoContratoId || null,
      });
      setEditandoPlantilla(false);
      await cargarTodo();
    } catch (err) {
      setErrorPlantilla(err.message || 'No se pudo guardar la plantilla.');
    } finally {
      setGuardandoPlantilla(false);
    }
  }

  function iniciarNuevoPaso() {
    setValoresPaso(PASO_VACIO);
    setErrorPaso('');
    setPasoEditandoId(null);
    setAgregandoPaso(true);
  }

  function iniciarEditarPaso(paso) {
    setValoresPaso(pasoAFormulario(paso));
    setErrorPaso('');
    setAgregandoPaso(false);
    setPasoEditandoId(paso.id);
  }

  function cancelarPaso() {
    setAgregandoPaso(false);
    setPasoEditandoId(null);
  }

  function construirPayloadPaso(valores, orden) {
    if (!valores.nombre.trim()) {
      throw new Error('El nombre del paso es obligatorio.');
    }
    if (valores.tipoAprobador === 'usuario' && !valores.aprobadorId) {
      throw new Error('Selecciona un usuario aprobador.');
    }
    if (valores.montoMinimo !== '' && valores.montoMaximo !== '' && Number(valores.montoMinimo) > Number(valores.montoMaximo)) {
      throw new Error('El monto mínimo no puede ser mayor al monto máximo.');
    }
    return {
      nombre: valores.nombre,
      orden,
      rolAprobador: valores.tipoAprobador === 'rol' ? valores.rolAprobador : null,
      aprobadorId: valores.tipoAprobador === 'usuario' ? valores.aprobadorId : null,
      montoMinimo: valores.montoMinimo === '' ? null : Number(valores.montoMinimo),
      montoMaximo: valores.montoMaximo === '' ? null : Number(valores.montoMaximo),
      obligatorio: valores.obligatorio,
    };
  }

  async function guardarNuevoPaso() {
    setGuardandoPaso(true);
    setErrorPaso('');
    try {
      const orden = pasosOrdenados.length > 0 ? Math.max(...pasosOrdenados.map((p) => p.orden ?? 0)) + 1 : 1;
      const payload = construirPayloadPaso(valoresPaso, orden);
      await api.post(`/flujo-plantillas/${plantillaSeleccionada.id}/pasos`, payload);
      setAgregandoPaso(false);
      await cargarTodo();
    } catch (err) {
      setErrorPaso(err.message || 'No se pudo agregar el paso.');
    } finally {
      setGuardandoPaso(false);
    }
  }

  async function guardarEdicionPaso(paso) {
    setGuardandoPaso(true);
    setErrorPaso('');
    try {
      const payload = construirPayloadPaso(valoresPaso, paso.orden);
      await api.patch(`/flujo-plantillas/${plantillaSeleccionada.id}/pasos/${paso.id}`, payload);
      setPasoEditandoId(null);
      await cargarTodo();
    } catch (err) {
      setErrorPaso(err.message || 'No se pudo guardar el paso.');
    } finally {
      setGuardandoPaso(false);
    }
  }

  async function eliminarPaso(paso) {
    if (!window.confirm(`¿Eliminar el paso "${paso.nombre}"?`)) return;
    setError('');
    try {
      await api.del(`/flujo-plantillas/${plantillaSeleccionada.id}/pasos/${paso.id}`);
      await cargarTodo();
    } catch (err) {
      setError(err.message || 'No se pudo eliminar el paso.');
    }
  }

  async function moverPaso(paso, direccion) {
    const idx = pasosOrdenados.findIndex((p) => p.id === paso.id);
    const otroIdx = idx + direccion;
    if (otroIdx < 0 || otroIdx >= pasosOrdenados.length) return;
    const otro = pasosOrdenados[otroIdx];
    setError('');
    try {
      await Promise.all([
        api.patch(`/flujo-plantillas/${plantillaSeleccionada.id}/pasos/${paso.id}`, { orden: otro.orden }),
        api.patch(`/flujo-plantillas/${plantillaSeleccionada.id}/pasos/${otro.id}`, { orden: paso.orden }),
      ]);
      await cargarTodo();
    } catch (err) {
      setError(err.message || 'No se pudo reordenar el paso.');
    }
  }

  if (cargando) return <Spinner label="Cargando flujos de autorización…" />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Flujos de autorización</h1>
          <p className="page-header-sub">Configura el flujo de aprobación multi-nivel para cada tipo de contrato.</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setNuevaAbierta(true); setErrorNueva(''); }}>
          + Nueva plantilla
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {nuevaAbierta && (
        <div className="card" style={{ maxWidth: 520 }}>
          <div className="card-title">Nueva plantilla de flujo</div>
          {errorNueva && <div className="alert alert-error">{errorNueva}</div>}
          <form onSubmit={crearPlantilla}>
            <div className="field">
              <label>Nombre de la plantilla *</label>
              <input type="text" value={nuevaNombre} onChange={(e) => setNuevaNombre(e.target.value)} placeholder="Ej. Flujo arrendamientos" />
            </div>
            <div className="field">
              <label>Tipo de contrato asociado</label>
              <select value={nuevoTipoId} onChange={(e) => setNuevoTipoId(e.target.value)}>
                <option value="">Sin asociar / general</option>
                {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={creandoPlantilla}>
                {creandoPlantilla ? 'Creando…' : 'Crear plantilla'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setNuevaAbierta(false)} disabled={creandoPlantilla}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Plantillas</div>
          {plantillas.length === 0 ? (
            <div className="empty-state">Aún no hay plantillas de flujo configuradas.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {plantillas.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSeleccionId(p.id)}
                  className="btn-block"
                  style={{
                    textAlign: 'left',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    background: String(p.id) === String(seleccionId) ? 'var(--fpt-purple-50)' : '#fff',
                    borderColor: String(p.id) === String(seleccionId) ? 'var(--fpt-purple-400)' : 'var(--color-border)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{p.nombre}</div>
                  <div className="muted" style={{ fontSize: 12.5 }}>
                    {tipoNombre(p.tipoContratoId)} · {(p.pasos || []).length} paso(s)
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          {!plantillaSeleccionada ? (
            <div className="empty-state">Selecciona una plantilla para ver y editar sus pasos.</div>
          ) : (
            <>
              {editandoPlantilla ? (
                <form onSubmit={guardarPlantilla} style={{ marginBottom: 18 }}>
                  {errorPlantilla && <div className="alert alert-error">{errorPlantilla}</div>}
                  <div className="form-row">
                    <div className="field">
                      <label>Nombre de la plantilla</label>
                      <input
                        type="text"
                        value={valoresPlantilla.nombre}
                        onChange={(e) => setValoresPlantilla({ ...valoresPlantilla, nombre: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>Tipo de contrato asociado</label>
                      <select
                        value={valoresPlantilla.tipoContratoId}
                        onChange={(e) => setValoresPlantilla({ ...valoresPlantilla, tipoContratoId: e.target.value })}
                      >
                        <option value="">Sin asociar / general</option>
                        {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={guardandoPlantilla}>
                      {guardandoPlantilla ? 'Guardando…' : 'Guardar'}
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditandoPlantilla(false)} disabled={guardandoPlantilla}>
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : (
                <div className="card-title">
                  <span>
                    {plantillaSeleccionada.nombre}{' '}
                    <span className="tag-pill">{tipoNombre(plantillaSeleccionada.tipoContratoId)}</span>
                  </span>
                  <button className="icon-btn" onClick={iniciarEditarPlantilla}>Editar plantilla</button>
                </div>
              )}

              {pasosOrdenados.length === 0 && !agregandoPaso && (
                <div className="empty-state">Esta plantilla aún no tiene pasos definidos.</div>
              )}

              {pasosOrdenados.map((paso, idx) => (
                <div key={paso.id}>
                  {pasoEditandoId === paso.id ? (
                    <PasoForm
                      valores={valoresPaso}
                      onChange={setValoresPaso}
                      usuarios={usuarios}
                      onCancel={cancelarPaso}
                      onGuardar={() => guardarEdicionPaso(paso)}
                      guardando={guardandoPaso}
                      error={errorPaso}
                    />
                  ) : (
                    <div className="step-card">
                      <div className="step-card-head">
                        <div>
                          <span className="step-order-badge">{idx + 1}</span>
                          <strong>{paso.nombre}</strong>
                          {paso.obligatorio === false && <span className="tag-pill" style={{ marginLeft: 8 }}>Opcional</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="icon-btn" onClick={() => moverPaso(paso, -1)} disabled={idx === 0} title="Subir">↑</button>
                          <button className="icon-btn" onClick={() => moverPaso(paso, 1)} disabled={idx === pasosOrdenados.length - 1} title="Bajar">↓</button>
                          <button className="icon-btn" onClick={() => iniciarEditarPaso(paso)}>Editar</button>
                          <button className="icon-btn" onClick={() => eliminarPaso(paso)}>Eliminar</button>
                        </div>
                      </div>
                      <div className="muted" style={{ fontSize: 13 }}>
                        {describePaso(paso, usuarios)}
                        {(paso.montoMinimo || paso.montoMaximo) && (
                          <> · Aplica de {paso.montoMinimo ?? '0'} a {paso.montoMaximo ?? '∞'}</>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {agregandoPaso ? (
                <PasoForm
                  valores={valoresPaso}
                  onChange={setValoresPaso}
                  usuarios={usuarios}
                  onCancel={cancelarPaso}
                  onGuardar={guardarNuevoPaso}
                  guardando={guardandoPaso}
                  error={errorPaso}
                />
              ) : (
                <button className="btn btn-secondary btn-sm" onClick={iniciarNuevoPaso}>+ Agregar paso</button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
