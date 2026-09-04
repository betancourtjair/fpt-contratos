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
