import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, unwrap } from '../../api.js';
import ContratoForm, { contratoFormVacio, validarContrato, franquiciaPayload } from '../../components/ContratoForm.jsx';

export default function NuevaSolicitudFranquicia() {
  const navigate = useNavigate();
  const [tipos, setTipos] = useState([]);
  const [clubes, setClubes] = useState([]);
  const [valores, setValores] = useState(contratoFormVacio());
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState('');

  useEffect(() => {
    // Este formulario es exclusivo para tipos de contrato de franquicia; los demás tipos
    // se solicitan desde "Nueva solicitud de contrato" (Contratos).
    api.get('/tipos-contrato')
      .then((data) => setTipos((unwrap(data, 'tiposContrato') || []).filter((t) => t.activo !== false && t.esFranquicia)))
      .catch(() => {});
    api.get('/clubes', { activo: 'true' })
      .then((data) => setClubes(unwrap(data, 'clubes') || []))
      .catch(() => {});
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorGeneral('');
    const erroresValidacion = validarContrato(valores, { requiereClub: true });
    setErrores(erroresValidacion);
    if (Object.keys(erroresValidacion).length > 0) return;

    setEnviando(true);
    try {
      const payload = {
        ...valores,
        monto: valores.monto === '' ? null : Number(valores.monto),
        diasAvisoVencimiento: valores.diasAvisoVencimiento === '' ? null : Number(valores.diasAvisoVencimiento),
      };
      const contrato = await api.post('/contratos', payload);
      const id = contrato?.id || contrato?.contrato?.id;
      if (id) {
        await api.put(`/contratos/${id}/franquicia`, franquiciaPayload(valores));
      }
      navigate(id ? `/contratos/${id}` : '/franquicias');
    } catch (err) {
      setErrorGeneral(err.message || 'No se pudo crear la solicitud de franquicia.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Nueva solicitud de franquicia</h1>
          <p className="page-header-sub">Se creará como borrador ligado a un club. Podrás enviarlo a autorización desde el expediente.</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 820 }}>
        {tipos.length === 0 ? (
          <div className="empty-state">
            No hay tipos de contrato de franquicia activos. Pide a un administrador que dé de alta uno en Tipos de contrato.
          </div>
        ) : (
          <>
            {errorGeneral && <div className="alert alert-error">{errorGeneral}</div>}
            <form onSubmit={handleSubmit}>
              <ContratoForm valores={valores} onChange={setValores} errores={errores} tipos={tipos} clubes={clubes} />
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={enviando}>
                  {enviando ? 'Guardando…' : 'Guardar borrador'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)} disabled={enviando}>
                  Cancelar
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
