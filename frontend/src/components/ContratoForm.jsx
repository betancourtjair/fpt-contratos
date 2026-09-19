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
  'clubId', 'periodicidadPagoRegalias', 'fechaProximoPagoRegalias', 'territorio', 'direccionPunto',
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

// ---------------------------------------------------------------------------
// Solicitud dinámica: NDA y prestación de servicios piden, además de lo de siempre, una
// versión más completa de la contraparte (persona física/moral) y sus propios campos. Mismo
// patrón que franquicia: constantes de campos + función de payload para el PUT de detalle
// correspondiente (ver PUT /api/contratos/:id/contraparte-detalle, /nda, /servicios).
// ---------------------------------------------------------------------------

const TIPOS_PERSONA = [
  { value: 'fisica', label: 'Persona física' },
  { value: 'moral', label: 'Persona moral' },
];

const LUGARES_PRESTACION = [
  { value: 'instalaciones_proveedor', label: 'En instalaciones del proveedor' },
  { value: 'remoto', label: 'De manera remota' },
  { value: 'ubicacion_terceros', label: 'En ubicaciones de terceros' },
  { value: 'instalaciones_fpt', label: 'En las instalaciones de FPT (servicios especializados)' },
];

const CAMPOS_CONTRAPARTE_DETALLE = [
  'tipoPersona', 'representanteLegalNombre', 'nacionalidad', 'curp', 'domicilio',
  'administradorInternoNombre',
];

export function contraparteDetallePayload(valores) {
  const payload = {};
  for (const campo of CAMPOS_CONTRAPARTE_DETALLE) {
    payload[campo] = valores[campo] === undefined || valores[campo] === '' ? null : valores[campo];
  }
  return payload;
}

const CAMPOS_NDA = ['ndaDescripcionProyecto', 'ndaTipoInformacion', 'ndaFechaFirma', 'ndaComentarios'];
const MAPA_CAMPOS_NDA_PAYLOAD = {
  ndaDescripcionProyecto: 'descripcionProyecto',
  ndaTipoInformacion: 'tipoInformacion',
  ndaFechaFirma: 'fechaFirma',
  ndaComentarios: 'comentarios',
};

export function ndaPayload(valores) {
  const payload = {};
  for (const campo of CAMPOS_NDA) {
    payload[MAPA_CAMPOS_NDA_PAYLOAD[campo]] = valores[campo] === undefined || valores[campo] === '' ? null : valores[campo];
  }
  return payload;
}

const CAMPOS_SERVICIOS_NUMERICOS = new Set(['serviciosNumeroTrabajadores']);
const CAMPOS_SERVICIOS_BOOLEAN = new Set(['serviciosIncluyeIva']);
const CAMPOS_SERVICIOS = [
  'serviciosDescripcion', 'serviciosActividadesPrestador', 'serviciosCronograma', 'serviciosLugarPrestacion',
  'serviciosLugarExacto', 'serviciosRepse', 'serviciosRegistroPatronal', 'serviciosNumeroTrabajadores',
  'serviciosIncluyeIva', 'serviciosCondicionesPago', 'serviciosGarantias', 'serviciosFechaFirma',
];
const MAPA_CAMPOS_SERVICIOS_PAYLOAD = {
  serviciosDescripcion: 'descripcionServicios',
  serviciosActividadesPrestador: 'actividadesPrestador',
  serviciosCronograma: 'cronograma',
  serviciosLugarPrestacion: 'lugarPrestacion',
  serviciosLugarExacto: 'lugarExacto',
  serviciosRepse: 'repse',
  serviciosRegistroPatronal: 'registroPatronal',
  serviciosNumeroTrabajadores: 'numeroTrabajadores',
  serviciosIncluyeIva: 'incluyeIva',
  serviciosCondicionesPago: 'condicionesPago',
  serviciosGarantias: 'garantias',
  serviciosFechaFirma: 'fechaFirma',
};

export function serviciosPayload(valores) {
  const payload = {};
  for (const campo of CAMPOS_SERVICIOS) {
    const destino = MAPA_CAMPOS_SERVICIOS_PAYLOAD[campo];
    const valor = valores[campo];
    if (CAMPOS_SERVICIOS_NUMERICOS.has(campo)) {
      payload[destino] = valor === '' || valor === null || valor === undefined ? null : Number(valor);
    } else if (CAMPOS_SERVICIOS_BOOLEAN.has(campo)) {
      payload[destino] = valor === '' || valor === undefined ? null : Boolean(valor);
    } else {
      payload[destino] = valor === undefined || valor === '' ? null : valor;
    }
  }
  return payload;
}

const ES_SERVICIOS_ESPECIALIZADOS = (valores) => valores.serviciosLugarPrestacion === 'instalaciones_fpt';

/** Documentos con nombre específico que pide jurídico para NDA y prestación de servicios,
 * además del selector genérico de "Documentos (opcional)" que ya existía. Cada entrada viaja
 * como `etiqueta` en el multipart al subir (POST /contratos/:id/documentos) — no es parte del
 * enum `categoria`, solo identifica de qué documento se trata. Se recalcula en cada render
 * según persona/tipo/lugar de prestación elegidos, así que el checklist aparece y desaparece
 * solo conforme se llena el formulario. */
export function documentosRequeridos(valores, tipoSeleccionado) {
  if (!tipoSeleccionado) return [];
  const lista = [];

  if (tipoSeleccionado.esNda || tipoSeleccionado.esServicios) {
    if (valores.tipoPersona === 'moral') {
      lista.push(
        { etiqueta: 'identificacion_representante_legal', label: 'Identificación oficial del representante legal', opcional: false },
        { etiqueta: 'escritura_constitutiva', label: 'Escritura constitutiva', opcional: false },
        { etiqueta: 'escritura_modificacion', label: 'Escritura de modificación relevante (cambio de denominación, transformación, etc.)', opcional: false },
        { etiqueta: 'escritura_facultades', label: 'Escritura mediante la cual se otorgaron facultades al representante legal', opcional: false },
        { etiqueta: 'rfc_constancia_fiscal', label: 'RFC (Constancia de situación fiscal) o identificación fiscal equivalente', opcional: false }
      );
    } else if (valores.tipoPersona === 'fisica') {
      lista.push(
        { etiqueta: 'rfc_constancia_fiscal', label: 'RFC (Constancia de situación fiscal) o identificación fiscal equivalente', opcional: false },
        { etiqueta: 'identificacion_oficial', label: 'Identificación oficial vigente', opcional: false }
      );
    }
  }

  if (tipoSeleccionado.esNda) {
    lista.push({ etiqueta: 'proyecto_nda', label: 'Proyecto de NDA enviado por la contraparte, cuando exista', opcional: true });
  }

  if (tipoSeleccionado.esServicios) {
    lista.push({ etiqueta: 'cotizacion_propuesta', label: 'Cotización, propuesta comercial o documento similar', opcional: false });
    if (ES_SERVICIOS_ESPECIALIZADOS(valores)) {
      lista.push(
        { etiqueta: 'repse_documento', label: 'REPSE', opcional: false },
        { etiqueta: 'registro_patronal_documento', label: 'Registro patronal', opcional: false }
      );
    }
  }

  return lista;
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
    clubId: '',
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
    // Contraparte ampliada (solo se piden/usan si el tipo es NDA o prestación de servicios).
    tipoPersona: '',
    representanteLegalNombre: '',
    nacionalidad: '',
    curp: '',
    domicilio: '',
    administradorInternoNombre: '',
    // Solicitud de NDA.
    ndaDescripcionProyecto: '',
    ndaTipoInformacion: '',
    ndaFechaFirma: '',
    ndaComentarios: '',
    // Solicitud de prestación de servicios / servicios especializados.
    serviciosDescripcion: '',
    serviciosActividadesPrestador: '',
    serviciosCronograma: '',
    serviciosLugarPrestacion: '',
    serviciosLugarExacto: '',
    serviciosRepse: '',
    serviciosRegistroPatronal: '',
    serviciosNumeroTrabajadores: '',
    serviciosIncluyeIva: '',
    serviciosCondicionesPago: '',
    serviciosGarantias: '',
    serviciosFechaFirma: '',
  };
}

export function validarContrato(valores, opciones = {}) {
  const errores = {};
  if (!valores.titulo?.trim()) errores.titulo = 'El título es obligatorio.';
  if (!valores.tipoContratoId) errores.tipoContratoId = 'Selecciona un tipo de contrato.';
  if (!valores.parte?.trim()) errores.parte = 'Indica qué parte de FPT contrata.';
  if (!valores.contraparteNombre?.trim()) errores.contraparteNombre = 'El nombre de la contraparte es obligatorio.';
  if (opciones.requiereClub && !valores.clubId) errores.clubId = 'Selecciona el club.';

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

  // Contraparte ampliada: aplica a NDA y prestación de servicios (ver opciones.esNda / esServicios,
  // que NuevaSolicitud.jsx arma a partir de tipoSeleccionado).
  if (opciones.esNda || opciones.esServicios) {
    if (!valores.tipoPersona) {
      errores.tipoPersona = 'Indica si la contraparte es persona física o persona moral.';
    } else if (valores.tipoPersona === 'moral' && !valores.representanteLegalNombre?.trim()) {
      errores.representanteLegalNombre = 'El nombre del representante legal es obligatorio.';
    } else if (valores.tipoPersona === 'fisica') {
      if (!valores.nacionalidad?.trim()) errores.nacionalidad = 'La nacionalidad es obligatoria.';
      if (!valores.curp?.trim()) errores.curp = 'El CURP es obligatorio.';
    }
    if (!valores.domicilio?.trim()) errores.domicilio = 'El domicilio de la contraparte es obligatorio.';
    if (!valores.administradorInternoNombre?.trim()) {
      errores.administradorInternoNombre = 'Indica quién administrará el contrato internamente.';
    }
  }

  // Solicitud de NDA.
  if (opciones.esNda) {
    if (!valores.ndaDescripcionProyecto?.trim()) {
      errores.ndaDescripcionProyecto = 'Describe el proyecto, negociación u operación que origina el intercambio de información.';
    }
    if (!valores.ndaTipoInformacion?.trim()) {
      errores.ndaTipoInformacion = 'Describe el tipo de información que se pretende compartir.';
    }
    if (!valores.ndaFechaFirma) errores.ndaFechaFirma = 'La fecha de firma es obligatoria.';
  }

  // Solicitud de prestación de servicios / servicios especializados.
  if (opciones.esServicios) {
    if (!valores.serviciosDescripcion?.trim()) {
      errores.serviciosDescripcion = 'Describe completamente los servicios a contratar.';
    }
    if (!valores.serviciosActividadesPrestador?.trim()) {
      errores.serviciosActividadesPrestador = 'Indica las actividades que realizará el prestador.';
    }
    if (!valores.serviciosCronograma?.trim()) {
      errores.serviciosCronograma = 'Indica el cronograma, hitos o fechas de entrega.';
    }
    if (!valores.serviciosLugarPrestacion) {
      errores.serviciosLugarPrestacion = 'Indica dónde se prestarán los servicios.';
    }
    if (ES_SERVICIOS_ESPECIALIZADOS(valores)) {
      if (!valores.serviciosLugarExacto?.trim()) {
        errores.serviciosLugarExacto = 'Indica el lugar exacto (domicilio) donde se prestarán los servicios.';
      }
      if (!valores.serviciosRepse?.trim()) errores.serviciosRepse = 'El REPSE es obligatorio para servicios especializados.';
      if (!valores.serviciosRegistroPatronal?.trim()) {
        errores.serviciosRegistroPatronal = 'El registro patronal es obligatorio para servicios especializados.';
      }
      if (valores.serviciosNumeroTrabajadores === '' || valores.serviciosNumeroTrabajadores === null || valores.serviciosNumeroTrabajadores === undefined) {
        errores.serviciosNumeroTrabajadores = 'Indica el número de trabajadores que se utilizarán para prestar el servicio.';
      } else {
        const num = Number(valores.serviciosNumeroTrabajadores);
        if (!Number.isInteger(num) || num < 0) errores.serviciosNumeroTrabajadores = 'Debe ser un número entero válido.';
      }
    }
    if (valores.serviciosIncluyeIva === '' || valores.serviciosIncluyeIva === null || valores.serviciosIncluyeIva === undefined) {
      errores.serviciosIncluyeIva = 'Indica si el precio incluye IVA o no.';
    }
    if (!valores.serviciosCondicionesPago?.trim()) {
      errores.serviciosCondicionesPago = 'Indica las condiciones de pago (forma, periodicidad, etc.).';
    }
    if (!valores.serviciosFechaFirma) errores.serviciosFechaFirma = 'La fecha de firma es obligatoria.';

    // Vigencia (fechaInicio/fechaFin, ya validadas arriba) no puede ser mayor a 2 años.
    if (valores.fechaInicio && valores.fechaFin && !errores.fechaFin) {
      const inicio = new Date(valores.fechaInicio);
      const limite = new Date(inicio);
      limite.setFullYear(limite.getFullYear() + 2);
      if (new Date(valores.fechaFin) > limite) {
        errores.fechaFin = 'La vigencia de un contrato de prestación de servicios no puede ser mayor a 2 años.';
      }
    }
  }

  return errores;
}

export default function ContratoForm({ valores, onChange, errores = {}, tipos = [], clubes = [], disabled = false }) {
  function set(campo, valor) {
    onChange({ ...valores, [campo]: valor });
  }

  const tipoSeleccionado = tipos.find((t) => t.id === valores.tipoContratoId);
  const esFranquicia = !!tipoSeleccionado?.esFranquicia;
  const esNda = !!tipoSeleccionado?.esNda;
  const esServicios = !!tipoSeleccionado?.esServicios;
  const esServiciosEspecializados = esServicios && valores.serviciosLugarPrestacion === 'instalaciones_fpt';

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

      {(esNda || esServicios) && (
        <>
          <h4 className="form-subheading">Detalle de la contraparte</h4>
          <div className="field has-error-wrap">
            <label htmlFor="tipoPersona">Tipo de persona *</label>
            <select
              id="tipoPersona"
              value={valores.tipoPersona}
              disabled={disabled}
              onChange={(e) => set('tipoPersona', e.target.value)}
            >
              <option value="">Selecciona…</option>
              {TIPOS_PERSONA.map((tp) => <option key={tp.value} value={tp.value}>{tp.label}</option>)}
            </select>
            {errores.tipoPersona && <div className="error-text">{errores.tipoPersona}</div>}
          </div>

          {valores.tipoPersona === 'moral' && (
            <div className="field has-error-wrap">
              <label htmlFor="representanteLegalNombre">Nombre completo del representante legal *</label>
              <input
                id="representanteLegalNombre"
                type="text"
                value={valores.representanteLegalNombre}
                disabled={disabled}
                onChange={(e) => set('representanteLegalNombre', e.target.value)}
              />
              {errores.representanteLegalNombre && <div className="error-text">{errores.representanteLegalNombre}</div>}
              <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                El RFC/constancia de situación fiscal de la contraparte se captura arriba, en el campo RFC.
              </p>
            </div>
          )}

          {valores.tipoPersona === 'fisica' && (
            <div className="form-row">
              <div className="field has-error-wrap">
                <label htmlFor="nacionalidad">Nacionalidad *</label>
                <input
                  id="nacionalidad"
                  type="text"
                  value={valores.nacionalidad}
                  disabled={disabled}
                  onChange={(e) => set('nacionalidad', e.target.value)}
                />
                {errores.nacionalidad && <div className="error-text">{errores.nacionalidad}</div>}
              </div>
              <div className="field has-error-wrap">
                <label htmlFor="curp">CURP *</label>
                <input
                  id="curp"
                  type="text"
                  value={valores.curp}
                  disabled={disabled}
                  onChange={(e) => set('curp', e.target.value.toUpperCase())}
                />
                {errores.curp && <div className="error-text">{errores.curp}</div>}
              </div>
            </div>
          )}

          {valores.tipoPersona && (
            <div className="form-row">
              <div className="field has-error-wrap">
                <label htmlFor="domicilio">Domicilio *</label>
                <input
                  id="domicilio"
                  type="text"
                  value={valores.domicilio}
                  disabled={disabled}
                  onChange={(e) => set('domicilio', e.target.value)}
                />
                {errores.domicilio && <div className="error-text">{errores.domicilio}</div>}
              </div>
            </div>
          )}

          <h4 className="form-subheading">Datos internos</h4>
          <div className="field has-error-wrap" style={{ maxWidth: 420 }}>
            <label htmlFor="administradorInternoNombre">Administrador interno del contrato *</label>
            <input
              id="administradorInternoNombre"
              type="text"
              value={valores.administradorInternoNombre}
              disabled={disabled}
              onChange={(e) => set('administradorInternoNombre', e.target.value)}
              placeholder="Quién dará seguimiento a este contrato dentro de FPT"
            />
            {errores.administradorInternoNombre && <div className="error-text">{errores.administradorInternoNombre}</div>}
          </div>
        </>
      )}

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

      {esNda && (
        <>
          <hr className="divider" />
          <h3>Solicitud de NDA</h3>

          <div className="field has-error-wrap">
            <label htmlFor="ndaDescripcionProyecto">
              Descripción del proyecto, negociación, operación o relación que dará origen al intercambio de información *
            </label>
            <textarea
              id="ndaDescripcionProyecto"
              value={valores.ndaDescripcionProyecto}
              disabled={disabled}
              onChange={(e) => set('ndaDescripcionProyecto', e.target.value)}
            />
            {errores.ndaDescripcionProyecto && <div className="error-text">{errores.ndaDescripcionProyecto}</div>}
          </div>

          <div className="field has-error-wrap">
            <label htmlFor="ndaTipoInformacion">Descripción del tipo de información que se pretende compartir *</label>
            <textarea
              id="ndaTipoInformacion"
              value={valores.ndaTipoInformacion}
              disabled={disabled}
              onChange={(e) => set('ndaTipoInformacion', e.target.value)}
            />
            {errores.ndaTipoInformacion && <div className="error-text">{errores.ndaTipoInformacion}</div>}
          </div>

          <div className="form-row">
            <div className="field has-error-wrap">
              <label htmlFor="ndaFechaFirma">Fecha de firma *</label>
              <input
                id="ndaFechaFirma"
                type="date"
                value={valores.ndaFechaFirma}
                disabled={disabled}
                onChange={(e) => set('ndaFechaFirma', e.target.value)}
              />
              {errores.ndaFechaFirma && <div className="error-text">{errores.ndaFechaFirma}</div>}
            </div>
          </div>

          <div className="field">
            <label htmlFor="ndaComentarios">Comentario adicional (opcional)</label>
            <textarea
              id="ndaComentarios"
              value={valores.ndaComentarios}
              disabled={disabled}
              onChange={(e) => set('ndaComentarios', e.target.value)}
            />
          </div>
        </>
      )}

      {esServicios && (
        <>
          <hr className="divider" />
          <h3>Solicitud de prestación de servicios{esServiciosEspecializados ? ' especializados' : ''}</h3>

          <div className="field has-error-wrap">
            <label htmlFor="serviciosDescripcion">Descripción completa de los servicios a contratar *</label>
            <textarea
              id="serviciosDescripcion"
              value={valores.serviciosDescripcion}
              disabled={disabled}
              onChange={(e) => set('serviciosDescripcion', e.target.value)}
            />
            {errores.serviciosDescripcion && <div className="error-text">{errores.serviciosDescripcion}</div>}
          </div>

          <div className="field has-error-wrap">
            <label htmlFor="serviciosActividadesPrestador">Actividades que realizará el prestador *</label>
            <textarea
              id="serviciosActividadesPrestador"
              value={valores.serviciosActividadesPrestador}
              disabled={disabled}
              onChange={(e) => set('serviciosActividadesPrestador', e.target.value)}
            />
            {errores.serviciosActividadesPrestador && <div className="error-text">{errores.serviciosActividadesPrestador}</div>}
          </div>

          <div className="field has-error-wrap">
            <label htmlFor="serviciosCronograma">Cronograma, hitos o fechas de entrega *</label>
            <textarea
              id="serviciosCronograma"
              value={valores.serviciosCronograma}
              disabled={disabled}
              onChange={(e) => set('serviciosCronograma', e.target.value)}
            />
            {errores.serviciosCronograma && <div className="error-text">{errores.serviciosCronograma}</div>}
          </div>

          <div className="field has-error-wrap">
            <label htmlFor="serviciosLugarPrestacion">¿Dónde se prestarán los servicios? *</label>
            <select
              id="serviciosLugarPrestacion"
              value={valores.serviciosLugarPrestacion}
              disabled={disabled}
              onChange={(e) => set('serviciosLugarPrestacion', e.target.value)}
            >
              <option value="">Selecciona…</option>
              {LUGARES_PRESTACION.map((lp) => <option key={lp.value} value={lp.value}>{lp.label}</option>)}
            </select>
            {errores.serviciosLugarPrestacion && <div className="error-text">{errores.serviciosLugarPrestacion}</div>}
          </div>

          {esServiciosEspecializados && (
            <>
              <p className="page-header-sub" style={{ marginTop: -8, marginBottom: 14 }}>
                Al prestarse en instalaciones de FPT, esta solicitud se vuelve de <b>servicios especializados</b> y
                pide campos adicionales (REPSE, registro patronal, etc.).
              </p>
              <div className="form-row">
                <div className="field has-error-wrap">
                  <label htmlFor="serviciosLugarExacto">Lugar exacto donde se prestarán los servicios (domicilio) *</label>
                  <input
                    id="serviciosLugarExacto"
                    type="text"
                    value={valores.serviciosLugarExacto}
                    disabled={disabled}
                    onChange={(e) => set('serviciosLugarExacto', e.target.value)}
                  />
                  {errores.serviciosLugarExacto && <div className="error-text">{errores.serviciosLugarExacto}</div>}
                </div>
                <div className="field has-error-wrap">
                  <label htmlFor="serviciosNumeroTrabajadores">Número de trabajadores que se utilizarán *</label>
                  <input
                    id="serviciosNumeroTrabajadores"
                    type="number"
                    min="0"
                    value={valores.serviciosNumeroTrabajadores}
                    disabled={disabled}
                    onChange={(e) => set('serviciosNumeroTrabajadores', e.target.value)}
                  />
                  {errores.serviciosNumeroTrabajadores && <div className="error-text">{errores.serviciosNumeroTrabajadores}</div>}
                </div>
              </div>
              <div className="form-row">
                <div className="field has-error-wrap">
                  <label htmlFor="serviciosRepse">REPSE *</label>
                  <input
                    id="serviciosRepse"
                    type="text"
                    value={valores.serviciosRepse}
                    disabled={disabled}
                    onChange={(e) => set('serviciosRepse', e.target.value)}
                  />
                  {errores.serviciosRepse && <div className="error-text">{errores.serviciosRepse}</div>}
                </div>
                <div className="field has-error-wrap">
                  <label htmlFor="serviciosRegistroPatronal">Registro patronal *</label>
                  <input
                    id="serviciosRegistroPatronal"
                    type="text"
                    value={valores.serviciosRegistroPatronal}
                    disabled={disabled}
                    onChange={(e) => set('serviciosRegistroPatronal', e.target.value)}
                  />
                  {errores.serviciosRegistroPatronal && <div className="error-text">{errores.serviciosRegistroPatronal}</div>}
                </div>
              </div>
            </>
          )}

          <div className="form-row">
            <div className="field has-error-wrap">
              <label htmlFor="serviciosFechaFirma">Fecha de firma *</label>
              <input
                id="serviciosFechaFirma"
                type="date"
                value={valores.serviciosFechaFirma}
                disabled={disabled}
                onChange={(e) => set('serviciosFechaFirma', e.target.value)}
              />
              {errores.serviciosFechaFirma && <div className="error-text">{errores.serviciosFechaFirma}</div>}
            </div>
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: -8 }}>
            La vigencia se toma de la fecha de inicio y fin de arriba, y no puede ser mayor a 2 años.
          </p>

          <h4 className="form-subheading">Contraprestación</h4>
          <p className="muted" style={{ fontSize: 13, marginTop: -8 }}>
            El importe total y la moneda se capturan arriba, en "Condiciones económicas y vigencia".
          </p>
          <div className="field has-error-wrap">
            <label htmlFor="serviciosIncluyeIva">¿El precio incluye IVA? *</label>
            <select
              id="serviciosIncluyeIva"
              value={valores.serviciosIncluyeIva === '' ? '' : String(valores.serviciosIncluyeIva)}
              disabled={disabled}
              onChange={(e) => set('serviciosIncluyeIva', e.target.value === '' ? '' : e.target.value === 'true')}
            >
              <option value="">Selecciona…</option>
              <option value="true">Incluye IVA</option>
              <option value="false">No incluye IVA</option>
            </select>
            {errores.serviciosIncluyeIva && <div className="error-text">{errores.serviciosIncluyeIva}</div>}
          </div>
          <div className="field has-error-wrap">
            <label htmlFor="serviciosCondicionesPago">Condiciones de pago (forma de pago, periodicidad, condiciones, etc.) *</label>
            <textarea
              id="serviciosCondicionesPago"
              value={valores.serviciosCondicionesPago}
              disabled={disabled}
              onChange={(e) => set('serviciosCondicionesPago', e.target.value)}
            />
            {errores.serviciosCondicionesPago && <div className="error-text">{errores.serviciosCondicionesPago}</div>}
          </div>
          <div className="field">
            <label htmlFor="serviciosGarantias">Garantías, de aplicar (opcional)</label>
            <textarea
              id="serviciosGarantias"
              value={valores.serviciosGarantias}
              disabled={disabled}
              onChange={(e) => set('serviciosGarantias', e.target.value)}
            />
          </div>
        </>
      )}

      {esFranquicia && (
        <>
          <hr className="divider" />
          <h3>Datos de franquicia</h3>
          <p className="page-header-sub" style={{ marginTop: -8, marginBottom: 14 }}>
            Campos propios del contrato de franquicia: activan sus avisos automáticos por correo.
          </p>

          <div className="field has-error-wrap" style={{ maxWidth: 380 }}>
            <label htmlFor="clubId">Club *</label>
            <select
              id="clubId"
              value={valores.clubId}
              disabled={disabled}
              onChange={(e) => set('clubId', e.target.value)}
            >
              <option value="">Selecciona un club…</option>
              {clubes.map((cl) => <option key={cl.id} value={cl.id}>{cl.nombre}</option>)}
            </select>
            {errores.clubId && <div className="error-text">{errores.clubId}</div>}
          </div>

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
