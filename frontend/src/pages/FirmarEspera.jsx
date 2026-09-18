import { useEffect, useMemo, useState } from 'react';

// Pagina publica (sin login) para "precalentar" el enlace de firma antes de mandar al
// firmante ahi: el plan gratuito de Render duerme la instancia de Documenso (self-hosted)
// tras ~15 min de inactividad, y el primer request tarda hasta un minuto en responder (cold
// start). En vez de que el firmante externo vea esa espera confusa directo en Documenso, esta
// pagina (hospedada en GitHub Pages, que no se duerme) hace ella misma esa espera con un
// mensaje claro, y solo entonces redirige al enlace real de firma. Se genera y comparte desde
// DocumentosContrato.jsx ("Copiar enlace pre-calentado").
export default function FirmarEspera() {
  const params = useMemo(() => new URLSearchParams(window.location.hash.split('?')[1] || ''), []);
  const url = params.get('url');
  const nombre = params.get('nombre');
  const [listo, setListo] = useState(false);

useEffect(() => {
  if (!url) return;
  let cancelado = false;
  // "no-cors" porque Documenso no necesariamente permite CORS desde este dominio; no se puede
          // leer la respuesta, pero esperar a que la promesa resuelva ya cumple su proposito: el
          // navegador espera a que el servicio responda (incluyendo el arranque en frio), igual que si
          // el firmante hubiera entrado directo.
          fetch(url, { mode: 'no-cors' })
  .catch(() => {})
  .finally(() => {
    if (!cancelado) setListo(true);
  });
  return () => {
    cancelado = true;
  };
}, [url]);

useEffect(() => {
  if (listo && url) window.location.href = url;
}, [listo, url]);

if (!url) {
  return (
    <div style={{ maxWidth: 420, margin: '80px auto', textAlign: 'center', padding: 24 }}>
      <p>Este enlace no es valido. Pide que te compartan de nuevo el enlace de firma.</p>
    </div>
    );
}
  
  return (
    <div style={{ maxWidth: 420, margin: '80px auto', textAlign: 'center', padding: 24 }}>
    <p>
      {nombre ? `Hola ${nombre}, e` : 'E'}stamos preparando tu documento para firmar. Esto puede
    tardar hasta un minuto...
    </p>
    <p style={{ fontSize: 13, marginTop: 16, color: '#666' }}>
    Si despues de un minuto no avanza, <a href={url}>haz clic aqui para continuar</a>.
    </p>
    </div>
    );
}
