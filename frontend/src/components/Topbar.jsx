import { useLocation } from 'react-router-dom';
import NotificationBell from './NotificationBell';

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
};

export default function Topbar({ onMenu, actions }) {
  const { pathname } = useLocation();
  const info = TITLES[pathname] || { title: 'Centro de Incidencias', sub: '' };

  return (
    <header className="topbar">
      <button className="menu-toggle" onClick={onMenu}>☰</button>
      <span className="page-title">{info.title}</span>
      <span className="page-sub">{info.sub}</span>
      <div className="topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {actions}
        <NotificationBell />
      </div>
    </header>
  );
}
