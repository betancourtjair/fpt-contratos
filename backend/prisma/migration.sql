-- FPT Contratos - Plataforma de Gestión Contractual
-- Migración inicial (SQL escrito a mano; Prisma Client no se usa en runtime porque la
-- descarga del query engine está bloqueada en algunos entornos de desarrollo/sandbox.
-- prisma/schema.prisma se conserva como documentación del modelo de datos).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE rol_usuario AS ENUM ('super_admin', 'admin', 'juridico', 'aprobador', 'solicitante', 'lectura');
CREATE TYPE estatus_contrato AS ENUM ('borrador', 'en_revision', 'en_autorizacion', 'rechazado', 'autorizado', 'activo', 'por_vencer', 'vencido', 'cancelado');
CREATE TYPE decision_aprobacion AS ENUM ('pendiente', 'aprobado', 'rechazado', 'omitido');
CREATE TYPE categoria_documento AS ENUM ('borrador', 'version_firmada', 'anexo', 'evidencia', 'otro');

CREATE TABLE usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  rol rol_usuario NOT NULL DEFAULT 'solicitante',
  area TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tipos_contrato (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT UNIQUE NOT NULL,
  descripcion TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE flujo_plantillas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  tipo_contrato_id UUID REFERENCES tipos_contrato(id),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE flujo_pasos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plantilla_id UUID NOT NULL REFERENCES flujo_plantillas(id) ON DELETE CASCADE,
  orden INT NOT NULL,
  nombre TEXT NOT NULL,
  rol_aprobador rol_usuario,
  aprobador_id UUID REFERENCES usuarios(id),
  monto_minimo NUMERIC(14,2),
  monto_maximo NUMERIC(14,2),
  obligatorio BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (plantilla_id, orden),
  CHECK (rol_aprobador IS NOT NULL OR aprobador_id IS NOT NULL)
);

CREATE TABLE contratos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio TEXT UNIQUE NOT NULL,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  tipo_contrato_id UUID NOT NULL REFERENCES tipos_contrato(id),
  parte TEXT NOT NULL,
  contraparte_nombre TEXT NOT NULL,
  contraparte_rfc TEXT,
  contraparte_contacto TEXT,
  contraparte_email TEXT,
  monto NUMERIC(14,2),
  moneda TEXT NOT NULL DEFAULT 'MXN',
  fecha_inicio DATE,
  fecha_fin DATE,
  renovacion_automatica BOOLEAN NOT NULL DEFAULT FALSE,
  dias_aviso_vencimiento INT NOT NULL DEFAULT 30,
  estatus estatus_contrato NOT NULL DEFAULT 'borrador',
  solicitado_por_id UUID NOT NULL REFERENCES usuarios(id),
  plantilla_flujo_id UUID REFERENCES flujo_plantillas(id),
  paso_actual_orden INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contratos_estatus ON contratos(estatus);
CREATE INDEX idx_contratos_fecha_fin ON contratos(fecha_fin);
CREATE INDEX idx_contratos_solicitado_por ON contratos(solicitado_por_id);

CREATE TABLE contrato_aprobaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  orden INT NOT NULL,
  nombre_paso TEXT NOT NULL,
  aprobador_id UUID REFERENCES usuarios(id),
  rol_requerido rol_usuario,
  decision decision_aprobacion NOT NULL DEFAULT 'pendiente',
  comentarios TEXT,
  decidido_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contrato_id, orden)
);

CREATE TABLE contrato_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  nombre_archivo TEXT NOT NULL,
  ruta_archivo TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  categoria categoria_documento NOT NULL DEFAULT 'borrador',
  subido_por_id UUID NOT NULL REFERENCES usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID REFERENCES contratos(id),
  usuario_id UUID REFERENCES usuarios(id),
  accion TEXT NOT NULL,
  detalle TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Franquicias: un tipo de contrato se marca es_franquicia = true y, al elegirlo,
-- el formulario despliega estos campos adicionales (1:1 con contratos). Las
-- columnas *_avisado son control interno del programador de notificaciones
-- (src/utils/franquicias.js) para no reenviar el mismo aviso cada día.
-- ---------------------------------------------------------------------------

ALTER TABLE tipos_contrato ADD COLUMN es_franquicia BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE contrato_franquicia_detalles (
  contrato_id UUID PRIMARY KEY REFERENCES contratos(id) ON DELETE CASCADE,

  -- Términos financieros
  cuota_inicial NUMERIC(14,2),
  regalias_porcentaje NUMERIC(5,2),
  fondo_mercadeo_porcentaje NUMERIC(5,2),
  periodicidad_pago_regalias TEXT, -- 'mensual' | 'trimestral' | 'semestral' | 'anual'
  fecha_proximo_pago_regalias DATE,
  dias_aviso_pago_regalias INT NOT NULL DEFAULT 7,
  pago_regalias_avisado BOOLEAN NOT NULL DEFAULT false,

  -- Territorio y exclusividad
  territorio TEXT,
  radio_exclusividad_km NUMERIC(6,2),
  direccion_punto TEXT,

  -- Plazos y renovación
  fecha_limite_apertura DATE,
  dias_aviso_apertura INT NOT NULL DEFAULT 30,
  apertura_avisada BOOLEAN NOT NULL DEFAULT false,
  numero_renovaciones_permitidas INT,
  condiciones_renovacion TEXT,
  dias_aviso_renovacion INT NOT NULL DEFAULT 60,

  -- Cumplimiento y garantías
  fecha_proxima_auditoria DATE,
  dias_aviso_auditoria INT NOT NULL DEFAULT 15,
  auditoria_avisada BOOLEAN NOT NULL DEFAULT false,
  polizas_seguro_requeridas TEXT,
  garantia_personal BOOLEAN NOT NULL DEFAULT false,
  garante_nombre TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_franquicia_pago_regalias ON contrato_franquicia_detalles(fecha_proximo_pago_regalias);
CREATE INDEX idx_franquicia_apertura ON contrato_franquicia_detalles(fecha_limite_apertura);
CREATE INDEX idx_franquicia_auditoria ON contrato_franquicia_detalles(fecha_proxima_auditoria);

-- ---------------------------------------------------------------------------
-- Versionamiento de documentos: cada fila de contrato_documentos sigue siendo un
-- archivo físico, pero ahora las versiones del "mismo" documento (p.ej. varias
-- versiones firmadas de un mismo anexo) comparten grupo_id. es_version_actual = true
-- marca cuál es la vigente dentro de su grupo (así el expediente puede listar solo las
-- vigentes por default y expandir el historial completo por grupo_id bajo demanda).
-- reemplaza_a_id apunta a la versión anterior del mismo grupo (o NULL si es la v1).
-- origen distingue los documentos generados automáticamente desde una plantilla
-- (ver plantillas_tipo_contrato más abajo) de los subidos a mano.
-- ---------------------------------------------------------------------------

ALTER TABLE contrato_documentos ADD COLUMN grupo_id UUID;
UPDATE contrato_documentos SET grupo_id = id WHERE grupo_id IS NULL;
ALTER TABLE contrato_documentos ALTER COLUMN grupo_id SET NOT NULL;

ALTER TABLE contrato_documentos ADD COLUMN reemplaza_a_id UUID REFERENCES contrato_documentos(id);
ALTER TABLE contrato_documentos ADD COLUMN es_version_actual BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE contrato_documentos ADD COLUMN origen TEXT NOT NULL DEFAULT 'manual'; -- 'manual' | 'plantilla'

CREATE INDEX idx_documentos_grupo ON contrato_documentos(grupo_id);
CREATE INDEX idx_documentos_contrato_actual ON contrato_documentos(contrato_id, es_version_actual);

-- ---------------------------------------------------------------------------
-- Plantillas por tipo de contrato: un archivo Word (.docx) con marcadores {{llave}}
-- (ej. {{contraparteNombre}}, {{monto}}, y para franquicias {{regaliasPorcentaje}}, etc.)
-- que el backend puebla con los datos capturados del contrato (ver
-- src/utils/plantillas.js) para generar automáticamente un documento y agregarlo
-- al expediente como nueva versión (origen = 'plantilla'). Una plantilla por tipo
-- de contrato; volver a subir reemplaza la anterior.
-- ---------------------------------------------------------------------------

CREATE TABLE plantillas_tipo_contrato (
  tipo_contrato_id UUID PRIMARY KEY REFERENCES tipos_contrato(id) ON DELETE CASCADE,
  nombre_archivo TEXT NOT NULL,
  ruta_archivo TEXT NOT NULL,
  subido_por_id UUID NOT NULL REFERENCES usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Módulo de franquicias: los contratos de franquicia (uno por club) se administran
-- en su propio módulo (dashboard, listado y alta separados de "Contratos" general),
-- visible solo para super_admin/admin/juridico. `clubes` es el catálogo de sucursales;
-- cada contrato de franquicia se liga a exactamente un club vía
-- contrato_franquicia_detalles.club_id (nullable a nivel de BD para no romper filas
-- existentes creadas antes de este catálogo; el formulario de alta del módulo lo exige).
-- ---------------------------------------------------------------------------

CREATE TABLE clubes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT UNIQUE NOT NULL,
  direccion TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE contrato_franquicia_detalles ADD COLUMN club_id UUID REFERENCES clubes(id);
CREATE INDEX idx_franquicia_club ON contrato_franquicia_detalles(club_id);
