-- ---------------------------------------------------------------------------
-- Columna explícita "¿el club ya abrió?" en contrato_franquicia_detalles.
--
-- Hasta ahora el dashboard de Franquicias inferÍa esto de fecha_proximo_pago_regalias (ver
-- CASE_CATEGORIA_APERTURA en backend/src/routes/franquicias.js), pero ese campo es para el
-- calendario de cobro de regalías hacia adelante, y nunca se llenó para los Franchise
-- Agreement históricos que se cargaron en bloque (llevan años operando, pero no se les
-- capturó una fecha de "próximo pago"). Eso hacía que 42 de 51 clubes aparecieran como
-- "Falta de abrir" cuando en realidad ya estaban operando desde hace tiempo.
--
-- DEFAULT true a propósito: la enorme mayoría de los contratos de franquicia que existen hoy
-- en la base son clubes históricos que ya operan. Solo los puñados de clubes genuinamente
-- nuevos (que todavía no abren) necesitan marcarse en false explícitamente -- ver
-- backend/prisma/marcar_clubes_no_abiertos.js para el ajuste puntual de los que sí aplica.
--
-- Se corre UNA vez. Seguro de correr más de una vez: ALTER TABLE ... ADD COLUMN truena si la
-- columna ya existe, y en ese caso el script runner avisa sin revertir nada.
-- ---------------------------------------------------------------------------

ALTER TABLE contrato_franquicia_detalles ADD COLUMN club_abierto BOOLEAN NOT NULL DEFAULT true;

-- Fecha (real o, mientras se confirma, tentativa) en que el club abrió sus puertas. Se muestra
-- y edita desde el expediente del contrato (pestaña de datos de franquicia). Para el histórico
-- cargado en bloque se llena de forma tentativa (ver marcar_clubes_no_abiertos.js) con
-- fecha_limite_apertura menos 7 días, y Jair la irá corrigiendo club por club con la fecha real.
ALTER TABLE contrato_franquicia_detalles ADD COLUMN fecha_apertura DATE;
