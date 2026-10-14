// Reporte mensual de vencimientos de Arrendamientos para Jurídico y Cabeza de Jurídico.
//
// Es el equivalente por correo del dashboard de Arrendamientos ("Próximos vencimientos"), con
// semáforo según los días que faltan para el vencimiento del lease (expiration_date):
//   - ROJO:     90 días o menos (incluye leases activos cuya fecha de vencimiento ya pasó).
//   - AMARILLO: de 91 a 180 días.
//   - Verde:    más de 180 días (dentro de los próximos 12 meses); solo se cuenta, no se lista.
//
// Se envía una vez por mes (la bitácora reportes_mensuales_log evita duplicados), con copia permanente a
// Jair, Alejandro y David (COPIA_FIJA; REPORTE_ARR_COPIA suma mas). Lo dispara el programador interno
// (src/jobs/scheduler.js) el día 1 de cada mes a las 07:00 (hora de CDMX) y también al arrancar el
// servidor si el reporte del mes aún no se ha enviado: así, tras el primer despliegue sale de
// inmediato, y si Render estaba dormido el día 1, sale en cuanto despierta.

const { query } = require('../db');
const { enviarCorreo } = require('../email');

const TIPO_REPORTE = 'arrendamientos_vencimientos';
const DIAS_ROJO = Number(process.env.REPORTE_ARR_DIAS_ROJO || 90);
const DIAS_AMARILLO = Number(process.env.REPORTE_ARR_DIAS_AMARILLO || 180);
const URL_DASHBOARD = process.env.FRONTEND_URL
  ? `${process.env.FRONTEND_URL.replace(/\/$/, '')}/#/arrendamientos`
  : 'https://contratos.fpt.com.mx/#/arrendamientos';

// Copia permanente del reporte: siempre se incluyen estos correos. REPORTE_ARR_COPIA permite
// sumar mas (separados por comas) sin tocar el codigo.
const COPIA_FIJA = ['jair@fpt.com.mx', 'alejandro@fpt.com.mx', 'david@fpt.com.mx'];
const COPIA_A = [
  ...COPIA_FIJA,
  ...(process.env.REPORTE_ARR_COPIA || '').split(',').map((c) => c.trim()).filter(Boolean),
];

const COLOR = {
  rojo: { fondo: '#fde8e8', texto: '#9b1c1c', borde: '#f5b5b5', etiqueta: 'ROJO' },
  amarillo: { fondo: '#fff6d6', texto: '#8a6100', borde: '#f1de8f', etiqueta: 'AMARILLO' },
};

let tablaLista = false;
async function asegurarTabla() {
  if (tablaLista) return;
  await query(
    `CREATE TABLE IF NOT EXISTS reportes_mensuales_log (
       tipo TEXT NOT NULL,
       periodo TEXT NOT NULL,
       enviado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
       destinatarios INTEGER,
       PRIMARY KEY (tipo, periodo)
     )`
  );
  tablaLista = true;
}

function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fechaTexto(f) {
  if (!f) return '—';
  const s = f instanceof Date ? f.toISOString().slice(0, 10) : String(f).slice(0, 10);
  const [y, m, d] = s.split('-');
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${Number(d)} ${meses[Number(m) - 1]} ${y}`;
}

/** Clasifica filas {location_nombre, expiration_date, renewal_notice_deadline, dias_restantes}. */
function clasificar(filas) {
  const rojos = [];
  const amarillos = [];
  let verdes = 0;
  for (const f of filas) {
    const dias = Number(f.dias_restantes);
    if (dias <= DIAS_ROJO) rojos.push({ ...f, dias });
    else if (dias <= DIAS_AMARILLO) amarillos.push({ ...f, dias });
    else verdes += 1;
  }
  return { rojos, amarillos, verdes };
}

function tablaSemaforo(titulo, color, filas, hoyTexto) {
  const c = COLOR[color];
  if (filas.length === 0) {
    return `<p style="margin:18px 0 4px"><b>${titulo}</b></p><p style="color:#555;margin:0">Sin leases en esta categoría.</p>`;
  }
  const renglones = filas
    .map((f) => {
      const vencido = f.dias < 0;
      const diasTxt = vencido ? `Vencido hace ${Math.abs(f.dias)} d` : `${f.dias} d`;
      const aviso = f.renewal_notice_deadline;
      const avisoPasado = aviso && String(aviso).slice(0, 10) < hoyTexto;
      const avisoTxt = aviso ? `${fechaTexto(aviso)}${avisoPasado ? ' (ya pasó)' : ''}` : '—';
      return `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid ${c.borde}">${esc(f.location_nombre)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid ${c.borde};white-space:nowrap">${fechaTexto(f.expiration_date)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid ${c.borde};white-space:nowrap"><b>${diasTxt}</b></td>
        <td style="padding:6px 10px;border-bottom:1px solid ${c.borde};white-space:nowrap">${avisoTxt}</td>
      </tr>`;
    })
    .join('');
  return `<p style="margin:18px 0 6px"><span style="background:${c.fondo};color:${c.texto};border:1px solid ${c.borde};border-radius:10px;padding:2px 10px;font-weight:bold">${c.etiqueta}</span> <b>${titulo}</b></p>
  <table style="border-collapse:collapse;width:100%;font-size:13px;background:${c.fondo}">
    <thead><tr style="text-align:left;color:${c.texto}">
      <th style="padding:6px 10px">Ubicación</th><th style="padding:6px 10px">Vence</th>
      <th style="padding:6px 10px">Faltan</th><th style="padding:6px 10px">Aviso de renovación</th>
    </tr></thead>
    <tbody>${renglones}</tbody>
  </table>`;
}

/** Arma asunto y HTML del reporte (función pura: se puede probar sin base de datos). */
function construirReporte(filas, { hoy = new Date() } = {}) {
  const { rojos, amarillos, verdes } = clasificar(filas);
  const hoyTexto = hoy.toISOString().slice(0, 10);
  const mesNombre = hoy.toLocaleDateString('es-MX', { month: 'long', year: 'numeric', timeZone: 'America/Mexico_City' });
  const asunto = `[Arrendamientos] Reporte mensual de vencimientos — ${mesNombre}` +
    (rojos.length ? ` (${rojos.length} en rojo)` : '');

  const html = `
  <p>Reporte mensual de vencimientos de <b>Arrendamientos</b> (${esc(mesNombre)}).</p>
  <p style="margin:0">
    <b style="color:${COLOR.rojo.texto}">${rojos.length}</b> en rojo (${DIAS_ROJO} días o menos) ·
    <b style="color:${COLOR.amarillo.texto}">${amarillos.length}</b> en amarillo (de ${DIAS_ROJO + 1} a ${DIAS_AMARILLO} días) ·
    <b style="color:#1d7a46">${verdes}</b> en verde (más de ${DIAS_AMARILLO} días, dentro de los próximos 12 meses)
  </p>
  ${tablaSemaforo(`Atención: vencen en ${DIAS_ROJO} días o menos`, 'rojo', rojos, hoyTexto)}
  ${tablaSemaforo(`Precaución: vencen en ${DIAS_ROJO + 1} a ${DIAS_AMARILLO} días`, 'amarillo', amarillos, hoyTexto)}
  <p style="margin-top:20px">Consulta el detalle y los expedientes en el
    <a href="${URL_DASHBOARD}">dashboard de Arrendamientos</a>.</p>
  <p style="color:#777;font-size:12px">Este reporte se genera automáticamente el primer día de cada mes.
  Los leases ya vencidos que siguen activos aparecen en rojo.</p>`;
  return { asunto, html, conteo: { rojos: rojos.length, amarillos: amarillos.length, verdes } };
}

async function obtenerFilas() {
  const { rows } = await query(
    `SELECT l.nombre AS location_nombre, le.expiration_date, le.renewal_notice_deadline,
            (le.expiration_date - CURRENT_DATE) AS dias_restantes
     FROM leases le
     JOIN locations l ON l.id = le.location_id
     WHERE le.estatus = 'activo' AND le.expiration_date IS NOT NULL
       AND le.expiration_date <= CURRENT_DATE + INTERVAL '365 days'
     ORDER BY le.expiration_date ASC, l.nombre ASC`
  );
  return rows;
}

async function obtenerDestinatarios() {
  const { rows } = await query(
    `SELECT email FROM usuarios WHERE activo = true AND rol IN ('juridico', 'cabeza_juridico')`
  );
  return rows.map((r) => r.email).filter(Boolean);
}

function periodoActual() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }).slice(0, 7); // YYYY-MM
}

/**
 * Envía el reporte del mes si todavía no se ha enviado.
 * @param {{forzar?: boolean, soloA?: string}} opciones - forzar: reenvía aunque ya se haya enviado;
 *   soloA: correo de prueba (no registra el envío ni toca a Jurídico).
 */
async function enviarReporteMensualArrendamientos({ forzar = false, soloA = null } = {}) {
  await asegurarTabla();
  const periodo = periodoActual();

  if (!soloA && !forzar) {
    const { rows } = await query('SELECT 1 FROM reportes_mensuales_log WHERE tipo = $1 AND periodo = $2', [TIPO_REPORTE, periodo]);
    if (rows.length > 0) return { enviado: false, motivo: 'ya_enviado', periodo };
  }

  const destinatarios = soloA
    ? [soloA]
    : [...new Set([...(await obtenerDestinatarios()), ...COPIA_A].map((e) => e.toLowerCase()))];
  if (destinatarios.length === 0) return { enviado: false, motivo: 'sin_destinatarios', periodo };

  const filas = await obtenerFilas();
  const { asunto, html, conteo } = construirReporte(filas);
  const resultado = await enviarCorreo(destinatarios.join(','), soloA ? `[PRUEBA] ${asunto}` : asunto, html);

  // En modo dev (sin Graph) enviarCorreo no manda nada; tampoco lo registramos como enviado.
  if (!soloA && resultado?.enviado !== false) {
    await query(
      `INSERT INTO reportes_mensuales_log (tipo, periodo, destinatarios) VALUES ($1,$2,$3)
       ON CONFLICT (tipo, periodo) DO UPDATE SET enviado_en = now(), destinatarios = EXCLUDED.destinatarios`,
      [TIPO_REPORTE, periodo, destinatarios.length]
    );
  }
  return { enviado: resultado?.enviado !== false, periodo, destinatarios: destinatarios.length, conteo, modo: resultado?.modo };
}

module.exports = { enviarReporteMensualArrendamientos, construirReporte, clasificar };
