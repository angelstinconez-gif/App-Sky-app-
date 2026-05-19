import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './context/AuthContext';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Incidencias from './pages/Incidencias';
import Tickets from './pages/Tickets';
import Garantias from './pages/Garantias';
import Polizas from './pages/Polizas';
import Mantenimiento from './pages/Mantenimiento';
import Directorio from './pages/Directorio';
import Cuadrillas from './pages/Cuadrillas';
import Errores from './pages/Errores';
import Calendario from './pages/Calendario';
import Reportes from './pages/Reportes';
import Historial from './pages/Historial';
import Usuarios from './pages/Usuarios';

function Shell({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="app-shell">
      <Sidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="main">
        <Topbar onMenu={() => setMobileOpen(true)} />
        <div className="content">{children}</div>
      </div>
    </div>
  );
}

function Protected({ children, roles }) {
  return (
    <ProtectedRoute roles={roles}>
      <Shell>{children}</Shell>
    </ProtectedRoute>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <span className="spinner" />
      </div>
    );
  }

  return (
    <ToastProvider>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
        <Route path="/incidencias" element={<Protected roles={['admin', 'operator']}><Incidencias /></Protected>} />
        <Route path="/tickets" element={<Protected><Tickets /></Protected>} />
        <Route path="/garantias" element={<Protected roles={['admin', 'mantenimiento']}><Garantias /></Protected>} />
        <Route path="/mantenimiento" element={<Protected roles={['admin', 'mantenimiento']}><Mantenimiento /></Protected>} />
        <Route path="/polizas" element={<Protected roles={['admin', 'mantenimiento']}><Polizas /></Protected>} />
        <Route path="/directorio" element={<Protected><Directorio /></Protected>} />
        <Route path="/cuadrillas" element={<Protected roles={['admin', 'operator']}><Cuadrillas /></Protected>} />
        <Route path="/errores" element={<Protected roles={['admin']}><Errores /></Protected>} />
        <Route path="/calendario" element={<Protected roles={['admin', 'operator']}><Calendario /></Protected>} />
        <Route path="/reportes" element={<Protected roles={['admin', 'operator']}><Reportes /></Protected>} />
        <Route path="/historial" element={<Protected roles={['admin']}><Historial /></Protected>} />
        <Route path="/usuarios" element={<Protected roles={['admin']}><Usuarios /></Protected>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </ToastProvider>
  );
}
