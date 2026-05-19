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
        <div className="login-logo">PV</div>
        <h1>SKY PV Monitor</h1>
        <p className="subtitle">Sistema de Incidencias Fotovoltaicas</p>

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

        <div className="demo-hint">
          <strong>Cuentas de prueba</strong>
          <br />
          Admin: <code>admin@skyenergy.mx</code> · <code>Sky@Admin2025</code>
          <br />
          Operador: <code>operador@skyenergy.mx</code> · <code>Sky@Oper2025</code>
          <br />
          Mantto: <code>mantenimiento@skyenergy.mx</code> · <code>Sky@Mant2025</code>
        </div>
      </div>
    </div>
  );
}
