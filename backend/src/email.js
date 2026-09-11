// Notificaciones por correo vía Microsoft Graph API (client credentials flow), mismo patrón
// usado en el sistema de inventario de FPT.
//
// Si MS_GRAPH_CLIENT_ID / MS_GRAPH_CLIENT_SECRET / MS_GRAPH_TENANT_ID / MS_GRAPH_SENDER_EMAIL
// no están configuradas, opera en "modo dev": solo hace console.log del correo que se
// enviaría, sin tronar el proceso. enviarCorreo() nunca debe lanzar de forma que tumbe al
// servidor: quien la invoque debe además envolverla en try/catch (ya se hace en las rutas
// vía asyncHandler + try/catch puntual donde aplica).

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const LOGIN_BASE = 'https://login.microsoftonline.com';

// Logo ya hospedado (mismo que usa la firma corporativa de Exchange), así que no depende de
// que el dominio de GitHub Pages/dominio propio esté disponible para que el logo cargue en
// el cliente de correo.
const LOGO_URL = 'https://fpt.com.mx/PF.png';

// Paleta morada de marca (frontend/src/styles/theme.css) reutilizada aquí para que los
// correos automáticos tengan el mismo "look and feel" que el resto de la plataforma.
const COLOR_MORADO_PRIMARIO = '#592c82';
const COLOR_MORADO_OSCURO = '#2a0f42';
const COLOR_MORADO_TEXTO_FOOTER = '#772583';
const COLOR_MORADO_FONDO_CLARO = '#f6f2fa';

/**
 * Envuelve el HTML de un correo (el contenido específico de cada aviso, típicamente unos
 * cuantos <p>) en la plantilla de marca de FPT: layout de tablas + estilos inline, para que
 * se vea consistente en Outlook/Exchange (el cliente principal en la organización) y en el
 * resto de clientes de correo. El logo va sobre una tarjeta blanca porque el PNG del logo
 * tiene fondo transparente y se pierde sobre el header morado.
 *
 * @param {string} cuerpoHtml - HTML del contenido específico del aviso (ya viene con <p>, etc.)
 */
function envolverPlantilla(cuerpoHtml) {
  return `<!DOCTYPE html>
<html lang="es">
  <body style="margin:0; padding:0; background:${COLOR_MORADO_FONDO_CLARO};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR_MORADO_FONDO_CLARO}; padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px; background:#ffffff; border-radius:10px; overflow:hidden; font-family:'Segoe UI', Arial, sans-serif;">
            <tr>
              <td align="center" style="background:${COLOR_MORADO_PRIMARIO}; padding:28px 24px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff; border-radius:8px;">
                  <tr>
                    <td style="padding:14px 22px;">
                      <img src="${LOGO_URL}" width="150" alt="Fitness Para Todos" style="display:block; border:0; max-width:150px; height:auto;" />
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 28px; color:${COLOR_MORADO_OSCURO}; font-family:'Segoe UI', Arial, sans-serif; font-size:14px; line-height:1.6;">
                ${cuerpoHtml}
              </td>
            </tr>
            <tr>
              <td align="center" style="background:${COLOR_MORADO_FONDO_CLARO}; padding:16px 24px; color:${COLOR_MORADO_TEXTO_FOOTER}; font-family:'Segoe UI', Arial, sans-serif; font-size:12px; line-height:1.5;">
                FPT Contratos &middot; Fitness Para Todos<br/>
                Este es un correo automático, por favor no respondas a este mensaje.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function graphConfigurado() {
  return Boolean(
    process.env.MS_GRAPH_CLIENT_ID &&
      process.env.MS_GRAPH_CLIENT_SECRET &&
      process.env.MS_GRAPH_TENANT_ID &&
      process.env.MS_GRAPH_SENDER_EMAIL
  );
}

let tokenCache = { accessToken: null, expiresAt: 0 };

async function obtenerTokenGraph() {
  const ahora = Date.now();
  if (tokenCache.accessToken && tokenCache.expiresAt > ahora + 30_000) {
    return tokenCache.accessToken;
  }

  const tenantId = process.env.MS_GRAPH_TENANT_ID;
  const url = `${LOGIN_BASE}/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: process.env.MS_GRAPH_CLIENT_ID,
    client_secret: process.env.MS_GRAPH_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!resp.ok) {
    const texto = await resp.text().catch(() => '');
    throw new Error(`No se pudo obtener token de Microsoft Graph (${resp.status}): ${texto}`);
  }

  const data = await resp.json();
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
  return tokenCache.accessToken;
}

/**
 * Envía un correo HTML vía Microsoft Graph (sendMail del buzón remitente configurado).
 * En modo dev (variables MS_GRAPH_* no configuradas) solo hace console.log y resuelve.
 * Nunca lanza una excepción que deba tumbar el proceso que la llama si se usa dentro de un
 * try/catch (recomendado en cada callsite además del try/catch interno de este módulo).
 *
 * @param {string} destinatario - email del destinatario (o "a@b.com,c@d.com" para varios)
 * @param {string} asunto
 * @param {string} cuerpoHtml
 */
async function enviarCorreo(destinatario, asunto, cuerpoHtml) {
  const destinatarios = String(destinatario || '')
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);

  if (destinatarios.length === 0) {
    console.warn('[email] enviarCorreo() llamado sin destinatarios válidos, se omite.');
    return { enviado: false, motivo: 'sin_destinatarios' };
  }

  if (!graphConfigurado()) {
    console.log('--- [email] MODO DEV: correo NO enviado (faltan variables MS_GRAPH_*) ---');
    console.log(`Para: ${destinatarios.join(', ')}`);
    console.log(`Asunto: ${asunto}`);
    console.log(`Cuerpo: ${cuerpoHtml}`);
    console.log('---------------------------------------------------------------------');
    return { enviado: false, modo: 'dev' };
  }

  try {
    const token = await obtenerTokenGraph();
    const remitente = process.env.MS_GRAPH_SENDER_EMAIL;
    const url = `${GRAPH_BASE}/users/${encodeURIComponent(remitente)}/sendMail`;

    const payload = {
      message: {
        subject: asunto,
        // Cada llamador solo arma el contenido específico del aviso (unos <p>); la plantilla
        // de marca (logo, colores, footer) se aplica aquí una sola vez para todos los correos.
        body: { contentType: 'HTML', content: envolverPlantilla(cuerpoHtml) },
        toRecipients: destinatarios.map((email) => ({ emailAddress: { address: email } })),
      },
      saveToSentItems: true,
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const texto = await resp.text().catch(() => '');
      throw new Error(`Graph sendMail falló (${resp.status}): ${texto}`);
    }

    return { enviado: true };
  } catch (err) {
    // Crítico: un fallo de correo jamás debe tumbar el flujo de negocio que lo dispara.
    console.error('[email] Error al enviar correo vía Microsoft Graph:', err.message);
    return { enviado: false, error: err.message };
  }
}

module.exports = { enviarCorreo, graphConfigurado, envolverPlantilla };
