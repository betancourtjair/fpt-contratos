// Definicion unica del "Formulario de solicitud de contrato de Arrendamiento".
// El backend valida con esto y el frontend arma la pantalla (y el detalle) a partir de lo mismo
// (GET /api/arrendamientos/solicitudes/formulario), asi que un campo nuevo se agrega solo aqui.
// Los ids son camelCase a proposito: la API del frontend convierte las llaves a camelCase.
//
// campo:     { id, label, tipo: text|textarea|number|date|select|radio|multicheck, opciones?,
//              requerido?, visibleSi?: { campo, en: [valores] }, ayuda? }
// documento: { id, label, requerido?, visibleSi? }

const SI_NO = [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }];
const NO_NUEVO = ['convenio', 'prorroga', 'cesion', 'terminacion', 'otro'];
const MORAL = { campo: 'arrendadorTipoPersona', en: ['moral'] };
const FISICA = { campo: 'arrendadorTipoPersona', en: ['fisica'] };
const NO_PROPIETARIO = { campo: 'propietarioEsContraparte', en: ['no'] };

const SECCIONES = [
  {
    id: 'general',
    titulo: '1. Información general de la solicitud',
    campos: [
      {
        id: 'tipoTramite', label: 'Tipo de trámite que se solicita', tipo: 'select', requerido: true,
        opciones: [
          { value: 'nuevo', label: 'Contrato de arrendamiento nuevo' },
          { value: 'convenio', label: 'Convenio modificatorio' },
          { value: 'prorroga', label: 'Prórroga o renovación del contrato' },
          { value: 'cesion', label: 'Cesión de derechos' },
          { value: 'terminacion', label: 'Terminación o rescisión' },
          { value: 'otro', label: 'Otro' },
        ],
      },
      { id: 'tipoTramiteOtro', label: 'Otro (especificar)', tipo: 'text', requerido: true, visibleSi: { campo: 'tipoTramite', en: ['otro'] } },
      {
        id: 'convenioObjeto', label: 'Objeto de la modificación', tipo: 'multicheck', requerido: true,
        visibleSi: { campo: 'tipoTramite', en: ['convenio'] },
        opciones: [
          { value: 'domicilio', label: 'Domicilio' }, { value: 'superficie', label: 'Superficie' },
          { value: 'renta', label: 'Renta' }, { value: 'mantenimiento', label: 'Mantenimiento' },
          { value: 'garantias', label: 'Garantías' }, { value: 'prorroga', label: 'Prórroga' },
          { value: 'renovacion', label: 'Renovación' }, { value: 'otros', label: 'Otros' },
        ],
      },
      { id: 'contratoReferencia', label: 'Número o referencia del contrato vigente', tipo: 'text', visibleSi: { campo: 'tipoTramite', en: NO_NUEVO } },
      { id: 'contratoFechaFirma', label: 'Fecha de firma del contrato vigente', tipo: 'date', visibleSi: { campo: 'tipoTramite', en: NO_NUEVO } },
      { id: 'descripcionObjeto', label: 'Descripción del objeto y motivo de la solicitud', tipo: 'textarea', requerido: true },
      { id: 'comentarios', label: 'Comentarios adicionales (opcional)', tipo: 'textarea' },
    ],
  },
  {
    id: 'arrendador',
    titulo: '2. Datos del Arrendador',
    campos: [
      { id: 'arrendadorTipoPersona', label: 'Tipo de persona', tipo: 'select', requerido: true, opciones: [{ value: 'fisica', label: 'Persona física' }, { value: 'moral', label: 'Persona moral' }] },
      {
        id: 'arrendadorCaracter', label: 'Carácter con el que interviene', tipo: 'select', requerido: true,
        opciones: [
          { value: 'propietario', label: 'Propietario' },
          { value: 'representante', label: 'Representante o apoderado del propietario' },
          { value: 'fiduciario', label: 'Fiduciario' },
          { value: 'administrador', label: 'Administrador' },
          { value: 'subarrendador', label: 'Subarrendador' },
          { value: 'otro', label: 'Otro' },
        ],
      },
      { id: 'arrendadorCaracterOtro', label: 'Otro (especificar)', tipo: 'text', requerido: true, visibleSi: { campo: 'arrendadorCaracter', en: ['otro'] } },
      // Persona moral
      { id: 'razonSocial', label: 'Denominación o razón social completa', tipo: 'text', requerido: true, visibleSi: MORAL },
      { id: 'representanteNombre', label: 'Nombre completo del representante legal', tipo: 'text', requerido: true, visibleSi: MORAL },
      { id: 'contactoNombre', label: 'Responsable de la relación: nombre completo', tipo: 'text', requerido: true, visibleSi: MORAL },
      { id: 'contactoCargo', label: 'Responsable de la relación: cargo', tipo: 'text', visibleSi: MORAL },
      { id: 'contactoEmailMoral', label: 'Responsable de la relación: correo electrónico', tipo: 'text', requerido: true, visibleSi: MORAL },
      { id: 'contactoTelefonoMoral', label: 'Responsable de la relación: teléfono', tipo: 'text', requerido: true, visibleSi: MORAL },
      // Persona fisica
      { id: 'personaNombre', label: 'Nombre completo', tipo: 'text', requerido: true, visibleSi: FISICA },
      { id: 'personaNacionalidad', label: 'Nacionalidad', tipo: 'text', requerido: true, visibleSi: FISICA },
      { id: 'personaCurp', label: 'CURP', tipo: 'text', requerido: true, visibleSi: FISICA },
      { id: 'personaEmail', label: 'Correo electrónico', tipo: 'text', requerido: true, visibleSi: FISICA },
      { id: 'personaTelefono', label: 'Teléfono de contacto', tipo: 'text', requerido: true, visibleSi: FISICA },
      // Ambos
      { id: 'domicilioFiscal', label: 'Domicilio fiscal', tipo: 'textarea', requerido: true },
      { id: 'domicilioConvencional', label: 'Domicilio convencional para efectos del contrato', tipo: 'textarea', requerido: true },
    ],
    documentos: [
      { id: 'ineRepresentante', label: 'Identificación oficial vigente del representante legal', requerido: true, visibleSi: MORAL },
      { id: 'escrituraConstitutiva', label: 'Escritura constitutiva (con datos de inscripción en el Registro Público de la Propiedad y de Comercio)', requerido: true, visibleSi: MORAL },
      { id: 'escrituraModificacion', label: 'Escritura de modificación relevante (cambio de denominación, transformación, etc.)', visibleSi: MORAL },
      { id: 'poderRepresentante', label: 'Escritura que otorga facultades al representante legal para suscribir el contrato', requerido: true, visibleSi: MORAL },
      { id: 'csfMoral', label: 'Constancia de situación fiscal vigente (o identificación fiscal equivalente)', visibleSi: MORAL },
      { id: 'identificacionPersona', label: 'Identificación oficial vigente', requerido: true, visibleSi: FISICA },
      { id: 'csfPersona', label: 'Constancia de situación fiscal vigente (o identificación fiscal equivalente)', visibleSi: FISICA },
    ],
  },
  {
    id: 'propietario',
    titulo: '3. Propietario del inmueble y ubicación',
    campos: [
      { id: 'propietarioEsContraparte', label: '¿La contraparte es propietaria del inmueble?', tipo: 'radio', requerido: true, opciones: SI_NO },
      { id: 'propietarioRegistral', label: 'Nombre del propietario registral (si es distinto del Arrendador)', tipo: 'text', requerido: true, visibleSi: NO_PROPIETARIO },
      { id: 'regimenPropiedad', label: 'Régimen de propiedad (fideicomiso, condominio, centro comercial u otro), si aplica', tipo: 'text' },
      { id: 'fideicomisoIdentificacion', label: 'Fideicomiso: identificación (si aplica)', tipo: 'text' },
      { id: 'fideicomisoFiduciaria', label: 'Fideicomiso: fiduciaria (si aplica)', tipo: 'text' },
      { id: 'inmuebleNombre', label: 'Identificación comercial del inmueble (plaza o centro comercial), si corresponde', tipo: 'text' },
      { id: 'inmuebleCalle', label: 'Calle', tipo: 'text', requerido: true },
      { id: 'inmuebleNumero', label: 'Número exterior', tipo: 'text', requerido: true },
      { id: 'inmuebleColonia', label: 'Colonia', tipo: 'text', requerido: true },
      { id: 'inmuebleMunicipio', label: 'Municipio o alcaldía', tipo: 'text', requerido: true },
      { id: 'inmuebleCp', label: 'Código postal', tipo: 'text', requerido: true },
      { id: 'inmuebleEstado', label: 'Entidad federativa', tipo: 'text', requerido: true },
      { id: 'inmuebleObservaciones', label: 'Observaciones (copropiedad, usufructo, gravamen, limitación de dominio o autorización de un tercero, si se tiene conocimiento)', tipo: 'textarea' },
    ],
    documentos: [
      { id: 'tituloPropiedad', label: 'Título de propiedad (escritura pública o instrumento con datos de inscripción en el Registro Público de la Propiedad)', requerido: true },
      { id: 'poderFacultades', label: 'Poder, mandato, contrato o autorización que acredite las facultades del Arrendador para arrendar', requerido: true, visibleSi: NO_PROPIETARIO },
      { id: 'croquis', label: 'Croquis de ubicación del Local dentro del inmueble', requerido: true },
    ],
  },
  {
    id: 'condiciones',
    titulo: '4. Datos internos y condiciones autorizadas',
    campos: [
      { id: 'administradorInterno', label: 'Nombre del administrador interno del contrato', tipo: 'text', requerido: true },
      { id: 'areaSolicitante', label: 'Área solicitante', tipo: 'text', requerido: true },
      { id: 'superficieM2', label: 'Superficie del Local (m²)', tipo: 'text', requerido: true },
      { id: 'rentaM2', label: 'Renta por m²', tipo: 'text' },
      { id: 'rentaMensual', label: 'Renta mensual (sin IVA)', tipo: 'text', requerido: true },
      { id: 'rentaVariable', label: 'Renta variable (porcentaje, sin IVA) o "No aplica"', tipo: 'text' },
      { id: 'mantenimiento', label: 'Mantenimiento (porcentaje sobre la renta mensual, sin IVA)', tipo: 'text' },
      { id: 'fechaInicioPagoRenta', label: 'Fecha de inicio de pago de renta', tipo: 'date' },
      { id: 'incremento', label: 'Incremento', tipo: 'text' },
      { id: 'periodoGracia', label: 'Período de gracia', tipo: 'text' },
      { id: 'vigencia', label: 'Vigencia', tipo: 'text', requerido: true },
      { id: 'prorrogas', label: 'Prórrogas', tipo: 'text' },
      { id: 'rentaAdelantada', label: 'Renta adelantada', tipo: 'text' },
      { id: 'fechaRentaAdelantada', label: 'Fecha de pago de renta adelantada', tipo: 'date' },
      { id: 'depositoGarantia', label: 'Depósito en garantía', tipo: 'text' },
      { id: 'fechaDepositoGarantia', label: 'Fecha de pago de depósito en garantía', tipo: 'date' },
      { id: 'fechaEntregaLocal', label: 'Fecha de entrega del local', tipo: 'date' },
      { id: 'estacionamiento', label: 'Estacionamiento (no. de cajones y tarifa preferencial, u otro esquema)', tipo: 'textarea' },
      { id: 'horarioOperacion', label: 'Horario de operación', tipo: 'text' },
      { id: 'obligadoSolidario', label: '¿Se constituye obligado solidario?', tipo: 'radio', requerido: true, opciones: SI_NO },
      { id: 'autorizacionArgonnePlanet', label: '¿Cuenta con autorización de Argonne y Planet Fitness?', tipo: 'radio', requerido: true, opciones: SI_NO },
      { id: 'comentariosInternos', label: 'Comentarios adicionales (opcional)', tipo: 'textarea' },
    ],
    documentos: [
      { id: 'propuestaComercial', label: 'Propuesta comercial o autorizaciones internas (condiciones de la negociación)', requerido: true },
      { id: 'proyectoContrato', label: 'Proyecto de contrato enviado por el Arrendador, cuando exista' },
      { id: 'reglamentoPlaza', label: 'Reglamento de la plaza o centro comercial y manual de adecuaciones, cuando corresponda' },
      { id: 'otrosDocumentos', label: 'Cualquier otro documento o información relacionada con el proyecto' },
    ],
  },
];

function visible(item, datos) {
  if (!item.visibleSi) return true;
  const v = datos[item.visibleSi.campo];
  return item.visibleSi.en.includes(v);
}

function vacio(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);
}

// Devuelve { datos (solo campos visibles y limpios), errores: [] } y valida documentos requeridos
// contra los ids que llegaron (idsDocumentos).
function validar(entrada, idsDocumentos) {
  const datos = {};
  const errores = [];
  const origen = entrada && typeof entrada === 'object' ? entrada : {};
  // Se evalua en orden: visibleSi depende de campos anteriores ya normalizados.
  for (const sec of SECCIONES) {
    for (const c of sec.campos) {
      if (!visible(c, datos)) continue;
      let v = origen[c.id];
      if (c.tipo === 'multicheck') {
        v = Array.isArray(v) ? v.filter((x) => c.opciones.some((o) => o.value === x)) : [];
      } else {
        v = v === undefined || v === null ? '' : String(v).trim();
        if (v && ['select', 'radio'].includes(c.tipo) && !c.opciones.some((o) => o.value === v)) {
          errores.push(`${c.label}: valor no valido.`);
          continue;
        }
        if (v && c.tipo === 'date' && Number.isNaN(Date.parse(v))) {
          errores.push(`${c.label}: fecha no valida.`);
          continue;
        }
        if (v.length > 4000) v = v.slice(0, 4000);
      }
      if (vacio(v)) {
        if (c.requerido) errores.push(`${c.label} es requerido.`);
        continue;
      }
      datos[c.id] = v;
    }
  }
  for (const sec of SECCIONES) {
    for (const d of sec.documentos || []) {
      if (visible(d, datos) && d.requerido && !idsDocumentos.includes(d.id)) {
        errores.push(`Adjunta: ${d.label}.`);
      }
    }
  }
  return { datos, errores };
}

const IDS_DOCUMENTOS = SECCIONES.flatMap((s) => (s.documentos || []).map((d) => d.id));

function nombreArrendador(datos) {
  return datos.razonSocial || datos.personaNombre || '';
}

module.exports = { SECCIONES, validar, IDS_DOCUMENTOS, nombreArrendador, visible };
