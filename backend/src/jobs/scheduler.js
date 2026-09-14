// Programador interno de tareas periódicas del backend: revisión de vencimientos
// (src/utils/vencimientos.js) y de notificaciones de franquicia (src/utils/franquicias.js).
//
// Antes, esto solo corría si alguien llamaba a mano al endpoint
// POST /api/jobs/revisar-vencimientos (pensado para un cron externo que nunca se configuró).
// Ahora corre solo, desde dentro del propio proceso, de dos formas complementarias:
//
//   1) Al arrancar el servidor: por si el proceso estuvo dormido (plan gratuito de Render,
//      que apaga el servicio sin tráfico) y se despierta horas o días después de la última
//      revisión — así el primer usuario del día ya ve los estatus al corriente.
//   2) Todos los días a las 07:00 (hora de Ciudad de México): para el caso en que el
//      servicio se mantenga siempre encendido (plan pago) y nadie lo reinicie en días.
//
// El endpoint POST /api/jobs/revisar-vencimientos se conserva para poder dispararlo a mano
// (pruebas, o forzar una revisión inmediata) pero ya no es la única forma de que esto corra.

const cron = require('node-cron');
const { revisarVencimientos } = require('../utils/vencimientos');
const { revisarFranquicias } = require('../utils/franquicias');
const { revisarPendientes: revisarFirmasPendientes } = require('../utils/firmaElectronica');
const doc2sign = require('../doc2signClient');

const ZONA_HORARIA = 'America/Mexico_City';
const EXPRESION_DIARIA = '0 7 * * *'; // 07:00 todos los días
// Firma electrónica: revisión más seguida que la diaria porque el webhook de doc2sign (ver
// routes/doc2signWebhook.js) es el aviso "en vivo", pero esto es el respaldo por si algún aviso
// no llega o el webhook todavía no se configuró en doc2sign.
const EXPRESION_FIRMAS = '0 */2 * * *'; // cada 2 horas
const RETRASO_INICIAL_MS = 15 * 1000; // 15s tras arrancar, para no competir con el boot del server

let ejecutando = false;

async function ejecutarRevisionSegura(origen) {
  if (ejecutando) {
    console.log(`[scheduler] Revisión de vencimientos ya en curso, se omite el disparo desde "${origen}".`);
    return;
  }
  ejecutando = true;
  try {
    const resumen = await revisarVencimientos();
    const totalVencidos = resumen.marcadosVencido?.length || 0;
    const totalPorVencer = resumen.marcadosPorVencer?.length || 0;
    console.log(
      `[scheduler] Revisión de vencimientos (${origen}) completada: ` +
      `${totalVencidos} marcado(s) como vencido, ${totalPorVencer} marcado(s) como por vencer.`
    );
  } catch (err) {
    console.error(`[scheduler] Error al revisar vencimientos (${origen}):`, err);
  }

  try {
    const resumenFranquicias = await revisarFranquicias();
    console.log(
      `[scheduler] Revisión de franquicias (${origen}) completada: ` +
      `${resumenFranquicias.avisosPagoRegalias} aviso(s) de pago de regalías, ` +
      `${resumenFranquicias.avisosApertura} aviso(s) de apertura, ` +
      `${resumenFranquicias.avisosAuditoria} aviso(s) de auditoría, ` +
      `${resumenFranquicias.pagosAvanzados} pago(s) avanzado(s) a su siguiente periodo.`
    );
  } catch (err) {
    console.error(`[scheduler] Error al revisar franquicias (${origen}):`, err);
  } finally {
    ejecutando = false;
  }
}

let revisandoFirmas = false;
async function ejecutarRevisionFirmasSegura(origen) {
  if (!doc2sign.configurado()) return; // integración no configurada: no hay nada que revisar
  if (revisandoFirmas) {
    console.log(`[scheduler] Revisión de firmas pendientes ya en curso, se omite el disparo desde "${origen}".`);
    return;
  }
  revisandoFirmas = true;
  try {
    const resumen = await revisarFirmasPendientes();
    if (resumen.revisados > 0) {
      console.log(
        `[scheduler] Revisión de firmas pendientes (${origen}) completada: ${resumen.revisados} documento(s) revisado(s), ` +
        `${resumen.firmados} firmado(s), ${resumen.rechazados} rechazado(s).`
      );
    }
  } catch (err) {
    console.error(`[scheduler] Error al revisar firmas pendientes (${origen}):`, err);
  } finally {
    revisandoFirmas = false;
  }
}

/** Arranca el programador. Llamar una sola vez, al iniciar el servidor real (no en tests). */
function iniciarProgramador() {
  setTimeout(() => {
    ejecutarRevisionSegura('arranque del servidor');
    ejecutarRevisionFirmasSegura('arranque del servidor');
  }, RETRASO_INICIAL_MS);

  cron.schedule(EXPRESION_DIARIA, () => ejecutarRevisionSegura('cron diario 07:00'), {
    timezone: ZONA_HORARIA,
  });
  cron.schedule(EXPRESION_FIRMAS, () => ejecutarRevisionFirmasSegura('cron cada 2 horas'), {
    timezone: ZONA_HORARIA,
  });

  console.log(
    `[scheduler] Programador iniciado: revisión de vencimientos y de franquicias al arrancar y todos los días a las 07:00, ` +
    `y revisión de firmas pendientes (doc2sign) al arrancar y cada 2 horas (${ZONA_HORARIA}).`
  );
}

module.exports = { iniciarProgramador };
