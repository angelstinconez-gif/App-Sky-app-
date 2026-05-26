import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login, user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) {
    nav('/dashboard', { replace: true });
    return null;
  }

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), pass);
      const dest = loc.state?.from?.pathname || '/dashboard';
      nav(dest, { replace: true });
    } catch (err) {
      setError(err?.response?.data?.message || 'Correo o contraseña incorrectos');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo" style={{ background: 'transparent', padding: 0 }}>
          <img src="/sky-sense-logo.svg" alt="SKY SENSE" style={{ width: 200, maxWidth: '100%' }}
            onError={(e) => { e.target.style.display = 'none'; }} />
        </div>
        <h1>Centro de Incidencias</h1>
        <p className="subtitle">Plataforma de gestión SKY SENSE</p>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={submit}>
          <div className="form-row" style={{ marginBottom: 12 }}>
            <label>Correo</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="form-row" style={{ marginBottom: 16 }}>
            <label>Contraseña</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPass ? 'text' : 'password'}
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                required
                style={{ width: '100%', paddingRight: 70 }}
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                style={{
                  position: 'absolute',
                  right: 6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 0,
                  color: 'var(--gray-400)',
                  cursor: 'pointer',
                  fontSize: 11,
                }}
              >
                {showPass ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: 10 }} disabled={loading}>
            {loading ? <span className="spinner" /> : 'Iniciar sesión'}
          </button>
        </form>

      </div>
    </div>
  );
}
