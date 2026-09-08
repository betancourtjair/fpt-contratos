import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, unwrap } from '../../api.js';
import ContratoForm, { contratoFormVacio, validarContrato, franquiciaPayload } from '../../components/ContratoForm.jsx';

export default function NuevaSolicitud() {
  const navigate = useNavigate();
  const [tipos, setTipos] = useState([]);
  const [valores, setValores] = useState(contratoFormVacio());
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState('');

  useEffect(() => {
    api.get('/tipos-contrato')
      .then((data) => setTipos((unwrap(data, 'tiposContrato') || []).filter((t) => t.activo !== false)))
      .catch(() => {});
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorGeneral('');
    const erroresValidacion = validarContrato(valores);
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

      const tipoElegido = tipos.find((t) => t.id === valores.tipoContratoId);
      if (id && tipoElegido?.esFranquicia) {
        try {
          await api.put(`/contratos/${id}/franquicia`, franquiciaPayload(valores));
        } catch (err) {
          // El contrato ya se creó; no bloqueamos la navegación por un error aquí, pero avisamos.
          setErrorGeneral(`El borrador se creó, pero no se pudieron guardar los datos de franquicia: ${err.message}`);
        }
      }

      navigate(id ? `/contratos/${id}` : '/contratos');
    } catch (err) {
      setErrorGeneral(err.message || 'No se pudo crear la solicitud.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Nueva solicitud de contrato</h1>
          <p className="page-header-sub">Se creará como borrador. Podrás enviarlo a autorización desde el expediente.</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 820 }}>
        {errorGeneral && <div className="alert alert-error">{errorGeneral}</div>}
        <form onSubmit={handleSubmit}>
          <ContratoForm valores={valores} onChange={setValores} errores={errores} tipos={tipos} />
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={enviando}>
              {enviando ? 'Guardando…' : 'Guardar borrador'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)} disabled={enviando}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
