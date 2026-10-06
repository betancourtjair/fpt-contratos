-- Modulo "Operaciones" (oct 2026): solicitudes de Operaciones hacia Juridico.
--   Atencion a Socios:      baja extraordinaria de socio, baja extraordinaria de invitado.
--   Atencion a Autoridades: citatorios PROFECO, solicitudes de Fiscalias / Ministerios Publicos.
-- El rol nuevo 'operaciones' (ALTER TYPE rol_usuario) lo agrega migrate_operaciones.js por
-- separado: ALTER TYPE ... ADD VALUE no puede compartir transaccion con codigo que use el valor.

CREATE TABLE IF NOT EXISTS operaciones_solicitudes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio TEXT NOT NULL UNIQUE,
  categoria TEXT NOT NULL CHECK (categoria IN ('socios', 'autoridades')),
  tipo TEXT NOT NULL CHECK (tipo IN ('baja_socio', 'baja_invitado', 'citatorio_profeco', 'solicitud_fiscalia')),
  club_id UUID NOT NULL REFERENCES clubes(id),
  gerente_nombre TEXT NOT NULL,
  -- Campos propios de cada formulario (nombre del socio, hechos, fecha de recepcion, etc.).
  datos JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Casillas de validacion marcadas (solo aplica a las bajas de socios).
  validaciones JSONB NOT NULL DEFAULT '{}'::jsonb,
  estatus TEXT NOT NULL DEFAULT 'recibida' CHECK (estatus IN ('recibida', 'en_proceso', 'atendida')),
  respuesta_juridico TEXT,
  atendido_por_id UUID REFERENCES usuarios(id),
  atendido_en TIMESTAMPTZ,
  solicitante_id UUID NOT NULL REFERENCES usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operaciones_solicitudes_estatus ON operaciones_solicitudes(estatus);
CREATE INDEX IF NOT EXISTS idx_operaciones_solicitudes_tipo ON operaciones_solicitudes(tipo);
CREATE INDEX IF NOT EXISTS idx_operaciones_solicitudes_solicitante ON operaciones_solicitudes(solicitante_id);

CREATE TABLE IF NOT EXISTS operaciones_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id UUID NOT NULL REFERENCES operaciones_solicitudes(id) ON DELETE CASCADE,
  -- 'evidencia' (bajas), 'citatorio' (PROFECO) u 'oficio' (Fiscalias).
  campo TEXT NOT NULL,
  nombre_archivo TEXT NOT NULL,
  ruta_archivo TEXT NOT NULL,
  subido_por_id UUID NOT NULL REFERENCES usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operaciones_documentos_solicitud ON operaciones_documentos(solicitud_id);
