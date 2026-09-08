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

const ZONA_HORARIA = 'America/Mexico_City';
const EXPRESION_DIARIA = '0 7 * * *'; // 07:00 todos los días
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

/** Arranca el programador. Llamar una sola vez, al iniciar el servidor real (no en tests). */
function iniciarProgramador() {
  setTimeout(() => {
    ejecutarRevisionSegura('arranque del servidor');
  }, RETRASO_INICIAL_MS);

  cron.schedule(EXPRESION_DIARIA, () => ejecutarRevisionSegura('cron diario 07:00'), {
    timezone: ZONA_HORARIA,
  });

  console.log(
    `[scheduler] Programador iniciado: revisión de vencimientos y de franquicias al arrancar y todos los días a las 07:00 (${ZONA_HORARIA}).`
  );
}

module.exports = { iniciarProgramador };
