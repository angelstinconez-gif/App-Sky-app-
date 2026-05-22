import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ROLE_LABELS = {
  admin: 'Administrador',
  operator: 'Operador',
  mantenimiento: 'Mantenimiento',
};

const NAV = [
  { section: 'Principal' },
  { to: '/dashboard',      label: 'Dashboard',    icon: '📊', roles: ['admin', 'operator', 'mantenimiento'] },
  { to: '/incidencias',    label: 'Incidencias',  icon: '⚠️', roles: ['admin', 'operator', 'mantenimiento'] },
  { to: '/tickets',        label: 'Tickets',      icon: '🎫', roles: ['admin', 'operator', 'mantenimiento'] },
  { section: 'Servicio' },
  { to: '/garantias',      label: 'Garantías',    icon: '🛡️', roles: ['admin', 'mantenimiento'] },
  { to: '/mantenimiento',  label: 'Mantenimiento',icon: '🔧', roles: ['admin', 'mantenimiento'] },
  { to: '/polizas',        label: 'Pólizas',      icon: '📄', roles: ['admin', 'mantenimiento'] },
  { section: 'Catálogos' },
  { to: '/directorio',     label: 'Directorio',   icon: '📇', roles: ['admin', 'operator', 'mantenimiento'] },
  { to: '/cuadrillas',     label: 'Cuadrillas',   icon: '👥', roles: ['admin', 'operator'] },
  { to: '/tecnicos',       label: 'Técnicos',     icon: '🧑‍🔧', roles: ['admin', 'operator', 'mantenimiento'] },
  { to: '/errores',        label: 'Catálogo errores', icon: '📋', roles: ['admin'] },
  { section: 'Análisis' },
  { to: '/calendario',     label: 'Calendario',   icon: '📅', roles: ['admin', 'operator'] },
  { to: '/reportes',       label: 'Reportes',     icon: '📈', roles: ['admin', 'operator'] },
  { section: 'Sistema' },
  { to: '/notificaciones', label: 'Notificaciones',icon: '🔔', roles: ['admin', 'operator', 'mantenimiento'] },
  { to: '/historial',      label: 'Historial',    icon: '🕓', roles: ['admin'] },
  { to: '/usuarios',       label: 'Usuarios',     icon: '👤', roles: ['admin'] },
];

export default function Sidebar({ open, onClose }) {
  const { user, logout } = useAuth();
  if (!user) return null;

  const initials = user.initials || user.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sb-header">
        <div className="sb-logo">PV</div>
        <div className="sb-brand">
          SKY PV Monitor
          <span>Sistema FV</span>
        </div>
      </div>

      <nav className="sb-nav">
        {NAV.map((item, n) => {
          if (item.section) {
            return (
              <div key={`s-${n}`} className="sb-section">
                {item.section}
              </div>
            );
          }
          if (!item.roles.includes(user.role)) return null;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="sb-user">
        <div className="sb-avatar">{initials}</div>
        <div className="sb-userinfo">
          <div className="sb-username">{user.name}</div>
          <div className="sb-role">{ROLE_LABELS[user.role] || user.role}</div>
        </div>
        <button className="sb-logout" onClick={logout} title="Cerrar sesión">
          ⏻
        </button>
      </div>
    </aside>
  );
}
