import { formatFechaHora } from '../utils.js';

const ICONOS = {
  aprobado: '✓',
  rechazado: '✕',
  omitido: '–',
  pendiente: '',
};

function normalizarDecision(aprobacion) {
  const d = (aprobacion.decision || '').toLowerCase();
  if (d === 'aprobado' || d === 'rechazado' || d === 'omitido') return d;
  return 'pendiente';
}

export default function AutorizacionTimeline({ aprobaciones = [], enviado }) {
  if (!enviado) {
    return (
      <div className="empty-state">
        Este contrato aún no se ha enviado a autorización. El flujo se generará al enviarlo.
      </div>
    );
  }

  if (aprobaciones.length === 0) {
    return <div className="empty-state">No hay pasos de autorización configurados.</div>;
  }

  const ordenadas = [...aprobaciones].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const primeraPendienteIdx = ordenadas.findIndex((a) => normalizarDecision(a) === 'pendiente');

  return (
    <div className="timeline">
      {ordenadas.map((paso, idx) => {
        const estado = normalizarDecision(paso);
        const esActual = idx === primeraPendienteIdx && estado === 'pendiente';
        const claseDot = esActual ? 'actual' : estado;
        return (
          <div className="timeline-step" key={paso.id ?? idx}>
            <div className="tl-marker-col">
              <div className={`tl-dot ${claseDot}`}>{ICONOS[estado] || (idx + 1)}</div>
              <div className="tl-line" />
            </div>
            <div className="tl-content">
              <h4>{paso.nombrePaso || `Paso ${paso.orden ?? idx + 1}`}</h4>
              <div className="tl-meta">
                {paso.aprobador?.nombre || paso.aprobadorNombre || paso.rolAprobador || paso.rolRequerido || 'Aprobador sin asignar'}
                {estado === 'pendiente' && esActual && ' · esperando decisión'}
                {estado === 'pendiente' && !esActual && ' · en espera'}
                {estado !== 'pendiente' && paso.decididoAt && ` · ${formatFechaHora(paso.decididoAt)}`}
              </div>
              {paso.comentarios && <div className="tl-comment">{paso.comentarios}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
