const MONEDAS = ['MXN', 'USD'];

export function contratoFormVacio() {
  return {
    titulo: '',
    descripcion: '',
    tipoContratoId: '',
    parte: '',
    contraparteNombre: '',
    contraparteRFC: '',
    contraparteContacto: '',
    contraparteEmail: '',
    monto: '',
    moneda: 'MXN',
    fechaInicio: '',
    fechaFin: '',
    renovacionAutomatica: false,
    diasAvisoVencimiento: '30',
  };
}

export function validarContrato(valores) {
  const errores = {};
  if (!valores.titulo?.trim()) errores.titulo = 'El título es obligatorio.';
  if (!valores.tipoContratoId) errores.tipoContratoId = 'Selecciona un tipo de contrato.';
  if (!valores.parte?.trim()) errores.parte = 'Indica qué parte de FPT contrata.';
  if (!valores.contraparteNombre?.trim()) errores.contraparteNombre = 'El nombre de la contraparte es obligatorio.';

  if (valores.contraparteEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valores.contraparteEmail)) {
    errores.contraparteEmail = 'Correo electrónico inválido.';
  }

  if (valores.monto !== '' && valores.monto !== null && valores.monto !== undefined) {
    const num = Number(valores.monto);
    if (Number.isNaN(num) || num < 0) errores.monto = 'El monto debe ser un número válido.';
  }

  if (!valores.fechaInicio) errores.fechaInicio = 'La fecha de inicio es obligatoria.';
  if (!valores.fechaFin) errores.fechaFin = 'La fecha de fin es obligatoria.';
  if (valores.fechaInicio && valores.fechaFin) {
    const inicio = new Date(valores.fechaInicio);
    const fin = new Date(valores.fechaFin);
    if (fin <= inicio) {
      errores.fechaFin = 'La fecha de fin debe ser posterior a la fecha de inicio.';
    }
  }

  if (valores.diasAvisoVencimiento !== '' && valores.diasAvisoVencimiento !== null) {
    const num = Number(valores.diasAvisoVencimiento);
    if (Number.isNaN(num) || num < 0) errores.diasAvisoVencimiento = 'Debe ser un número de días válido.';
  }

  return errores;
}

export default function ContratoForm({ valores, onChange, errores = {}, tipos = [], disabled = false }) {
  function set(campo, valor) {
    onChange({ ...valores, [campo]: valor });
  }

  return (
    <div>
      <div className="field has-error-wrap">
        <label htmlFor="titulo">Título del contrato *</label>
        <input
          id="titulo"
          type="text"
          value={valores.titulo}
          disabled={disabled}
          onChange={(e) => set('titulo', e.target.value)}
          placeholder="Ej. Arrendamiento sucursal Polanco"
        />
        {errores.titulo && <div className="error-text">{errores.titulo}</div>}
      </div>

      <div className="field">
        <label htmlFor="descripcion">Descripción</label>
        <textarea
          id="descripcion"
          value={valores.descripcion}
          disabled={disabled}
          onChange={(e) => set('descripcion', e.target.value)}
          placeholder="Objeto del contrato, alcance, notas relevantes…"
        />
      </div>

      <div className="form-row">
        <div className="field">
          <label htmlFor="tipoContratoId">Tipo de contrato *</label>
          <select
            id="tipoContratoId"
            value={valores.tipoContratoId}
            disabled={disabled}
            onChange={(e) => set('tipoContratoId', e.target.value)}
          >
            <option value="">Selecciona un tipo…</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
          {errores.tipoContratoId && <div className="error-text">{errores.tipoContratoId}</div>}
        </div>

        <div className="field">
          <label htmlFor="parte">Parte que contrata (FPT) *</label>
          <input
            id="parte"
            type="text"
            value={valores.parte}
            disabled={disabled}
            onChange={(e) => set('parte', e.target.value)}
            placeholder="Ej. Fitness Para Todos S.A. de C.V."
          />
          {errores.parte && <div className="error-text">{errores.parte}</div>}
        </div>
      </div>

      <hr className="divider" />
      <h3>Contraparte</h3>

      <div className="form-row">
        <div className="field">
          <label htmlFor="contraparteNombre">Nombre / Razón social *</label>
          <input
            id="contraparteNombre"
            type="text"
            value={valores.contraparteNombre}
            disabled={disabled}
            onChange={(e) => set('contraparteNombre', e.target.value)}
          />
          {errores.contraparteNombre && <div className="error-text">{errores.contraparteNombre}</div>}
        </div>
        <div className="field">
          <label htmlFor="contraparteRFC">RFC</label>
          <input
            id="contraparteRFC"
            type="text"
            value={valores.contraparteRFC}
            disabled={disabled}
            onChange={(e) => set('contraparteRFC', e.target.value.toUpperCase())}
          />
        </div>
      </div>

      <div className="form-row">
        <div className="field">
          <label htmlFor="contraparteContacto">Persona de contacto</label>
          <input
            id="contraparteContacto"
            type="text"
            value={valores.contraparteContacto}
            disabled={disabled}
            onChange={(e) => set('contraparteContacto', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="contraparteEmail">Correo de contacto</label>
          <input
            id="contraparteEmail"
            type="email"
            value={valores.contraparteEmail}
            disabled={disabled}
            onChange={(e) => set('contraparteEmail', e.target.value)}
          />
          {errores.contraparteEmail && <div className="error-text">{errores.contraparteEmail}</div>}
        </div>
      </div>

      <hr className="divider" />
      <h3>Condiciones económicas y vigencia</h3>

      <div className="form-row-3">
        <div className="field">
          <label htmlFor="monto">Monto</label>
          <input
            id="monto"
            type="number"
            min="0"
            step="0.01"
            value={valores.monto}
            disabled={disabled}
            onChange={(e) => set('monto', e.target.value)}
          />
          {errores.monto && <div className="error-text">{errores.monto}</div>}
        </div>
        <div className="field">
          <label htmlFor="moneda">Moneda</label>
          <select id="moneda" value={valores.moneda} disabled={disabled} onChange={(e) => set('moneda', e.target.value)}>
            {MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="diasAvisoVencimiento">Días de aviso de vencimiento</label>
          <input
            id="diasAvisoVencimiento"
            type="number"
            min="0"
            value={valores.diasAvisoVencimiento}
            disabled={disabled}
            onChange={(e) => set('diasAvisoVencimiento', e.target.value)}
          />
          {errores.diasAvisoVencimiento && <div className="error-text">{errores.diasAvisoVencimiento}</div>}
        </div>
      </div>

      <div className="form-row">
        <div className="field">
          <label htmlFor="fechaInicio">Fecha de inicio *</label>
          <input
            id="fechaInicio"
            type="date"
            value={valores.fechaInicio}
            disabled={disabled}
            onChange={(e) => set('fechaInicio', e.target.value)}
          />
          {errores.fechaInicio && <div className="error-text">{errores.fechaInicio}</div>}
        </div>
        <div className="field">
          <label htmlFor="fechaFin">Fecha de fin *</label>
          <input
            id="fechaFin"
            type="date"
            value={valores.fechaFin}
            disabled={disabled}
            onChange={(e) => set('fechaFin', e.target.value)}
          />
          {errores.fechaFin && <div className="error-text">{errores.fechaFin}</div>}
        </div>
      </div>

      <div className="field checkbox-row">
        <input
          id="renovacionAutomatica"
          type="checkbox"
          checked={!!valores.renovacionAutomatica}
          disabled={disabled}
          onChange={(e) => set('renovacionAutomatica', e.target.checked)}
        />
        <label htmlFor="renovacionAutomatica" style={{ marginBottom: 0 }}>Renovación automática</label>
      </div>
    </div>
  );
}
