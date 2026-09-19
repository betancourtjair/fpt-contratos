import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { API_URL, getToken } from '../api.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

const ANCHO_RENDER = 640; // ancho fijo (CSS px) al que se dibuja la página; solo afecta nitidez.
const ALTO_MINIMO_PCT = 2.5; // recuadros más chicos que esto (arrastre accidental) se ignoran.
const ANCHO_MINIMO_PCT = 4;

// Paleta simple para distinguir el recuadro de cada firmante sobre el PDF.
const COLORES = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#be185d', '#4d7c0f'];

function colorFirmante(idx) {
  return COLORES[idx % COLORES.length];
}

function clamp(valor, min, max) {
  return Math.min(Math.max(valor, min), max);
}

/**
 * Editor visual para marcar, arrastrando un recuadro directamente sobre el PDF, dónde va la
 * firma de cada firmante. Sustituye el apilado automático (documensoClient.areaPorDefecto): el
 * usuario que manda el documento a firmar decide el lugar exacto de cada quien.
 *
 * `areas` y `onAreaChange` los maneja el componente padre (EnviarAFirmarModal), como el resto del
 * formulario — este componente solo dibuja el PDF, traduce arrastres de mouse a porcentajes
 * (0-100, mismo formato que espera Documenso: ver documensoClient.js) y avisa los cambios.
 */
export default function EditorPosicionFirma({ contratoId, documentoId, firmantes, areas, onAreaChange }) {
  const [pdf, setPdf] = useState(null);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [tamañoRender, setTamañoRender] = useState(null); // { width, height } en CSS px
  const [firmanteActivo, setFirmanteActivo] = useState(0);
  const [arrastre, setArrastre] = useState(null); // { modo: 'dibujar'|'mover', ... } mientras se arrastra

  const canvasRef = useRef(null);
  const overlayRef = useRef(null);

  // Carga el PDF (una sola vez): bytes autenticados vía el endpoint dedicado, nunca doc.url a
  // pelo, porque doc.url no siempre es accesible sin la sesión propia del navegador (SharePoint).
  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError('');
    fetch(`${API_URL}/contratos/${contratoId}/documentos/${documentoId}/pdf-para-firma`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(async (resp) => {
        if (!resp.ok) throw new Error('No se pudo cargar el PDF para posicionar la firma.');
        return resp.arrayBuffer();
      })
      .then((buffer) => pdfjsLib.getDocument({ data: buffer }).promise)
      .then((doc) => {
        if (cancelado) return;
        setPdf(doc);
      })
      .catch((err) => {
        if (!cancelado) setError(err.message || 'No se pudo cargar el PDF.');
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [contratoId, documentoId]);

  // Dibuja la página actual en el <canvas> cada vez que cambia el PDF o la página. Usa
  // devicePixelRatio para que se vea nítido en pantallas de alta densidad, pero el tamaño CSS
  // (tamañoRender) es el que se usa luego para traducir arrastres de mouse a porcentajes.
  useEffect(() => {
    if (!pdf) return;
    let cancelado = false;
    (async () => {
      const page = await pdf.getPage(pagina);
      if (cancelado) return;
      const viewportBase = page.getViewport({ scale: 1 });
      const escala = ANCHO_RENDER / viewportBase.width;
      const viewport = page.getViewport({ scale: escala });
      const dpr = window.devicePixelRatio || 1;

      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = viewport.width * dpr;
      canvas.height = viewport.height * dpr;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      await page.render({ canvasContext: ctx, viewport }).promise;
      if (cancelado) return;
      setTamañoRender({ width: viewport.width, height: viewport.height });
    })().catch((err) => {
      if (!cancelado) setError(err.message || 'No se pudo dibujar la página del PDF.');
    });
    return () => {
      cancelado = true;
    };
  }, [pdf, pagina]);

  function coordenadasPct(evento) {
    const rect = overlayRef.current.getBoundingClientRect();
    const x = clamp(((evento.clientX - rect.left) / rect.width) * 100, 0, 100);
    const y = clamp(((evento.clientY - rect.top) / rect.height) * 100, 0, 100);
    return { x, y };
  }

  // ¿El punto (en %) cae dentro del recuadro ya colocado de algún firmante en esta página? Se
  // usa para decidir, al presionar el mouse, si se va a MOVER un recuadro existente o a DIBUJAR
  // uno nuevo (para el firmante seleccionado en la lista de abajo).
  function firmanteEnPunto(xPct, yPct) {
    for (let idx = firmantes.length - 1; idx >= 0; idx--) {
      const area = areas[idx];
      if (!area || area.page !== pagina) continue;
      if (
        xPct >= area.positionX && xPct <= area.positionX + area.width &&
        yPct >= area.positionY && yPct <= area.positionY + area.height
      ) {
        return idx;
      }
    }
    return null;
  }

  function handleMouseDown(evento) {
    if (!tamañoRender) return;
    const { x, y } = coordenadasPct(evento);
    const idxExistente = firmanteEnPunto(x, y);
    if (idxExistente !== null) {
      const area = areas[idxExistente];
      setFirmanteActivo(idxExistente);
      setArrastre({
        modo: 'mover',
        idx: idxExistente,
        // Offset del punto donde se dio click respecto a la esquina del recuadro, para que no
        // "salte" a estar centrado en el cursor.
        offsetX: x - area.positionX,
        offsetY: y - area.positionY,
        width: area.width,
        height: area.height,
      });
    } else {
      setArrastre({ modo: 'dibujar', idx: firmanteActivo, inicioX: x, inicioY: y, x, y });
    }
  }

  function handleMouseMove(evento) {
    if (!arrastre) return;
    const { x, y } = coordenadasPct(evento);
    if (arrastre.modo === 'dibujar') {
      setArrastre({ ...arrastre, x, y });
    } else if (arrastre.modo === 'mover') {
      const nuevaX = clamp(x - arrastre.offsetX, 0, 100 - arrastre.width);
      const nuevaY = clamp(y - arrastre.offsetY, 0, 100 - arrastre.height);
      onAreaChange(arrastre.idx, { page: pagina, positionX: nuevaX, positionY: nuevaY, width: arrastre.width, height: arrastre.height });
    }
  }

  function handleMouseUp() {
    if (!arrastre) return;
    if (arrastre.modo === 'dibujar') {
      const x0 = Math.min(arrastre.inicioX, arrastre.x);
      const y0 = Math.min(arrastre.inicioY, arrastre.y);
      const width = Math.abs(arrastre.x - arrastre.inicioX);
      const height = Math.abs(arrastre.y - arrastre.inicioY);
      if (width >= ANCHO_MINIMO_PCT && height >= ALTO_MINIMO_PCT) {
        onAreaChange(arrastre.idx, {
          page: pagina,
          positionX: clamp(x0, 0, 100 - width),
          positionY: clamp(y0, 0, 100 - height),
          width,
          height,
        });
      }
      // Si el recuadro salió demasiado chico (click accidental, no arrastre real) no se guarda
      // nada — se deja el área anterior de ese firmante intacta, si ya tenía una.
    }
    setArrastre(null);
  }

  if (error) {
    return <div className="alert alert-error">{error}</div>;
  }

  return (
    <div>
      <div className="field" style={{ marginBottom: 10 }}>
        <label style={{ marginBottom: 4 }}>Firmante a posicionar</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {firmantes.map((f, idx) => (
            <button
              key={idx}
              type="button"
              className="icon-btn"
              onClick={() => setFirmanteActivo(idx)}
              style={{
                borderColor: colorFirmante(idx),
                fontWeight: firmanteActivo === idx ? 700 : 400,
                background: firmanteActivo === idx ? colorFirmante(idx) : 'transparent',
                color: firmanteActivo === idx ? '#fff' : colorFirmante(idx),
              }}
            >
              {areas[idx] ? '✓ ' : ''}
              {f.nombreCompleto?.trim() || f.email?.trim() || `Firmante ${idx + 1}`}
              {areas[idx] && areas[idx].page !== pagina ? ` (pág. ${areas[idx].page})` : ''}
            </button>
          ))}
        </div>
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>
        Arrastra un recuadro sobre el PDF para marcar dónde va la firma de{' '}
        <b style={{ color: colorFirmante(firmanteActivo) }}>
          {firmantes[firmanteActivo]?.nombreCompleto?.trim() || firmantes[firmanteActivo]?.email?.trim() || `firmante ${firmanteActivo + 1}`}
        </b>
        . Puedes arrastrar un recuadro ya puesto para moverlo. Si no marcas ninguno, se usa una posición automática.
      </p>

      {cargando && <div className="muted">Cargando PDF…</div>}

      {!cargando && pdf && (
        <>
          {pdf.numPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <button type="button" className="icon-btn" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
                ← Anterior
              </button>
              <span className="muted" style={{ fontSize: 13 }}>Página {pagina} de {pdf.numPages}</span>
              <button type="button" className="icon-btn" disabled={pagina >= pdf.numPages} onClick={() => setPagina((p) => p + 1)}>
                Siguiente →
              </button>
            </div>
          )}

          <div style={{ position: 'relative', display: 'inline-block', border: '1px solid #ddd', lineHeight: 0 }}>
            <canvas ref={canvasRef} />
            <div
              ref={overlayRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              style={{ position: 'absolute', inset: 0, cursor: 'crosshair' }}
            >
              {firmantes.map((f, idx) => {
                const area = areas[idx];
                if (!area || area.page !== pagina) return null;
                const etiqueta = f.nombreCompleto?.trim() || f.email?.trim() || `Firmante ${idx + 1}`;
                return (
                  <div
                    key={idx}
                    title={etiqueta}
                    style={{
                      position: 'absolute',
                      left: `${area.positionX}%`,
                      top: `${area.positionY}%`,
                      width: `${area.width}%`,
                      height: `${area.height}%`,
                      border: `2px solid ${colorFirmante(idx)}`,
                      background: `${colorFirmante(idx)}22`,
                      boxSizing: 'border-box',
                      cursor: 'move',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        color: colorFirmante(idx),
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        overflow: 'hidden',
                        padding: '0 2px',
                      }}
                    >
                      {etiqueta}
                    </span>
                  </div>
                );
              })}
              {arrastre?.modo === 'dibujar' && (
                <div
                  style={{
                    position: 'absolute',
                    left: `${Math.min(arrastre.inicioX, arrastre.x)}%`,
                    top: `${Math.min(arrastre.inicioY, arrastre.y)}%`,
                    width: `${Math.abs(arrastre.x - arrastre.inicioX)}%`,
                    height: `${Math.abs(arrastre.y - arrastre.inicioY)}%`,
                    border: `2px dashed ${colorFirmante(arrastre.idx)}`,
                    background: `${colorFirmante(arrastre.idx)}22`,
                    boxSizing: 'border-box',
                    pointerEvents: 'none',
                  }}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
