import { useEffect, useState } from 'react';
import { api, unwrap } from '../api.js';

const FIRMANTE_VACIO = { nombres: '', apellidoPaterno: '', apellidoMaterno: '', email: '' };

export default function EnviarAFirmarModal({ contratoId, documento, onClose, onEnviado }) {
  const [tipos, setTipos] = useState([]);
  const [entorno, setEntorno] = useState(null);
  const [cargandoTipos, setCargandoTipos] = useState(true);
  const [tipoDocumento, setTipoDocumento] = useState('');
  const [ordenada, setOrdenada] = useState(false);
  const [firmantes, setFirmantes] = useState([{ ...FIRMANTE_VACIO }]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const data = await api.get('/contratos/doc2sign/tipos-documento');
        if (cancelado) return;
        const lista = unwrap(data, 'tipos') || [];
        setTipos(lista);
        setEntorno(data?.entorno);
        if (lista.length > 0) setTipoDocumento(lista[0].id || lista[0].ID || '');
      } catch (err) {
        if (!cancelado) setError(err.message || 'No se pudo cargar el catálogo de tipos de documento de doc2sign.');
      } finally {
        if (!cancelado) setCargandoTipos(false);
      }
    })();
    return () => { cancelado = true; };
  }, []);

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

    if (!tipoDocumento) {
      setError('Elige el tipo de documento (catálogo de doc2sign).');
      return;
    }
    const incompletos = firmantes.some((f) => !f.nombres.trim() || !f.apellidoPaterno.trim() || !f.email.trim());
    if (incompletos) {
      setError('Cada firmante necesita al menos nombre(s), apellido paterno y correo.');
      return;
    }

    setEnviando(true);
    try {
      await api.post(`/contratos/${contratoId}/documentos/${documento.id}/enviar-a-firmar`, {
        tipoDocumento,
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
        <h3>Enviar a firmar por doc2sign</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: -8 }}>
          Documento: <b>{documento.nombreArchivo}</b>
          {entorno === 'test' && (
            <span className="tag-pill" style={{ marginLeft: 8 }}>Ambiente de pruebas</span>
          )}
        </p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="firma-tipo-documento">Tipo de documento (doc2sign) *</label>
            {cargandoTipos ? (
              <p className="muted" style={{ fontSize: 13 }}>Cargando catálogo…</p>
            ) : tipos.length === 0 ? (
              <p className="error-text" style={{ fontSize: 13 }}>
                No se encontró ningún tipo de documento configurado en la cuenta de doc2sign.
              </p>
            ) : (
              <select
                id="firma-tipo-documento"
                value={tipoDocumento}
                onChange={(e) => setTipoDocumento(e.target.value)}
              >
                {tipos.map((t) => {
                  const id = t.id || t.ID;
                  const nombre = t.nombre || t.Nombre || id;
                  return <option key={id} value={id}>{nombre}</option>;
                })}
              </select>
            )}
          </div>

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
            <button type="submit" className="btn btn-primary" disabled={enviando || cargandoTipos || tipos.length === 0}>
              {enviando ? 'Enviando…' : 'Enviar a firmar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
