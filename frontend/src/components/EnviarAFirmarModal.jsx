import { useEffect, useState } from 'react';
import { api, unwrap } from '../api.js';
import EditorPosicionFirma from './EditorPosicionFirma.jsx';

const FIRMANTE_VACIO = { nombreCompleto: '', email: '' };

export default function EnviarAFirmarModal({
  contratoId,
  documento,
  contraparteNombre,
  contraparteEmail,
  onClose,
  onEnviado,
}) {
  const [ordenada, setOrdenada] = useState(false);
  // Si el contrato ya tiene capturado el nombre o correo de la contraparte (ContratoForm.jsx),
  // se usa para prellenar al primer firmante en vez de arrancar en blanco: casi siempre la
  // contraparte es quien tiene que firmar.
  const [firmantes, setFirmantes] = useState([
    contraparteNombre || contraparteEmail
    ? { nombreCompleto: contraparteNombre || '', email: contraparteEmail || '' }
    : { ...FIRMANTE_VACIO },
  ]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [directorio, setDirectorio] = useState([]);
  const [enlacesFirma, setEnlacesFirma] = useState(null);
  const [copiadoIdx, setCopiadoIdx] = useState(null);
  // Recuadro (page/positionX/positionY/width/height, 0-100) que el usuario dibujó a mano sobre
  // el PDF para cada firmante — mismo índice que el array `firmantes`. `null` mientras no se ha
  // marcado ninguno; en ese caso, al enviar, el backend usa la posición automática de siempre
  // (ver documensoClient.areaPorDefecto).
  const [areas, setAreas] = useState(firmantes.map(() => null));

  function actualizarArea(idx, area) {
    setAreas((prev) => prev.map((a, i) => (i === idx ? area : a)));
  }

  useEffect(() => {
    // Directorio interno (nombre + correo) para elegir un firmante de FPT sin escribirlo a
    // mano. Si falla (p. ej. el backend todavía no tiene este endpoint), el modal sigue
    // funcionando igual con captura manual.
    api.get('/usuarios/directorio')
    .then((data) => setDirectorio(unwrap(data, 'usuarios') || []))
    .catch(() => {});
  }, []);
  
      function actualizarFirmante(idx, campo, valor) {
    setFirmantes((prev) => prev.map((f, i) => (i === idx ? { ...f, [campo]: valor } : f)));
  }

  function elegirDeDirectorio(idx, usuarioId) {
const usuario = directorio.find((u) => String(u.id) === String(usuarioId));
if (!usuario) return;
setFirmantes((prev) =>
  prev.map((f, i) => (i === idx ? { ...f, nombreCompleto: usuario.nombre, email: usuario.email } : f))
);
  }
    

  function agregarFirmante() {
    setFirmantes((prev) => [...prev, { ...FIRMANTE_VACIO }]);
    setAreas((prev) => [...prev, null]);
  }

  function quitarFirmante(idx) {
    setFirmantes((prev) => prev.filter((_, i) => i !== idx));
    setAreas((prev) => prev.filter((_, i) => i !== idx));
  }

  async function copiarEnlace(idx, url, nombre) {
    const base = `${window.location.origin}${window.location.pathname}`;
    const enlace = `${base}#/firmar-espera?url=${encodeURIComponent(url)}&nombre=${encodeURIComponent(nombre || '')}`;
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiadoIdx(idx);
      setTimeout(() => setCopiadoIdx(null), 2000);
    } catch {
      window.prompt('Copia este enlace:', enlace);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

const incompletos = firmantes.some((f) => !f.nombreCompleto.trim() || !f.email.trim());
    if (incompletos) {
      setError('Cada firmante necesita al menos nombre completo y correo.');
      return;
    }

    setEnviando(true);
    try {
      const resp = await api.post(`/contratos/${contratoId}/documentos/${documento.id}/enviar-a-firmar`, {
        ordenada,
        firmantes: firmantes.map((f, idx) => ({ ...f, orden: idx + 1, area: areas[idx] || undefined })),
      });
      onEnviado?.();
      const conEnlace = (resp?.firmantes || []).filter((f) => f.signingUrl);
      if (conEnlace.length > 0) {
        setEnlacesFirma(conEnlace);
      } else {
        onClose?.();
      }
    } catch (err) {
      setError(err.message || 'No se pudo enviar el documento a firmar.');
    } finally {
      setEnviando(false);
    }
  }
  if (enlacesFirma) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h3>Documento enviado a firmar</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: -8 }}>
        Documenso ya envió el correo de firma. Si el firmante tarda en entrar (el servicio
        puede tardar en despertar), comparte este enlace alterno por WhatsApp u otro medio:
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '12px 0' }}>
          {enlacesFirma.map((f, idx) => (
        <button
          key={idx}
          type="button"
          className="icon-btn"
          onClick={() => copiarEnlace(idx, f.signingUrl, f.nombreCompleto)}
          >
          {copiadoIdx === idx ? 'Enlace copiado' : `Copiar enlace: ${f.nombreCompleto}`}
        </button>
        ))}
        </div>
        <div className="modal-actions">
        <button type="button" className="btn btn-primary" onClick={onClose}>
        Listo
        </button>
        </div>
        </div>
      </div>
      );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
        <h3>Enviar a firmar por Documenso</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: -8 }}>
          Documento: <b>{documento.nombreArchivo}</b>
        </p>
        <p className="muted" style={{ fontSize: 12 }}>
          Firma electrónica simple (no cuenta con certificación NOM-151).
        </p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field checkbox-row">
            <input
              id="firma-ordenada"
              type="checkbox"
              checked={ordenada}
              onChange={(e) => setOrdenada(e.target.checked)}
            />
            <label htmlFor="firma-ordenada" style={{ marginBottom: 0 }}>
              Requerir que firmen en el orden capturado abajo
            </label>
          </div>

          <label style={{ display: 'block', marginBottom: 6 }}>Firmantes *</label>
          {firmantes.map((f, idx) => (
            <div key={idx} className="form-row" style={{ alignItems: 'end', marginBottom: 8 }}>
              {directorio.length > 0 && (
<div className="field" style={{ marginBottom: 0 }}>
<label htmlFor={`firmante-directorio-${idx}`}>Directorio interno</label>
<select
id={`firmante-directorio-${idx}`}
value=""
onChange={(e) => elegirDeDirectorio(idx, e.target.value)}
>
<option value="">Elegir…</option>
  {directorio.map((u) => (
<option key={u.id} value={u.id}>
  {u.nombre}
</option>
))}
</select>
</div>
)}
<div className="field" style={{ marginBottom: 0 }}>
<label htmlFor={`firmante-nombre-${idx}`}>Nombre completo</label>
<input
id={`firmante-nombre-${idx}`}
type="text"
value={f.nombreCompleto}
onChange={(e) => actualizarFirmante(idx, 'nombreCompleto', e.target.value)}
/>
</div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor={`firmante-email-${idx}`}>Correo</label>
                <input
                  id={`firmante-email-${idx}`}
                  type="email"
                  value={f.email}
                  onChange={(e) => actualizarFirmante(idx, 'email', e.target.value)}
                />
              </div>
              {firmantes.length > 1 && (
                <div className="field" style={{ marginBottom: 0 }}>
                  <button type="button" className="icon-btn" onClick={() => quitarFirmante(idx)}>
                    Quitar
                  </button>
                </div>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-secondary" onClick={agregarFirmante} style={{ marginBottom: 16 }}>
            + Agregar firmante
          </button>

          <label style={{ display: 'block', marginBottom: 6 }}>Posición de la firma (opcional)</label>
          <div style={{ marginBottom: 16 }}>
            <EditorPosicionFirma
              contratoId={contratoId}
              documentoId={documento.id}
              firmantes={firmantes}
              areas={areas}
              onAreaChange={actualizarArea}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={enviando}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={enviando}>
              {enviando ? 'Enviando…' : 'Enviar a firmar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
