import { useState } from 'react';
import { api } from '../api.js';

const FIRMANTE_VACIO = { nombres: '', apellidoPaterno: '', apellidoMaterno: '', email: '' };

export default function EnviarAFirmarModal({ contratoId, documento, onClose, onEnviado }) {
  const [ordenada, setOrdenada] = useState(false);
  const [firmantes, setFirmantes] = useState([{ ...FIRMANTE_VACIO }]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  function actualizarFirmante(idx, campo, valor) {
    setFirmantes((prev) => prev.map((f, i) => (i === idx ? { ...f, [campo]: valor } : f)));
  }

  function agregarFirmante() {
    setFirmantes((prev) => [...prev, { ...FIRMANTE_VACIO }]);
  }

  function quitarFirmante(idx) {
    setFirmantes((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const incompletos = firmantes.some((f) => !f.nombres.trim() || !f.apellidoPaterno.trim() || !f.email.trim());
    if (incompletos) {
      setError('Cada firmante necesita al menos nombre(s), apellido paterno y correo.');
      return;
    }

    setEnviando(true);
    try {
      await api.post(`/contratos/${contratoId}/documentos/${documento.id}/enviar-a-firmar`, {
        ordenada,
        firmantes: firmantes.map((f, idx) => ({ ...f, orden: idx + 1 })),
      });
      onEnviado?.();
      onClose?.();
    } catch (err) {
      setError(err.message || 'No se pudo enviar el documento a firmar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Enviar a firmar por DocuSeal</h3>
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
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor={`firmante-nombres-${idx}`}>Nombre(s)</label>
                <input
                  id={`firmante-nombres-${idx}`}
                  type="text"
                  value={f.nombres}
                  onChange={(e) => actualizarFirmante(idx, 'nombres', e.target.value)}
                />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor={`firmante-paterno-${idx}`}>Apellido paterno</label>
                <input
                  id={`firmante-paterno-${idx}`}
                  type="text"
                  value={f.apellidoPaterno}
                  onChange={(e) => actualizarFirmante(idx, 'apellidoPaterno', e.target.value)}
                />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor={`firmante-materno-${idx}`}>Apellido materno</label>
                <input
                  id={`firmante-materno-${idx}`}
                  type="text"
                  value={f.apellidoMaterno}
                  onChange={(e) => actualizarFirmante(idx, 'apellidoMaterno', e.target.value)}
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
