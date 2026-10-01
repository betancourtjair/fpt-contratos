// Configuración declarativa de los campos de Locations y Leases, agrupados igual que en el
// backend (ver backend/src/routes/arrendamientos/{locations,leases}.js MAPA_COLUMNAS). Un solo
// <CamposForm> (ver CamposForm.jsx) los renderiza a partir de esta config, en vez de escribir a
// mano el JSX de cada uno de los ~70 campos entre ambos modelos.

export const ESTATUS_LEASE = [
  { value: 'activo', label: 'Activo' },
  { value: 'vencido', label: 'Vencido' },
  { value: 'cancelado', label: 'Cancelado' },
  { value: 'mes_a_mes', label: 'Mes a mes' },
];

export const CATEGORIAS_RENTA = [
  'Base Rent', 'CAM', 'Insurance', 'Property Tax', 'Parking', 'Signage', 'Storage',
  'Publicidad', 'Espacio temporal de preventa', 'Other', 'Taxes',
];

// Categorías de archivos por ubicación (pestaña "Files" de Leasecake). Se obtuvieron analizando
// el "tipo"/"tag" real de los 567 archivos existentes en las 63 ubicaciones de Leasecake vía su
// API (ver api/v2/locations/:id/files y api/v2/leases/:id/files) — no son una lista inventada.
export const CATEGORIAS_DOCUMENTO_LOCATION = [
  'Contrato Master',
  'Convenio Modificatorio',
  'Depósito en Garantía',
  'Mantenimiento de Plaza',
  'Renta Mensual',
  'Agua',
  'CFE (Energía Eléctrica)',
  'Gas Natural',
  'Estoppel / Renta Variable',
  'Licencias',
  'Equipo de Gimnasio',
  'Otro',
];

export const GRUPOS_LOCATION = [
  {
    titulo: 'General',
    campos: [
      { key: 'nombre', label: 'Nombre *', type: 'text' },
      { key: 'locationNumber', label: 'Número de ubicación', type: 'text' },
      { key: 'brandId', label: 'Brand', type: 'select', opcionesKey: 'brands' },
      { key: 'companyId', label: 'Company (tenant)', type: 'select', opcionesKey: 'companies' },
      { key: 'locationType', label: 'Tipo', type: 'text' },
      { key: 'locationSubtype', label: 'Subtipo', type: 'text' },
      { key: 'businessCategory', label: 'Categoría de negocio', type: 'text' },
      { key: 'businessType', label: 'Tipo de negocio', type: 'text' },
      { key: 'propertyName', label: 'Nombre de la plaza/centro comercial', type: 'text' },
    ],
  },
  {
    titulo: 'Dirección',
    campos: [
      { key: 'address1', label: 'Dirección 1', type: 'text' },
      { key: 'address2', label: 'Dirección 2', type: 'text' },
      { key: 'city', label: 'Ciudad', type: 'text' },
      { key: 'state', label: 'Estado', type: 'text' },
      { key: 'zip', label: 'C.P.', type: 'text' },
      { key: 'country', label: 'País', type: 'text' },
      { key: 'fullAddress', label: 'Dirección completa', type: 'text' },
      { key: 'latitude', label: 'Latitud', type: 'number' },
      { key: 'longitude', label: 'Longitud', type: 'number' },
    ],
  },
  {
    titulo: 'Superficie y contacto',
    campos: [
      { key: 'squareMeters', label: 'm² totales', type: 'number' },
      { key: 'totalLeasedSqm', label: 'm² rentados', type: 'number' },
      { key: 'totalSubleasedSqm', label: 'm² subarrendados', type: 'number' },
      { key: 'phone', label: 'Teléfono', type: 'text' },
      { key: 'lockboxCode', label: 'Código de lockbox', type: 'text' },
    ],
  },
];

export const GRUPOS_LEASE = [
  {
    titulo: 'General',
    campos: [
      { key: 'tenantCompanyId', label: 'Company (tenant)', type: 'select', opcionesKey: 'companies' },
      { key: 'leaseName', label: 'Nombre del lease', type: 'text' },
      { key: 'leaseType', label: 'Tipo (Lease/Sublease)', type: 'text' },
      { key: 'isSubLease', label: 'Es sublease', type: 'boolean' },
      { key: 'estatus', label: 'Estatus', type: 'select', opciones: ESTATUS_LEASE },
      { key: 'acquisitionType', label: 'Tipo de adquisición', type: 'text' },
      { key: 'leaseClassification', label: 'Clasificación', type: 'text' },
    ],
  },
  {
    titulo: 'Fechas clave',
    campos: [
      { key: 'leaseCommencementDate', label: 'Inicio del lease', type: 'date' },
      { key: 'rentCommencementDate', label: 'Inicio de pago de renta', type: 'date' },
      { key: 'possessionDate', label: 'Fecha de posesión', type: 'date' },
      { key: 'deliveryDate', label: 'Fecha de entrega', type: 'date' },
      { key: 'expirationDate', label: 'Vencimiento (término inicial)', type: 'date' },
      { key: 'expirationDateIncludingOptions', label: 'Vencimiento incl. opciones', type: 'date' },
      { key: 'isMonthToMonth', label: 'Es mes a mes', type: 'boolean' },
      { key: 'monthToMonthExpDate', label: 'Vencimiento mes a mes', type: 'date' },
    ],
  },
  {
    titulo: 'Renovación',
    campos: [
      { key: 'numberOfOptions', label: 'Número de opciones', type: 'number' },
      { key: 'eachOptionYears', label: 'Años por opción', type: 'number' },
      { key: 'remainingOptions', label: 'Opciones restantes', type: 'number' },
      { key: 'remainingOptionsYears', label: 'Años restantes de opciones', type: 'number' },
      { key: 'renewalNoticePeriodStart', label: 'Inicio ventana de aviso', type: 'date' },
      { key: 'renewalNoticeEarliestSubmissionDate', label: 'Fecha más temprana de envío', type: 'date' },
      { key: 'renewalNoticePeriodEnd', label: 'Fin ventana de aviso', type: 'date' },
      { key: 'renewalNoticeDeadline', label: 'Fecha límite de aviso', type: 'date' },
      { key: 'renewalNoticeIntention', label: 'Intención de renovación', type: 'text' },
      { key: 'lengthOfLeaseMonths', label: 'Duración del lease (meses)', type: 'number' },
    ],
  },
  {
    titulo: 'Landlord',
    campos: [
      { key: 'landlordNombre', label: 'Nombre', type: 'text' },
      { key: 'landlordParentCompany', label: 'Empresa matriz', type: 'text' },
      { key: 'landlordVendorId', label: 'ID de proveedor', type: 'text' },
      { key: 'landlordAddress1', label: 'Dirección 1', type: 'text' },
      { key: 'landlordAddress2', label: 'Dirección 2', type: 'text' },
      { key: 'landlordCity', label: 'Ciudad', type: 'text' },
      { key: 'landlordState', label: 'Estado', type: 'text' },
      { key: 'landlordZip', label: 'C.P.', type: 'text' },
      { key: 'landlordCountry', label: 'País', type: 'text' },
      { key: 'landlordPocNombre', label: 'Contacto', type: 'text' },
      { key: 'landlordPocTelefono', label: 'Teléfono del contacto', type: 'text' },
      { key: 'landlordPocEmail', label: 'Correo del contacto', type: 'text' },
    ],
  },
  {
    titulo: 'Pagos y condiciones',
    campos: [
      { key: 'gracePeriodDias', label: 'Días de gracia', type: 'number' },
      { key: 'lateFeeType', label: 'Tipo de recargo por atraso', type: 'text' },
      { key: 'lateFeeMonto', label: 'Monto de recargo', type: 'number' },
      { key: 'securityDeposit', label: 'Depósito en garantía', type: 'number' },
      { key: 'rentalPrepayments', label: 'Rentas pagadas por adelantado', type: 'number' },
      { key: 'rentalPrepaymentsDetalle', label: 'Detalle de pagos adelantados', type: 'text' },
      { key: 'initialDirectCosts', label: 'Costos directos iniciales', type: 'number' },
      { key: 'noticeAddress', label: 'Dirección para notificaciones', type: 'textarea' },
      { key: 'paymentMethod', label: 'Método de pago', type: 'text' },
      { key: 'paymentAddress', label: 'Dirección de pago', type: 'textarea' },
      { key: 'remainingLeaseLiability', label: 'Pasivo restante del lease', type: 'number' },
    ],
  },
  {
    titulo: 'Seguro (COI)',
    campos: [
      { key: 'coiEffectiveDate', label: 'Vigencia desde', type: 'date' },
      { key: 'coiExpirationDate', label: 'Vencimiento', type: 'date' },
    ],
  },
  {
    titulo: 'Percent Rent',
    campos: [
      { key: 'percentRentYn', label: 'Aplica percent rent', type: 'boolean' },
      { key: 'percentRentPaymentDate', label: 'Fecha de pago', type: 'date' },
      { key: 'percentRentMonthStart', label: 'Mes de inicio', type: 'date' },
      { key: 'percentRentMonthEnd', label: 'Mes de fin', type: 'date' },
      { key: 'percentRentSales', label: 'Ventas', type: 'number' },
      { key: 'percentRentBreakpoints', label: 'Breakpoints', type: 'text' },
      { key: 'percentRentOverageSales', label: 'Ventas de overage', type: 'number' },
    ],
  },
  {
    titulo: 'Otros',
    campos: [{ key: 'miscLeaseDetails', label: 'Detalles adicionales', type: 'textarea' }],
  },
];

/** Convierte cualquier valor de fecha del backend (ISO timestamp o 'YYYY-MM-DD') al formato
 * que espera <input type="date"> (siempre 'YYYY-MM-DD'). */
export function toDateInputValue(v) {
  if (!v) return '';
  return String(v).slice(0, 10);
}

/** Arma el objeto inicial de un formulario a partir de los grupos de campos + los valores
 * actuales (o vacío para "nuevo"). */
export function valoresIniciales(grupos, origen = {}) {
  const out = {};
  for (const grupo of grupos) {
    for (const campo of grupo.campos) {
      const v = origen[campo.key];
      if (campo.type === 'date') out[campo.key] = toDateInputValue(v);
      else if (campo.type === 'boolean') out[campo.key] = !!v;
      else out[campo.key] = v ?? '';
    }
  }
  return out;
}
