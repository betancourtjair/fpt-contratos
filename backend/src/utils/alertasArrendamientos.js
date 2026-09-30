// Alertas automáticas de fechas críticas de leases del módulo de Arrendamientos (equivalente
// a los avisos de Leasecake). Se ejecuta sola todos los días vía el programador interno (ver
// src/jobs/scheduler.js) y también puede dispararse a mano vía POST /api/jobs/revisar-alertas-arrendamientos.
//
// Revisa tres hitos por lease activo:
//   - renewal_notice_deadline (ventana: ALERTA_RENEWAL_DIAS)
//   - coi_expiration_date (ventana: ALERTA_COI_DIAS)
//   - expiration_date (ventana: ALERTA_EXPIRACION_DIAS)
// y evita reenviar el mismo aviso todos los días guardando una fila en lease_alerts_log por
// (lease_id, tipo, fecha_evento) — solo se envía la primera vez que ese hito entra en su ventana.

const { query, withTransaction } = require('../db');
const { enviarCorreo } = require('../email');
const { obtenerCorreosNivelAdmin, formatFecha } = require('./notificaciones');

const ALERTA_RENEWAL_DIAS = Number(process.env.ALERTA_RENEWAL_DIAS || 60);
const ALERTA_COI_DIAS = Number(process.env.ALERTA_COI_DIAS || 30);
const ALERTA_EXPIRACION_DIAS = Number(process.env.ALERTA_EXPIRACION_DIAS || 180);

const DEFINICIONES = [
  {
    tipo: 'renewal_notice',
    columnaFecha: 'renewal_notice_deadline',
    dias: ALERTA_RENEWAL_DIAS,
    asunto: (l) => `[Arrendamientos] Fecha límite de aviso de renovación próxima: ${l.location_nombre}`,
    cuerpo: (l, fechaTexto) =>
      `<p>El lease de <b>${l.location_nombre}</b> tiene su fecha límite de aviso de renovación el ${fechaTexto}.</p>`,
  },
  {
    tipo: 'coi_expiration',
    columnaFecha: 'coi_expiration_date',
    dias: ALERTA_COI_DIAS,
    asunto: (l) => `[Arrendamientos] Póliza de seguro (COI) próxima a vencer: ${l.location_nombre}`,
    cuerpo: (l, fechaTexto) =>
      `<p>La póliza de seguro (COI) del lease de <b>${l.location_nombre}</b> vence el ${fechaTexto}.</p>`,
  },
  {
    tipo: 'lease_expiration',
    columnaFecha: 'expiration_date',
    dias: ALERTA_EXPIRACION_DIAS,
    asunto: (l) => `[Arrendamientos] Lease próximo a vencer: ${l.location_nombre}`,
    cuerpo: (l, fechaTexto) =>
      `<p>El lease de <b>${l.location_nombre}</b> vence el ${fechaTexto}.</p>`,
  },
];

async function revisarAlertasArrendamientos() {
  const resumen = { avisosEnviados: 0, porTipo: {} };
  const correosAdmin = await obtenerCorreosNivelAdmin({ query });
  if (correosAdmin.length === 0) {
    console.log('[alertasArrendamientos] No hay correos admin activos; se omite el envío de avisos.');
  }

  for (const def of DEFINICIONES) {
    const { rows: candidatos } = await query(
      `SELECT le.id AS lease_id, le.${def.columnaFecha} AS fecha_evento, l.nombre AS location_nombre
       FROM leases le
       JOIN locations l ON l.id = le.location_id
       WHERE le.estatus = 'activo'
         AND le.${def.columnaFecha} IS NOT NULL
         AND le.${def.columnaFecha} BETWEEN CURRENT_DATE AND CURRENT_DATE + ($1 || ' days')::interval
         AND NOT EXISTS (
           SELECT 1 FROM lease_alerts_log al
           WHERE al.lease_id = le.id AND al.tipo = $2 AND al.fecha_evento = le.${def.columnaFecha}
         )`,
      [def.dias, def.tipo]
    );

    for (const lease of candidatos) {
      try {
        if (correosAdmin.length > 0) {
          const fechaTexto = formatFecha(lease.fecha_evento);
          await enviarCorreo(correosAdmin.join(','), def.asunto(lease), def.cuerpo(lease, fechaTexto));
        }
        await withTransaction((client) =>
          client.query(
            `INSERT INTO lease_alerts_log (lease_id, tipo, fecha_evento) VALUES ($1,$2,$3)
             ON CONFLICT (lease_id, tipo, fecha_evento) DO NOTHING`,
            [lease.lease_id, def.tipo, lease.fecha_evento]
          )
        );
        resumen.avisosEnviados += 1;
        resumen.porTipo[def.tipo] = (resumen.porTipo[def.tipo] || 0) + 1;
      } catch (err) {
        console.error(`[alertasArrendamientos] Error al procesar alerta "${def.tipo}" del lease ${lease.lease_id}:`, err);
      }
    }
  }

  return resumen;
}

module.exports = { revisarAlertasArrendamientos };
