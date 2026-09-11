import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';

export default function CambiarPassword() {
  const { usuario, actualizarUsuario, logout } = useAuth();
  const navigate = useNavigate();

  const [passwordActual, setPasswordActual] = useState('');
  const [passwordNueva, setPasswordNueva] = useState('');
  const [passwordConfirmar, setPasswordConfirmar] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const esObligatorio = Boolean(usuario?.debeCambiarPassword);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!passwordActual || !passwordNueva || !passwordConfirmar) {
      setError('Completa todos los campos.');
      return;
    }
    if (passwordNueva.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (passwordNueva !== passwordConfirmar) {
      setError('La confirmación no coincide con la nueva contraseña.');
      return;
    }

    setGuardando(true);
    try {
      const data = await api.post('/auth/cambiar-password', { passwordActual, passwordNueva });
      actualizarUsuario(data.usuario);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'No se pudo cambiar la contraseña.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Cambiar contraseña</h1>
          <p className="page-header-sub">
            {esObligatorio
              ? 'Por seguridad, debes establecer una nueva contraseña antes de continuar.'
              : 'Actualiza tu contraseña de acceso.'}
          </p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 480 }}>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="password-actual">Contraseña actual *</label>
            <input
              id="password-actual"
              type="password"
              value={passwordActual}
              onChange={(e) => setPasswordActual(e.target.value)}
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="password-nueva">Contraseña nueva *</label>
            <input
              id="password-nueva"
              type="password"
              value={passwordNueva}
              onChange={(e) => setPasswordNueva(e.target.value)}
              placeholder="Mínimo 8 caracteres"
            />
          </div>

          <div className="field">
            <label htmlFor="password-confirmar">Confirmar contraseña nueva *</label>
            <input
              id="password-confirmar"
              type="password"
              value={passwordConfirmar}
              onChange={(e) => setPasswordConfirmar(e.target.value)}
            />
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Cambiar contraseña'}
            </button>
            {!esObligatorio && (
              <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)} disabled={guardando}>
                Cancelar
              </button>
            )}
            {esObligatorio && (
              <button type="button" className="btn btn-ghost" onClick={logout} disabled={guardando}>
                Cerrar sesión
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
