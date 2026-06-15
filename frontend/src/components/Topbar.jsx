import { useLocation } from 'react-router-dom';
import NotificationBell from './NotificationBell';
import GlobalSearch from './GlobalSearch';

const TITLES = {
  '/dashboard':     { title: 'Dashboard',     sub: 'Resumen general del sistema' },
  '/incidencias':   { title: 'Incidencias',   sub: 'Registro de fallas y eventos' },
  '/tickets':       { title: 'Tickets',       sub: 'Solicitudes de servicio' },
  '/garantias':     { title: 'Garantías',     sub: 'Reclamos de garantía a fabricantes' },
  '/mantenimiento': { title: 'Mantenimiento', sub: 'Planificación y ejecución' },
  '/polizas':       { title: 'Pólizas',       sub: 'Contratos de mantenimiento' },
  '/directorio':    { title: 'Directorio',    sub: 'Contactos del sistema' },
  '/cuadrillas':    { title: 'Cuadrillas',    sub: 'Equipos de trabajo' },
  '/errores':       { title: 'Catálogo de errores', sub: 'Códigos por fabricante' },
  '/calendario':    { title: 'Calendario',    sub: 'Eventos programados' },
  '/reportes':      { title: 'Reportes',      sub: 'Análisis y exportación' },
  '/historial':     { title: 'Historial',     sub: 'Registro de cambios' },
  '/usuarios':      { title: 'Usuarios',      sub: 'Gestión de cuentas' },
  '/notificaciones':{ title: 'Notificaciones',sub: 'Canales y suscripciones' },
  '/viaticos':      { title: 'Viáticos',      sub: 'Gastos de visita' },
  '/checklists':    { title: 'Checklists',    sub: 'Visitas de revisión' },
  '/lecciones':     { title: 'Lecciones aprendidas', sub: 'Base de conocimiento' },
  '/analisis':      { title: 'Análisis de datos', sub: 'Plantas PV vigentes · cumplimiento mensual' },
  '/tickets-por-proyecto': { title: 'Tickets por proyecto', sub: 'Resumen abiertos / cerrados / vencidos' },
};

export default function Topbar({ onMenu, actions }) {
  const { pathname } = useLocation();
  const info = TITLES[pathname] || { title: 'Centro de Incidencias', sub: '' };

  return (
    <header className="topbar" style={{ gap: 12 }}>
      <button className="menu-toggle" onClick={onMenu}>☰</button>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span className="page-title" style={{ lineHeight: 1.1 }}>{info.title}</span>
        {info.sub && <span className="page-sub" style={{ fontSize: 10, color: 'var(--gray-400)' }}>{info.sub}</span>}
      </div>

      {/* Buscador global en el centro */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', maxWidth: 600 }}>
        <GlobalSearch />
      </div>

      <div className="topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
        {actions}
        <NotificationBell />
      </div>
    </header>
  );
}
