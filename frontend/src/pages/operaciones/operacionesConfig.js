// Configuracion de los formularios del modulo Operaciones (ver backend/src/routes/operaciones.js,
// que valida lo mismo del lado del servidor). Describe, por tipo de solicitud, que campos se
// piden; el formulario (NuevaSolicitudOperaciones.jsx) se arma a partir de esto.

export const CATEGORIAS = {
  socios: {
    label: 'Atención a Socios',
    descripcion: 'Bajas extraordinarias de socios e invitados por incumplimientos al Reglamento.',
    tipos: ['baja_socio', 'baja_invitado'],
  },
  autoridades: {
    label: 'Atención a Autoridades',
    descripcion: 'Citatorios de PROFECO y solicitudes de Fiscalías y Ministerios Públicos.',
    tipos: ['citatorio_profeco', 'solicitud_fiscalia'],
  },
};

const HECHOS_AYUDA =
  'Descripción cronológica de lo ocurrido, indicando fecha y hora, lugar, personas involucradas, qué sucedió y qué ocurrió posteriormente.';
const COMENTARIOS_BAJA_AYUDA =
  'Antecedentes de atención, abordajes previos o cualquier información complementaria relevante.';
const EVIDENCIAS_AYUDA =
  'Documentación de respaldo, actas de hechos, capturas de pantalla, fotografías, videos, etc.';

const VALIDACIONES_BAJAS = [
  { key: 'autorizacionGerenteRegional', label: 'Cuento con la autorización correspondiente del Gerente Regional para solicitar la baja.' },
  { key: 'informacionCompleta', label: 'La información proporcionada es completa y correcta.' },
  { key: 'evidenciasAdjuntas', label: 'He adjuntado las evidencias disponibles.' },
];

export const TIPOS = {
  baja_socio: {
    categoria: 'socios',
    ruta: 'baja-socio',
    label: 'Baja extraordinaria de socio',
    descripcion: 'Elaboración del formato de cancelación de la membresía por incumplimientos al Reglamento.',
    clubAyuda: 'Club en el que ocurrieron los hechos que motivan la solicitud.',
    gerenteAyuda: 'Nombre completo de la persona que realiza la solicitud.',
    campos: [
      { key: 'socioNombre', label: 'Socio', tipo: 'text', requerido: true, ayuda: 'Nombre completo del socio objeto de la baja.' },
      { key: 'socioNumero', label: 'No. de socio', tipo: 'text', requerido: true, ayuda: 'ID del socio en Zenoti.' },
      { key: 'hechos', label: 'Hechos que motivan la baja extraordinaria', tipo: 'textarea', requerido: true, ayuda: HECHOS_AYUDA },
      { key: 'comentarios', label: 'Comentarios adicionales', tipo: 'textarea', requerido: false, ayuda: COMENTARIOS_BAJA_AYUDA },
    ],
    archivos: { label: 'Evidencias', ayuda: EVIDENCIAS_AYUDA, requerido: false },
    validaciones: VALIDACIONES_BAJAS,
  },
  baja_invitado: {
    categoria: 'socios',
    ruta: 'baja-invitado',
    label: 'Baja extraordinaria de invitado',
    descripcion:
      'Elaboración de acta de hechos dirigida al socio titular por incumplimientos al Reglamento cometidos por su invitado, a efecto de restringir el acceso de este último.',
    clubAyuda: 'Club en el que ocurrieron los hechos que motivan la solicitud.',
    gerenteAyuda: 'Nombre completo de la persona que realiza la solicitud.',
    campos: [
      { key: 'socioTitularNombre', label: 'Socio titular', tipo: 'text', requerido: true, ayuda: 'Nombre completo del socio titular.' },
      { key: 'socioNumero', label: 'No. de socio', tipo: 'text', requerido: true, ayuda: 'ID del socio titular en Zenoti.' },
      { key: 'invitadoNombre', label: 'Invitado', tipo: 'text', requerido: true, ayuda: 'Nombre completo del invitado objeto de la baja.' },
      { key: 'hechos', label: 'Hechos que motivan la baja extraordinaria', tipo: 'textarea', requerido: true, ayuda: HECHOS_AYUDA },
      { key: 'comentarios', label: 'Comentarios adicionales', tipo: 'textarea', requerido: false, ayuda: COMENTARIOS_BAJA_AYUDA },
    ],
    archivos: { label: 'Evidencias', ayuda: EVIDENCIAS_AYUDA, requerido: false },
    validaciones: VALIDACIONES_BAJAS,
  },
  citatorio_profeco: {
    categoria: 'autoridades',
    ruta: 'citatorio-profeco',
    label: 'Citatorios para audiencias de conciliación ante PROFECO',
    descripcion: 'Reporte de un citatorio notificado por PROFECO para una audiencia de conciliación.',
    clubAyuda: 'Club en el que se recibió la notificación.',
    gerenteAyuda: 'Nombre completo de la persona que realiza el reporte.',
    campos: [
      { key: 'fechaRecepcion', label: 'Fecha de recepción', tipo: 'date', requerido: true, ayuda: 'Fecha en la que fue recibido el citatorio.' },
      {
        key: 'antecedentes',
        label: 'Antecedentes de la queja',
        tipo: 'textarea',
        requerido: true,
        ayuda:
          'Descripción cronológica de los hechos que dieron origen a la queja y de la atención brindada al socio, indicando quiénes intervinieron, qué acciones se realizaron y cualquier comunicación o antecedente relevante.',
      },
    ],
    archivos: { label: 'Citatorio', ayuda: 'Documento completo notificado por PROFECO, debidamente escaneado.', requerido: true },
    validaciones: [],
  },
  solicitud_fiscalia: {
    categoria: 'autoridades',
    ruta: 'solicitud-fiscalia',
    label: 'Solicitudes de videograbaciones y/o información de Fiscalías y Ministerios Públicos',
    descripcion: 'Reporte de un oficio de solicitud de videograbaciones y/o información de una Fiscalía o Ministerio Público.',
    clubAyuda: 'Club al que corresponde la solicitud de la autoridad.',
    gerenteAyuda: 'Nombre completo de la persona que realiza el reporte.',
    campos: [
      {
        key: 'disponibilidadVideo',
        label: 'Disponibilidad de videograbaciones',
        tipo: 'si_no',
        requerido: true,
        ayuda: 'Indicar si se cuenta con las videograbaciones solicitadas.',
      },
      {
        key: 'comentarios',
        label: 'Comentarios adicionales',
        tipo: 'textarea',
        requerido: false,
        ayuda: 'Información complementaria relevante. En caso de no contar con las videograbaciones o información solicitada, indicar el motivo.',
        requeridoSi: { key: 'disponibilidadVideo', valor: 'no' },
      },
    ],
    archivos: { label: 'Oficio de solicitud', ayuda: 'Documento completo notificado por la Fiscalía y/o Ministerio Público, debidamente escaneado.', requerido: true },
    validaciones: [],
  },
};

export const TIPO_POR_RUTA = Object.fromEntries(Object.entries(TIPOS).map(([k, v]) => [v.ruta, k]));

export const ESTATUS_LABELS = {
  recibida: 'Recibida',
  en_proceso: 'En proceso',
  atendida: 'Atendida',
};

// Etiquetas de los campos guardados en `datos` (para mostrar el detalle de una solicitud).
export const ETIQUETAS_DATOS = {
  socioNombre: 'Socio',
  socioTitularNombre: 'Socio titular',
  socioNumero: 'No. de socio',
  invitadoNombre: 'Invitado',
  hechos: 'Hechos que motivan la baja extraordinaria',
  comentarios: 'Comentarios adicionales',
  fechaRecepcion: 'Fecha de recepción',
  antecedentes: 'Antecedentes de la queja',
  disponibilidadVideo: 'Disponibilidad de videograbaciones',
};

export const ETIQUETAS_VALIDACIONES = Object.fromEntries(VALIDACIONES_BAJAS.map((v) => [v.key, v.label]));
