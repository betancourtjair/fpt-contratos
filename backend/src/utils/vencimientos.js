// Tarea de vencimientos: no es un cron real dentro del proceso, sino una función que se
// dispara manualmente vía POST /api/jobs/revisar-vencimientos (pensado para ser llamado por
// un cron externo, ej. un Cron Job de Render).
//
// Marca:
//   - 'activo' o 'por_vencer' con fecha_fin ya pasada -> 'vencido'
//   - 'activo' cuya fecha_fin cae dentro de su dias_aviso_vencimiento -> 'por_vencer'
// y envía correo de aviso al solicitante y a juridico/admin en cada transición.

const { query, withTransaction } = require('../db');
const { registrarAuditoria } = require('./audit');
const { enviarCorreo } = require('../email');

async function obtenerCorreosJuridicoAdmin(client) {
  const { rows } = await client.query(
    `SELECT email FROM usuarios WHERE rol IN ('juridico', 'admin', 'super_admin') AND activo = true`
  );
  return rows.map((r) => r.email);
}

async function revisarVencimientos() {
  const resumen = { marcadosVencido: [], marcadosPorVencer: [] };

  await withTransaction(async (client) => {
    const correosLegalAdmin = await obtenerCorreosJuridicoAdmin(client);

    // 1) Vencidos: fecha_fin ya pasó y siguen como activo/por_vencer.
    const { rows: vencidos } = await client.query(
      `UPDATE contratos
       SET estatus = 'vencido', updated_at = now()
       WHERE estatus IN ('activo', 'por_vencer') AND fecha_fin IS NOT NULL AND fecha_fin < CURRENT_DATE
       RETURNING *`
    );
    for (const contrato of vencidos) {
      await registrarAuditoria({
        contratoId: contrato.id,
        accion: 'contrato_vencido',
        detalle: `Marcado automáticamente como vencido (fecha_fin: ${contrato.fecha_fin}).`,
        db: client,
      });
      resumen.marcadosVencido.push({ id: contrato.id, folio: contrato.folio });
    }

    // 2) Por vencer: activos cuya fecha_fin cae dentro de su ventana de aviso.
    const { rows: porVencer } = await client.query(
      `UPDATE contratos
       SET estatus = 'por_vencer', updated_at = now()
       WHERE estatus = 'activo' AND fecha_fin IS NOT NULL
         AND fecha_fin >= CURRENT_DATE
         AND fecha_fin <= (CURRENT_DATE + (dias_aviso_vencimiento || ' days')::interval)
       RETURNING *`
    );
    for (const contrato of porVencer) {
      await registrarAuditoria({
        contratoId: contrato.id,
        accion: 'contrato_por_vencer',
        detalle: `Marcado automáticamente como por_vencer (fecha_fin: ${contrato.fecha_fin}, aviso: ${contrato.dias_aviso_vencimiento} días).`,
        db: client,
      });
      resumen.marcadosPorVencer.push({ id: contrato.id, folio: contrato.folio });
    }

    resumen._correosLegalAdmin = correosLegalAdmin;
    resumen._contratosVencidos = vencidos;
    resumen._contratosPorVencer = porVencer;
  });

  // Notificaciones fuera de la transacción.
  const correosLegalAdmin = resumen._correosLegalAdmin || [];
  const todos = [
    ...resumen._contratosVencidos.map((c) => ({ contrato: c, tipo: 'vencido' })),
    ...resumen._contratosPorVencer.map((c) => ({ contrato: c, tipo: 'por_vencer' })),
  ];

  for (const { contrato, tipo } of todos) {
    try {
      const { rows } = await query('SELECT email FROM usuarios WHERE id = $1', [contrato.solicitado_por_id]);
      const solicitanteEmail = rows[0]?.email;
      const destinatarios = [solicitanteEmail, ...correosLegalAdmin].filter(Boolean);
      if (destinatarios.length === 0) continue;

      const fechaFinTexto =
        contrato.fecha_fin instanceof Date
          ? contrato.fecha_fin.toISOString().slice(0, 10)
          : String(contrato.fecha_fin);

      const asunto =
        tipo === 'vencido'
          ? `Contrato ${contrato.folio} VENCIDO`
          : `Contrato ${contrato.folio} próximo a vencer`;
      const cuerpo =
        tipo === 'vencido'
          ? `<p>El contrato <b>${contrato.folio} - ${contrato.titulo}</b> venció el ${fechaFinTexto}.</p>`
          : `<p>El contrato <b>${contrato.folio} - ${contrato.titulo}</b> vence el ${fechaFinTexto} (dentro de su ventana de aviso de ${contrato.dias_aviso_vencimiento} días).</p>`;

      await enviarCorreo(destinatarios.join(','), asunto, cuerpo);
    } catch (err) {
      console.error(`Error notificando vencimiento del contrato ${contrato.folio}:`, err);
    }
  }

  delete resumen._correosLegalAdmin;
  delete resumen._contratosVencidos;
  delete resumen._contratosPorVencer;
  return resumen;
}

module.exports = { revisarVencimientos };
