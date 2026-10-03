-- ---------------------------------------------------------------------------
-- Destinatarios configurables de las alertas automáticas de Franquicias
-- (pago de regalías, fecha límite de apertura, auditoría, vencimiento).
--
-- Hasta ahora los avisos de src/utils/franquicias.js solo llegaban al
-- solicitante del contrato y a los correos fijos de obtenerCorreosJuridicoAdmin()
-- (jurídico/admin/super_admin, hardcoded). Esta tabla permite que alguien del
-- panel de administración agregue/quite destinatarios adicionales por tipo de
-- evento (o "todos" los tipos), sin tocar código.
--
-- Se corre UNA vez, después de que prisma/migration.sql ya esté aplicado
-- (reusa la tabla `usuarios`). Seguro de correr más de una vez sobre una base
-- ya migrada: el CREATE TABLE truena si la tabla ya existe y el script avisa
-- sin revertir nada.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid() (ya debería existir; IF NOT EXISTS por seguridad)

CREATE TABLE franquicia_alerta_destinatarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 'todos' recibe cualquier tipo de aviso de franquicia; los demás valores
  -- limitan el destinatario a ese tipo de evento únicamente.
  tipo_evento TEXT NOT NULL CHECK (tipo_evento IN ('pago_regalias', 'apertura', 'auditoria', 'vencimiento', 'todos')),
  email TEXT NOT NULL,
  nombre TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,

  creado_por_id UUID REFERENCES usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_franquicia_alerta_destinatarios_tipo ON franquicia_alerta_destinatarios(tipo_evento) WHERE activo = true;
