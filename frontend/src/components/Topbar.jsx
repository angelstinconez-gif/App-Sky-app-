import { useLocation } from 'react-router-dom';
import NotificationBell from './NotificationBell';
import GlobalSearch from './GlobalSearch';

const TITLES = {
  '/dashboard':     { title: 'Dashboard',     sub: 'Resumen general' },
  '/incidencias':   { title: 'Incidencias',   sub: 'Fallas y eventos' },
  '/tickets':       { title: 'Tickets',       sub: 'Solicitudes de servicio' },
  '/garantias':     { title: 'Garantías',     sub: 'Reclamos a fabricantes' },
  '/mantenimiento': { title: 'Mantenimiento', sub: 'Planificación y ejecución' },
  '/polizas':       { title: 'Pólizas',       sub: 'Contratos' },
  '/directorio':    { title: 'Directorio',    sub: 'Contactos' },
  '/cuadrillas':    { title: 'Cuadrillas',    sub: 'Equipos de trabajo' },
  '/tecnicos':      { title: 'Técnicos',      sub: 'Personal' },
  '/errores':       { title: 'Catálogo errores', sub: 'Códigos por fabricante' },
  '/calendario':    { title: 'Calendario',    sub: 'Eventos programados' },
  '/reportes':      { title: 'Reportes',      sub: 'Análisis y exportación' },
  '/historial':     { title: 'Historial',     sub: 'Registro de cambios' },
  '/usuarios':      { title: 'Usuarios',      sub: 'Gestión de cuentas' },
  '/notificaciones':{ title: 'Notificaciones',sub: 'Canales y suscripciones' },
  '/viaticos':      { title: 'Viáticos',      sub: 'Gastos de visita' },
  '/checklists':    { title: 'Checklists',    sub: 'Visitas de revisión' },
  '/lecciones':     { title: 'Lecciones',     sub: 'Base de conocimiento' },
  '/analisis':      { title: 'Análisis PV',   sub: 'Cumplimiento mensual' },
  '/tickets-por-proyecto': { title: 'Tickets x proyecto', sub: 'Estado por planta' },
  '/revision-semanal': { title: 'Revisión semanal SFV', sub: 'Checklist por planta PV' },
};

export default function Topbar({ onMenu, actions }) {
  const { pathname } = useLocation();
  const info = TITLES[pathname] || { title: 'Centro de Incidencias', sub: '' };

  return (
    <header className="topbar">
      <button className="menu-toggle" onClick={onMenu} aria-label="Menú">☰</button>

      <div className="topbar-title">
        <span className="page-title">{info.title}</span>
        {info.sub && <span className="page-sub">{info.sub}</span>}
      </div>

      {/* Buscador global — siempre visible, ocupa el centro */}
      <div className="topbar-search">
        <GlobalSearch />
      </div>

      <div className="topbar-actions">
        {actions}
        <NotificationBell />
      </div>
    </header>
  );
}
