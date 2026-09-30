-- FPT Contratos — Módulo de Arrendamientos (reemplazo de Leasecake)
--
-- Migración incremental: se aplica sobre la base ya existente de fpt-contratos
-- (prisma/migration.sql), no crea `usuarios` ni el tipo `rol_usuario` — los reusa tal cual
-- (mismo login, mismo JWT, mismos roles: super_admin/admin/ceo/cfo/cabeza_juridico tienen
-- acceso de nivel admin a este módulo — ver src/utils/roles.js ROLES_NIVEL_ADMIN — y cualquier
-- otro rol autenticado tiene acceso de solo lectura).
--
-- Aplicar con: node prisma/migrate_arrendamientos.js (o a mano en el SQL Editor de Neon).
--
-- Diseño basado en un reconocimiento real de la cuenta de Leasecake de FPT (63 ubicaciones,
-- 58 leases activos, 1 brand, 2 companies, 0 contacts, 0 tasks). Los ~230 campos que expone el
-- reporte combinado de Leasecake NO se modelan todos como columnas fijas: se migran como
-- columnas reales los que confirmamos poblados (fechas, renta por periodo, landlord/tenant,
-- cláusulas críticas, notas), y se deja `atributos_extra JSONB` en las tablas principales para
-- cualquier campo adicional que aparezca poblado en registros que aún no hemos revisado, sin
-- necesidad de una migración de esquema para cada uno.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid() (ya debería existir; IF NOT EXISTS por seguridad)

-- ---------------------------------------------------------------------------
-- Brands y Companies (tenant) — módulos propios en Leasecake
-- ---------------------------------------------------------------------------
CREATE TABLE brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "Company" en Leasecake = la entidad legal inquilina (tenant), no el landlord (el landlord
-- vive como texto libre dentro de cada lease/ubicación — ver comentario en `leases` abajo).
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE,
  ein TEXT,
  year_established INTEGER,
  full_address TEXT,
  address1 TEXT,
  address2 TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  country TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Locations (Ubicaciones)
-- ---------------------------------------------------------------------------
CREATE TABLE locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  location_number TEXT,
  brand_id UUID REFERENCES brands(id),
  company_id UUID REFERENCES companies(id), -- tenant/parent company
  address1 TEXT,
  address2 TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  country TEXT,
  full_address TEXT,
  latitude NUMERIC(10,6),
  longitude NUMERIC(10,6),
  location_type TEXT, -- p.ej. "Retail"
  location_subtype TEXT, -- p.ej. "Lifestyle Center"
  business_category TEXT, -- p.ej. "Sports & Recreation"
  business_type TEXT, -- p.ej. "Franchise"
  property_name TEXT, -- nombre del centro comercial/plaza que aloja la ubicación
  square_meters NUMERIC(12,2),
  total_leased_sqm NUMERIC(12,2),
  total_subleased_sqm NUMERIC(12,2),
  phone TEXT,
  lockbox_code TEXT,
  location_image_url TEXT,
  atributos_extra JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX locations_brand_id_idx ON locations(brand_id);
CREATE INDEX locations_company_id_idx ON locations(company_id);

-- Hilo de comentarios por ubicación (pestaña "Discussion" en Leasecake).
CREATE TABLE location_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  comentario TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX location_comments_location_id_idx ON location_comments(location_id);

-- Archivos por ubicación/lease (pestaña "Files" en Leasecake). Igual que fpt-contratos:
-- STORAGE_DRIVER decide dónde vive el binario; aquí solo se guarda la metadata.
CREATE TABLE location_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  lease_id UUID, -- FK se agrega tras crear `leases` más abajo
  nombre_archivo TEXT NOT NULL,
  categoria TEXT, -- p.ej. "Contrato firmado", "Plano", "Póliza de seguro"
  storage_key TEXT NOT NULL,
  subido_por_id UUID REFERENCES usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX location_documents_location_id_idx ON location_documents(location_id);

-- ---------------------------------------------------------------------------
-- Leases (Contratos de arrendamiento)
-- ---------------------------------------------------------------------------
CREATE TYPE estatus_lease AS ENUM ('activo', 'vencido', 'cancelado', 'mes_a_mes');

CREATE TABLE leases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  tenant_company_id UUID REFERENCES companies(id),
  lease_name TEXT,
  lease_type TEXT, -- p.ej. "Lease", "Sublease"
  is_sub_lease BOOLEAN NOT NULL DEFAULT false,
  estatus estatus_lease NOT NULL DEFAULT 'activo',
  acquisition_type TEXT, -- p.ej. "Lease"
  lease_classification TEXT,

  -- Fechas clave del lease
  lease_commencement_date DATE,
  rent_commencement_date DATE,
  possession_date DATE,
  delivery_date DATE,
  expiration_date DATE, -- término inicial
  expiration_date_including_options DATE, -- incluyendo todas las opciones de renovación
  is_month_to_month BOOLEAN NOT NULL DEFAULT false,
  month_to_month_exp_date DATE,

  -- Renovación
  number_of_options INTEGER,
  each_option_years NUMERIC(5,2),
  remaining_options INTEGER,
  remaining_options_years NUMERIC(5,2),
  renewal_notice_period_start DATE,
  renewal_notice_earliest_submission_date DATE,
  renewal_notice_period_end DATE,
  renewal_notice_deadline DATE,
  renewal_notice_intention TEXT,

  length_of_lease_months INTEGER,

  -- Landlord: en Leasecake vive como texto libre dentro del lease/ubicación, no como una
  -- entidad normalizada aparte (confirmado: el módulo "Companies" solo trae tenants). Se deja
  -- así por ahora; se puede normalizar a una tabla `landlords` después si se vuelve necesario.
  landlord_nombre TEXT,
  landlord_parent_company TEXT,
  landlord_vendor_id TEXT,
  landlord_address1 TEXT,
  landlord_address2 TEXT,
  landlord_city TEXT,
  landlord_state TEXT,
  landlord_zip TEXT,
  landlord_country TEXT,
  landlord_poc_nombre TEXT,
  landlord_poc_telefono TEXT,
  landlord_poc_email TEXT,

  -- Pagos / condiciones
  grace_period_dias INTEGER,
  late_fee_type TEXT, -- p.ej. "%", "Monto fijo"
  late_fee_monto NUMERIC(14,2),
  security_deposit NUMERIC(14,2),
  rental_prepayments NUMERIC(14,2),
  rental_prepayments_detalle TEXT,
  initial_direct_costs NUMERIC(14,2),
  notice_address TEXT,
  payment_method TEXT,
  payment_address TEXT,
  remaining_lease_liability NUMERIC(16,2),

  -- Seguro (COI)
  coi_effective_date DATE,
  coi_expiration_date DATE,

  -- Percent rent (retail) — casi siempre vacío para FPT, se deja disponible
  percent_rent_yn BOOLEAN,
  percent_rent_payment_date DATE,
  percent_rent_month_start DATE,
  percent_rent_month_end DATE,
  percent_rent_sales NUMERIC(16,2),
  percent_rent_breakpoints TEXT,
  percent_rent_overage_sales NUMERIC(16,2),

  misc_lease_details TEXT,
  atributos_extra JSONB NOT NULL DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX leases_location_id_idx ON leases(location_id);
CREATE INDEX leases_tenant_company_id_idx ON leases(tenant_company_id);
CREATE INDEX leases_expiration_date_idx ON leases(expiration_date);

ALTER TABLE location_documents
  ADD CONSTRAINT location_documents_lease_id_fkey FOREIGN KEY (lease_id) REFERENCES leases(id) ON DELETE CASCADE;

-- Calendario de renta por periodo: cada lease trae, en Leasecake, un cronograma completo
-- (no solo "mes actual/siguiente") con montos que pueden variar por años. Una fila por
-- periodo y categoría (Base Rent, CAM, Insurance, Property Tax, Parking, Signage, Storage,
-- Publicidad, Espacio temporal de preventa, Other, Taxes).
CREATE TABLE lease_rent_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL DEFAULT 'Base Rent',
  start_date DATE NOT NULL,
  end_date DATE,
  monto NUMERIC(14,2) NOT NULL,
  frecuencia TEXT NOT NULL DEFAULT 'Monthly',
  due_date TEXT, -- p.ej. "1" (día del mes) — Leasecake lo trae como texto libre a veces
  proration TEXT,
  payee TEXT,
  pct_change NUMERIC(6,3),
  monto_por_sqm NUMERIC(10,2),
  nota TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lease_rent_schedule_lease_id_idx ON lease_rent_schedule(lease_id);
CREATE INDEX lease_rent_schedule_start_date_idx ON lease_rent_schedule(start_date);

CREATE TABLE lease_one_time_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  due_date DATE,
  tipo TEXT,
  monto NUMERIC(14,2),
  payee TEXT,
  periodo_cubierto TEXT,
  nota TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lease_one_time_payments_lease_id_idx ON lease_one_time_payments(lease_id);

CREATE TABLE lease_tax_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  start_date DATE,
  end_date DATE,
  taxable_rent_types TEXT,
  rate NUMERIC(6,3),
  payee TEXT,
  nota TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lease_tax_schedule_lease_id_idx ON lease_tax_schedule(lease_id);

-- Cláusulas críticas extraídas del contrato, con resumen generado por IA + texto original
-- (visto en la muestra real: "Common Area Maintenance Charges", "Incremento de Renta", con
-- referencia de página/sección del documento).
CREATE TABLE lease_critical_clauses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  clause_type TEXT NOT NULL,
  page_number TEXT,
  section_number TEXT,
  lease_document_header TEXT,
  ai_summary TEXT,
  original_language TEXT,
  lease_is_silent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lease_critical_clauses_lease_id_idx ON lease_critical_clauses(lease_id);

-- Notas de lease (con autor y fecha, visto en la muestra real: "Fecha de Apertura",
-- "Fecha de Firma del Contrato", "Agua", etc.)
CREATE TABLE lease_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  titulo TEXT,
  nota TEXT NOT NULL,
  autor_nombre TEXT, -- texto libre migrado de Leasecake; no necesariamente un usuario_id de esta app
  autor_usuario_id UUID REFERENCES usuarios(id),
  fecha_nota TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lease_notes_lease_id_idx ON lease_notes(lease_id);

-- ---------------------------------------------------------------------------
-- Tasks (vacío en Leasecake al momento de migrar, pero el módulo se construye igual)
-- ---------------------------------------------------------------------------
CREATE TYPE estatus_task AS ENUM ('abierta', 'en_progreso', 'cerrada');

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descripcion TEXT,
  location_id UUID REFERENCES locations(id) ON DELETE CASCADE,
  lease_id UUID REFERENCES leases(id) ON DELETE CASCADE,
  asignado_a_id UUID REFERENCES usuarios(id),
  estatus estatus_task NOT NULL DEFAULT 'abierta',
  fecha_limite DATE,
  created_by_id UUID REFERENCES usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tasks_location_id_idx ON tasks(location_id);
CREATE INDEX tasks_asignado_a_id_idx ON tasks(asignado_a_id);

-- ---------------------------------------------------------------------------
-- Contacts (vacío en Leasecake al momento de migrar, pero el módulo se construye igual)
-- ---------------------------------------------------------------------------
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  email TEXT,
  telefono TEXT,
  empresa TEXT,
  puesto TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Events (calendario). En Leasecake son mayormente calculados a partir de fechas del lease
-- (Rent Payment Due Date, Rent Commencement Date, Renewal Notice Deadline, COI Expiration,
-- etc.) — aquí se recrean con una consulta/job en vez de sincronizarse como filas estáticas,
-- salvo un evento manual que alguien quiera agregar (esta tabla es solo para esos).
-- ---------------------------------------------------------------------------
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID REFERENCES locations(id) ON DELETE CASCADE,
  lease_id UUID REFERENCES leases(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  fecha DATE NOT NULL,
  origen TEXT NOT NULL DEFAULT 'manual', -- 'manual' | futuro: los auto-generados se calculan on-the-fly, no se guardan
  created_by_id UUID REFERENCES usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX events_fecha_idx ON events(fecha);

-- ---------------------------------------------------------------------------
-- Registro de alertas ya enviadas (renovación, vencimiento de COI, vencimiento de lease).
-- Leasecake avisa estos hitos por correo; aquí se recrea con un job diario (ver
-- src/jobs/scheduler.js + src/utils/alertas.js) que revisa fechas próximas y evita reenviar
-- el mismo aviso todos los días guardando una fila por (lease_id, tipo, fecha_evento).
-- ---------------------------------------------------------------------------
CREATE TABLE lease_alerts_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, -- 'renewal_notice' | 'coi_expiration' | 'lease_expiration'
  fecha_evento DATE NOT NULL,
  enviado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lease_id, tipo, fecha_evento)
);
