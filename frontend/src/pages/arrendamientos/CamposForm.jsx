// Renderiza un formulario completo a partir de la config declarativa en campos.js (GRUPOS_LOCATION
// / GRUPOS_LEASE), en vez de escribir a mano el JSX de cada campo. `opciones` es un mapa
// { opcionesKey: [{value,label}, ...] } para los selects que dependen de datos cargados aparte
// (brands, companies).
export default function CamposForm({ grupos, valores, onChange, opciones = {} }) {
  return (
    <>
      {grupos.map((grupo) => (
        <div className="field-group" key={grupo.titulo}>
          <div className="field-group-title">{grupo.titulo}</div>
          <div className="form-row-3">
            {grupo.campos.map((campo) => (
              <Campo
                key={campo.key}
                campo={campo}
                valor={valores[campo.key]}
                onChange={(v) => onChange(campo.key, v)}
                opciones={campo.opciones || opciones[campo.opcionesKey] || []}
              />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function Campo({ campo, valor, onChange, opciones }) {
  const id = `campo-${campo.key}`;

  if (campo.type === 'boolean') {
    return (
      <div className="field checkbox-row">
        <input id={id} type="checkbox" checked={!!valor} onChange={(e) => onChange(e.target.checked)} />
        <label htmlFor={id} style={{ marginBottom: 0 }}>{campo.label}</label>
      </div>
    );
  }

  if (campo.type === 'select') {
    return (
      <div className="field">
        <label htmlFor={id}>{campo.label}</label>
        <select id={id} value={valor ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {opciones.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    );
  }

  if (campo.type === 'textarea') {
    return (
      <div className="field">
        <label htmlFor={id}>{campo.label}</label>
        <textarea id={id} value={valor ?? ''} onChange={(e) => onChange(e.target.value)} rows={2} />
      </div>
    );
  }

  return (
    <div className="field">
      <label htmlFor={id}>{campo.label}</label>
      <input
        id={id}
        type={campo.type === 'date' ? 'date' : campo.type === 'number' ? 'number' : 'text'}
        value={valor ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
