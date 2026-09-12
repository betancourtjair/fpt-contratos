// Tarea de vencimientos. Se ejecuta sola todos los días vía el programador interno
// (ver src/jobs/scheduler.js) y también puede dispararse a mano vía
// POST /api/jobs/revisar-vencimientos (útil para pruebas o para forzar una revisión).
//
// Marca:
//   - 'activo' o 'por_vencer' con fecha_fin ya pasada -> 'vencido'
//   - 'activo' cuya fecha_fin cae dentro de su ventana de aviso -> 'por_vencer'
//     (la ventana es dias_aviso_renovacion cuando el contrato es de franquicia —
//     normalmente se necesita más anticipación para decidir una renovación de franquicia
//     que para un contrato genérico — y dias_aviso_vencimiento en cualquier otro caso)
// y envía correo de aviso al solicitante y a juridico/admin en cada transición.

const { query, withTransaction } = require('../db');
const { registrarAuditoria } = require('./audit');
const { enviarCorreo } = require('../email');
const { obtenerCorreosJuridicoAdmin, formatFecha } = require('./notificaciones');
const { sincronizarEstatusEnDocumentos } = require('./documentosMetadatos');

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

    // 2) Por vencer: activos cuya fecha_fin cae dentro de su ventana de aviso. Si el
    // contrato tiene fila en contrato_franquicia_detalles, esa ventana es dias_aviso_renovacion
    // (pensada para dar más tiempo de decidir una renovación de franquicia); si no, es la
    // dias_aviso_vencimiento genérica del contrato.
    const { rows: porVencer } = await client.query(
      `UPDATE contratos c
       SET estatus = 'por_vencer', updated_at = now()
       FROM (
         SELECT c2.id, fd.contrato_id IS NOT NULL AS es_franquicia
         FROM contratos c2
         LEFT JOIN contrato_franquicia_detalles fd ON fd.contrato_id = c2.id
         WHERE c2.estatus = 'activo' AND c2.fecha_fin IS NOT NULL
           AND c2.fecha_fin >= CURRENT_DATE
           AND c2.fecha_fin <= (CURRENT_DATE + (COALESCE(fd.dias_aviso_renovacion, c2.dias_aviso_vencimiento) || ' days')::interval)
       ) elegibles
       WHERE c.id = elegibles.id
       RETURNING c.*, elegibles.es_franquicia`
    );
    for (const contrato of porVencer) {
      await registrarAuditoria({
        contratoId: contrato.id,
        accion: 'contrato_por_vencer',
        detalle: contrato.es_franquicia
          ? `Marcado automáticamente como por_vencer: toca decidir la renovación de la franquicia (fecha_fin: ${contrato.fecha_fin}).`
          : `Marcado automáticamente como por_vencer (fecha_fin: ${contrato.fecha_fin}, aviso: ${contrato.dias_aviso_vencimiento} días).`,
        db: client,
      });
      resumen.marcadosPorVencer.push({ id: contrato.id, folio: contrato.folio, esFranquicia: contrato.es_franquicia });
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
    // Mantiene al día la columna "EstatusContrato" en SharePoint. Nunca debe tumbar el job.
    await sincronizarEstatusEnDocumentos(contrato.id, tipo);

    try {
      const { rows } = await query('SELECT email FROM usuarios WHERE id = $1', [contrato.solicitado_por_id]);
      const solicitanteEmail = rows[0]?.email;
      const destinatarios = [solicitanteEmail, ...correosLegalAdmin].filter(Boolean);
      if (destinatarios.length === 0) continue;

      const fechaFinTexto = formatFecha(contrato.fecha_fin);
      const esFranquicia = tipo === 'por_vencer' && contrato.es_franquicia;

      const asunto =
        tipo === 'vencido'
          ? `Contrato ${contrato.folio} VENCIDO`
          : esFranquicia
            ? `Contrato de franquicia ${contrato.folio}: toca decidir la renovación`
            : `Contrato ${contrato.folio} próximo a vencer`;
      const cuerpo =
        tipo === 'vencido'
          ? `<p>El contrato <b>${contrato.folio} - ${contrato.titulo}</b> venció el ${fechaFinTexto}.</p>`
          : esFranquicia
            ? `<p>El contrato de franquicia <b>${contrato.folio} - ${contrato.titulo}</b> vence el ${fechaFinTexto}. Es momento de decidir si se renueva, conforme a las condiciones de renovación pactadas.</p>`
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
