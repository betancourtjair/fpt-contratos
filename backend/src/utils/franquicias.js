// Notificaciones automáticas específicas de contratos de franquicia. Se ejecuta sola desde
// el programador interno (ver src/jobs/scheduler.js), junto con revisarVencimientos().
//
// No cambia el estatus del contrato (eso lo sigue haciendo vencimientos.js) — solo dispara
// avisos por correo sobre tres eventos propios de una franquicia:
//   1) Próximo pago de regalías / fondo de mercadeo (recurrente, según periodicidad).
//   2) Fecha límite de apertura del punto (aviso único).
//   3) Próxima auditoría/inspección de cumplimiento (aviso único por fecha configurada).
//
// Cada aviso se manda una sola vez por ciclo gracias a las columnas *_avisado: se marcan en
// true al notificar, y se resetean a false cuando la fecha vuelve a moverse hacia el futuro
// (el pago avanza solo a su siguiente periodo; apertura/auditoría se resetean a mano al
// actualizar la fecha desde PUT /api/contratos/:id/franquicia).

const { query, withTransaction } = require('../db');
const { registrarAuditoria } = require('./audit');
const { enviarCorreo } = require('../email');
const { obtenerCorreosJuridicoAdmin, formatFecha } = require('./notificaciones');

const MESES_POR_PERIODICIDAD = { mensual: 1, trimestral: 3, semestral: 6, anual: 12 };

/** Avanza `fecha` en saltos de `periodicidad` hasta que quede en el futuro (>= hoy). */
function avanzarAlSiguientePeriodo(fecha, periodicidad) {
  const meses = MESES_POR_PERIODICIDAD[periodicidad] || 1;
  const hoy = new Date();
  hoy.setUTCHours(0, 0, 0, 0);
  const d = new Date(fecha);
  d.setUTCHours(0, 0, 0, 0);
  while (d < hoy) {
    d.setUTCMonth(d.getUTCMonth() + meses);
  }
  return d;
}

async function enviarAviso({ destinatarios, asunto, cuerpo }) {
  if (!destinatarios.length) return;
  try {
    await enviarCorreo(destinatarios.join(','), asunto, cuerpo);
  } catch (err) {
    console.error(`Error enviando aviso de franquicia ("${asunto}"):`, err);
  }
}

async function revisarFranquicias() {
  const resumen = { avisosPagoRegalias: [], avisosApertura: [], avisosAuditoria: [], pagosAvanzados: [] };
  let correosLegalAdmin = [];

  await withTransaction(async (client) => {
    correosLegalAdmin = await obtenerCorreosJuridicoAdmin(client);

    // 1a) Pagos de regalías próximos a avisar.
    const { rows: pagosPorAvisar } = await client.query(
      `SELECT fd.*, c.folio, c.titulo, c.solicitado_por_id
       FROM contrato_franquicia_detalles fd
       JOIN contratos c ON c.id = fd.contrato_id
       WHERE c.estatus IN ('activo', 'por_vencer')
         AND fd.fecha_proximo_pago_regalias IS NOT NULL
         AND fd.pago_regalias_avisado = false
         AND fd.fecha_proximo_pago_regalias <= (CURRENT_DATE + (fd.dias_aviso_pago_regalias || ' days')::interval)`
    );
    for (const fd of pagosPorAvisar) {
      await client.query(
        `UPDATE contrato_franquicia_detalles SET pago_regalias_avisado = true, updated_at = now() WHERE contrato_id = $1`,
        [fd.contrato_id]
      );
      await registrarAuditoria({
        contratoId: fd.contrato_id,
        accion: 'franquicia_aviso_pago_regalias',
        detalle: `Pago de regalías/mercadeo próximo (${formatFecha(fd.fecha_proximo_pago_regalias)}).`,
        db: client,
      });
      resumen.avisosPagoRegalias.push(fd);
    }

    // 1b) Pagos de regalías ya vencidos: avanzar al siguiente periodo y re-armar el aviso.
    const { rows: pagosVencidos } = await client.query(
      `SELECT * FROM contrato_franquicia_detalles
       WHERE fecha_proximo_pago_regalias IS NOT NULL AND fecha_proximo_pago_regalias < CURRENT_DATE`
    );
    for (const fd of pagosVencidos) {
      const siguiente = avanzarAlSiguientePeriodo(fd.fecha_proximo_pago_regalias, fd.periodicidad_pago_regalias);
      await client.query(
        `UPDATE contrato_franquicia_detalles
         SET fecha_proximo_pago_regalias = $1, pago_regalias_avisado = false, updated_at = now()
         WHERE contrato_id = $2`,
        [siguiente.toISOString().slice(0, 10), fd.contrato_id]
      );
      resumen.pagosAvanzados.push({ contratoId: fd.contrato_id, nuevaFecha: siguiente.toISOString().slice(0, 10) });
    }

    // 2) Fecha límite de apertura próxima (aviso único).
    const { rows: aperturaPorAvisar } = await client.query(
      `SELECT fd.*, c.folio, c.titulo, c.solicitado_por_id
       FROM contrato_franquicia_detalles fd
       JOIN contratos c ON c.id = fd.contrato_id
       WHERE c.estatus IN ('activo', 'por_vencer')
         AND fd.fecha_limite_apertura IS NOT NULL
         AND fd.apertura_avisada = false
         AND fd.fecha_limite_apertura <= (CURRENT_DATE + (fd.dias_aviso_apertura || ' days')::interval)`
    );
    for (const fd of aperturaPorAvisar) {
      await client.query(
        `UPDATE contrato_franquicia_detalles SET apertura_avisada = true, updated_at = now() WHERE contrato_id = $1`,
        [fd.contrato_id]
      );
      await registrarAuditoria({
        contratoId: fd.contrato_id,
        accion: 'franquicia_aviso_apertura',
        detalle: `Fecha límite de apertura próxima (${formatFecha(fd.fecha_limite_apertura)}).`,
        db: client,
      });
      resumen.avisosApertura.push(fd);
    }

    // 3) Próxima auditoría/inspección (aviso único por fecha configurada).
    const { rows: auditoriaPorAvisar } = await client.query(
      `SELECT fd.*, c.folio, c.titulo, c.solicitado_por_id
       FROM contrato_franquicia_detalles fd
       JOIN contratos c ON c.id = fd.contrato_id
       WHERE c.estatus IN ('activo', 'por_vencer')
         AND fd.fecha_proxima_auditoria IS NOT NULL
         AND fd.auditoria_avisada = false
         AND fd.fecha_proxima_auditoria <= (CURRENT_DATE + (fd.dias_aviso_auditoria || ' days')::interval)`
    );
    for (const fd of auditoriaPorAvisar) {
      await client.query(
        `UPDATE contrato_franquicia_detalles SET auditoria_avisada = true, updated_at = now() WHERE contrato_id = $1`,
        [fd.contrato_id]
      );
      await registrarAuditoria({
        contratoId: fd.contrato_id,
        accion: 'franquicia_aviso_auditoria',
        detalle: `Auditoría/inspección de cumplimiento próxima (${formatFecha(fd.fecha_proxima_auditoria)}).`,
        db: client,
      });
      resumen.avisosAuditoria.push(fd);
    }
  });

  // Correos, fuera de la transacción (igual que en vencimientos.js).
  async function destinatariosDe(fd) {
    const { rows } = await query('SELECT email FROM usuarios WHERE id = $1', [fd.solicitado_por_id]);
    return [rows[0]?.email, ...correosLegalAdmin].filter(Boolean);
  }

  for (const fd of resumen.avisosPagoRegalias) {
    await enviarAviso({
      destinatarios: await destinatariosDe(fd),
      asunto: `Contrato de franquicia ${fd.folio}: próximo pago de regalías`,
      cuerpo: `<p>El contrato de franquicia <b>${fd.folio} - ${fd.titulo}</b> tiene un pago de regalías${
        fd.fondo_mercadeo_porcentaje ? '/fondo de mercadeo' : ''
      } programado para el ${formatFecha(fd.fecha_proximo_pago_regalias)}.</p>`,
    });
  }
  for (const fd of resumen.avisosApertura) {
    await enviarAviso({
      destinatarios: await destinatariosDe(fd),
      asunto: `Contrato de franquicia ${fd.folio}: se acerca la fecha límite de apertura`,
      cuerpo: `<p>El contrato de franquicia <b>${fd.folio} - ${fd.titulo}</b> tiene como fecha límite de apertura del punto el ${formatFecha(fd.fecha_limite_apertura)}.</p>`,
    });
  }
  for (const fd of resumen.avisosAuditoria) {
    await enviarAviso({
      destinatarios: await destinatariosDe(fd),
      asunto: `Contrato de franquicia ${fd.folio}: próxima auditoría de cumplimiento`,
      cuerpo: `<p>El contrato de franquicia <b>${fd.folio} - ${fd.titulo}</b> tiene programada una auditoría/inspección de cumplimiento para el ${formatFecha(fd.fecha_proxima_auditoria)}.</p>`,
    });
  }

  return {
    avisosPagoRegalias: resumen.avisosPagoRegalias.length,
    avisosApertura: resumen.avisosApertura.length,
    avisosAuditoria: resumen.avisosAuditoria.length,
    pagosAvanzados: resumen.pagosAvanzados.length,
  };
}

module.exports = { revisarFranquicias, avanzarAlSiguientePeriodo };
