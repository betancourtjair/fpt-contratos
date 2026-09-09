const MONEDAS = ['MXN', 'USD'];
const PARTES_FPT = [
  'Fitness para todos, S. de R.L. de C.V.',
  'Jeg-México Bueno, S. de R.L. de C.V.',
];
const PERIODICIDADES_REGALIAS = [
  { value: 'mensual', label: 'Mensual' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'semestral', label: 'Semestral' },
  { value: 'anual', label: 'Anual' },
];

const CAMPOS_FRANQUICIA_NUMERICOS = new Set([
  'cuotaInicial', 'regaliasPorcentaje', 'fondoMercadeoPorcentaje', 'diasAvisoPagoRegalias',
  'radioExclusividadKm', 'diasAvisoApertura', 'numeroRenovacionesPermitidas', 'diasAvisoRenovacion',
  'diasAvisoAuditoria',
]);
const CAMPOS_FRANQUICIA_TEXTO = [
  'periodicidadPagoRegalias', 'fechaProximoPagoRegalias', 'territorio', 'direccionPunto',
  'fechaLimiteApertura', 'condicionesRenovacion', 'fechaProximaAuditoria', 'polizasSeguroRequeridas',
  'garanteNombre',
];
const CAMPOS_FRANQUICIA_BOOLEAN = ['garantiaPersonal'];
const CAMPOS_FRANQUICIA = [...CAMPOS_FRANQUICIA_NUMERICOS, ...CAMPOS_FRANQUICIA_TEXTO, ...CAMPOS_FRANQUICIA_BOOLEAN];

/** Extrae y normaliza del objeto de valores del form solo los campos de franquicia,
 * listos para PUT /api/contratos/:id/franquicia (strings vacíos -> null, numéricos -> Number). */
export function franquiciaPayload(valores) {
  const payload = {};
  for (const campo of CAMPOS_FRANQUICIA) {
    const valor = valores[campo];
    if (CAMPOS_FRANQUICIA_NUMERICOS.has(campo)) {
      payload[campo] = valor === '' || valor === null || valor === undefined ? null : Number(valor);
    } else {
      payload[campo] = valor === undefined ? null : valor;
    }
  }
  return payload;
}

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
    // Datos de franquicia (solo se usan/envían si el tipo de contrato es de franquicia).
    cuotaInicial: '',
    regaliasPorcentaje: '',
    fondoMercadeoPorcentaje: '',
    periodicidadPagoRegalias: 'mensual',
    fechaProximoPagoRegalias: '',
    diasAvisoPagoRegalias: '7',
    territorio: '',
    radioExclusividadKm: '',
    direccionPunto: '',
    fechaLimiteApertura: '',
    diasAvisoApertura: '30',
    numeroRenovacionesPermitidas: '',
    condicionesRenovacion: '',
    diasAvisoRenovacion: '60',
    fechaProximaAuditoria: '',
    diasAvisoAuditoria: '15',
    polizasSeguroRequeridas: '',
    garantiaPersonal: false,
    garanteNombre: '',
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

  for (const campo of ['regaliasPorcentaje', 'fondoMercadeoPorcentaje']) {
    if (valores[campo] !== '' && valores[campo] !== null && valores[campo] !== undefined) {
      const num = Number(valores[campo]);
      if (Number.isNaN(num) || num < 0 || num > 100) errores[campo] = 'Debe ser un porcentaje entre 0 y 100.';
    }
  }

  return errores;
}

export default function ContratoForm({ valores, onChange, errores = {}, tipos = [], disabled = false }) {
  function set(campo, valor) {
    onChange({ ...valores, [campo]: valor });
  }

  const tipoSeleccionado = tipos.find((t) => t.id === valores.tipoContratoId);
  const esFranquicia = !!tipoSeleccionado?.esFranquicia;

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
          <select
            id="parte"
            value={valores.parte}
            disabled={disabled}
            onChange={(e) => set('parte', e.target.value)}
          >
            <option value="">Selecciona una razón social…</option>
            {PARTES_FPT.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
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

      {esFranquicia && (
        <>
          <hr className="divider" />
          <h3>Datos de franquicia</h3>
          <p className="page-header-sub" style={{ marginTop: -8, marginBottom: 14 }}>
            Campos propios del contrato de franquicia: activan sus avisos automáticos por correo.
          </p>

          <h4 className="form-subheading">Términos financieros</h4>
          <div className="form-row-3">
            <div className="field">
              <label htmlFor="cuotaInicial">Cuota inicial de franquicia</label>
              <input
                id="cuotaInicial"
                type="number"
                min="0"
                step="0.01"
                value={valores.cuotaInicial}
                disabled={disabled}
                onChange={(e) => set('cuotaInicial', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="regaliasPorcentaje">Regalías (%)</label>
              <input
                id="regaliasPorcentaje"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={valores.regaliasPorcentaje}
                disabled={disabled}
                onChange={(e) => set('regaliasPorcentaje', e.target.value)}
              />
              {errores.regaliasPorcentaje && <div className="error-text">{errores.regaliasPorcentaje}</div>}
            </div>
            <div className="field">
              <label htmlFor="fondoMercadeoPorcentaje">Fondo de mercadeo (%)</label>
              <input
                id="fondoMercadeoPorcentaje"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={valores.fondoMercadeoPorcentaje}
                disabled={disabled}
                onChange={(e) => set('fondoMercadeoPorcentaje', e.target.value)}
              />
              {errores.fondoMercadeoPorcentaje && <div className="error-text">{errores.fondoMercadeoPorcentaje}</div>}
            </div>
          </div>

          <div className="form-row-3">
            <div className="field">
              <label htmlFor="periodicidadPagoRegalias">Periodicidad de pago</label>
              <select
                id="periodicidadPagoRegalias"
                value={valores.periodicidadPagoRegalias}
                disabled={disabled}
                onChange={(e) => set('periodicidadPagoRegalias', e.target.value)}
              >
                {PERIODICIDADES_REGALIAS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="fechaProximoPagoRegalias">Próximo pago de regalías</label>
              <input
                id="fechaProximoPagoRegalias"
                type="date"
                value={valores.fechaProximoPagoRegalias}
                disabled={disabled}
                onChange={(e) => set('fechaProximoPagoRegalias', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="diasAvisoPagoRegalias">Días de aviso</label>
              <input
                id="diasAvisoPagoRegalias"
                type="number"
                min="0"
                value={valores.diasAvisoPagoRegalias}
                disabled={disabled}
                onChange={(e) => set('diasAvisoPagoRegalias', e.target.value)}
              />
            </div>
          </div>

          <h4 className="form-subheading">Territorio y exclusividad</h4>
          <div className="form-row-3">
            <div className="field">
              <label htmlFor="territorio">Territorio asignado</label>
              <input
                id="territorio"
                type="text"
                value={valores.territorio}
                disabled={disabled}
                onChange={(e) => set('territorio', e.target.value)}
                placeholder="Ej. Zona metropolitana de Monterrey"
              />
            </div>
            <div className="field">
              <label htmlFor="radioExclusividadKm">Radio de exclusividad (km)</label>
              <input
                id="radioExclusividadKm"
                type="number"
                min="0"
                step="0.1"
                value={valores.radioExclusividadKm}
                disabled={disabled}
                onChange={(e) => set('radioExclusividadKm', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="direccionPunto">Dirección del punto</label>
              <input
                id="direccionPunto"
                type="text"
                value={valores.direccionPunto}
                disabled={disabled}
                onChange={(e) => set('direccionPunto', e.target.value)}
              />
            </div>
          </div>

          <h4 className="form-subheading">Plazos y renovación</h4>
          <div className="form-row-3">
            <div className="field">
              <label htmlFor="fechaLimiteApertura">Fecha límite de apertura</label>
              <input
                id="fechaLimiteApertura"
                type="date"
                value={valores.fechaLimiteApertura}
                disabled={disabled}
                onChange={(e) => set('fechaLimiteApertura', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="diasAvisoApertura">Días de aviso (apertura)</label>
              <input
                id="diasAvisoApertura"
                type="number"
                min="0"
                value={valores.diasAvisoApertura}
                disabled={disabled}
                onChange={(e) => set('diasAvisoApertura', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="numeroRenovacionesPermitidas">Renovaciones permitidas</label>
              <input
                id="numeroRenovacionesPermitidas"
                type="number"
                min="0"
                value={valores.numeroRenovacionesPermitidas}
                disabled={disabled}
                onChange={(e) => set('numeroRenovacionesPermitidas', e.target.value)}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="field">
              <label htmlFor="condicionesRenovacion">Condiciones de renovación</label>
              <textarea
                id="condicionesRenovacion"
                value={valores.condicionesRenovacion}
                disabled={disabled}
                onChange={(e) => set('condicionesRenovacion', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="diasAvisoRenovacion">Días de aviso antes de renovar</label>
              <input
                id="diasAvisoRenovacion"
                type="number"
                min="0"
                value={valores.diasAvisoRenovacion}
                disabled={disabled}
                onChange={(e) => set('diasAvisoRenovacion', e.target.value)}
              />
            </div>
          </div>

          <h4 className="form-subheading">Cumplimiento y garantías</h4>
          <div className="form-row-3">
            <div className="field">
              <label htmlFor="fechaProximaAuditoria">Próxima auditoría/inspección</label>
              <input
                id="fechaProximaAuditoria"
                type="date"
                value={valores.fechaProximaAuditoria}
                disabled={disabled}
                onChange={(e) => set('fechaProximaAuditoria', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="diasAvisoAuditoria">Días de aviso (auditoría)</label>
              <input
                id="diasAvisoAuditoria"
                type="number"
                min="0"
                value={valores.diasAvisoAuditoria}
                disabled={disabled}
                onChange={(e) => set('diasAvisoAuditoria', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="polizasSeguroRequeridas">Pólizas de seguro requeridas</label>
              <input
                id="polizasSeguroRequeridas"
                type="text"
                value={valores.polizasSeguroRequeridas}
                disabled={disabled}
                onChange={(e) => set('polizasSeguroRequeridas', e.target.value)}
                placeholder="Ej. Responsabilidad civil, daños a terceros"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="field checkbox-row">
              <input
                id="garantiaPersonal"
                type="checkbox"
                checked={!!valores.garantiaPersonal}
                disabled={disabled}
                onChange={(e) => set('garantiaPersonal', e.target.checked)}
              />
              <label htmlFor="garantiaPersonal" style={{ marginBottom: 0 }}>Requiere garantía personal del franquiciatario</label>
            </div>
            {valores.garantiaPersonal && (
              <div className="field">
                <label htmlFor="garanteNombre">Nombre del garante</label>
                <input
                  id="garanteNombre"
                  type="text"
                  value={valores.garanteNombre}
                  disabled={disabled}
                  onChange={(e) => set('garanteNombre', e.target.value)}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
