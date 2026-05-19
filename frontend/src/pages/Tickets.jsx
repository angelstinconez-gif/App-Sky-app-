import CrudPage from '../components/CrudPage';
import { ticketsApi } from '../api/endpoints';
import { fmtDate, priorityClass, statusClass } from '../utils/format';

const STATUSES = ['Abierto', 'En proceso', 'Cerrado'];
const PRIORITIES = ['Critico', 'Alta', 'Intermedia', 'Baja'];

export default function Tickets() {
  return (
    <CrudPage
      title="Tickets"
      api={ticketsApi}
      writeRoles={['admin', 'operator', 'mantenimiento']}
      deleteRoles={['admin']}
      defaults={{ status: 'Abierto', priority: 'Intermedia' }}
      filters={[
        { key: 'status', label: 'estados', options: STATUSES, placeholder: 'Todos los estados' },
        { key: 'priority', label: 'prioridades', options: PRIORITIES, placeholder: 'Todas las prioridades' },
      ]}
      columns={[
        { key: 'id', label: '#' },
        { key: 'title', label: 'Título' },
        { key: 'site', label: 'Sitio' },
        { key: 'client', label: 'Cliente' },
        { key: 'priority', label: 'Prioridad', render: (r) => <span className={`badge ${priorityClass(r.priority)}`}>{r.priority || '—'}</span> },
        { key: 'status', label: 'Estado', render: (r) => <span className={`badge ${statusClass(r.status)}`}>{r.status}</span> },
        { key: 'assignedTo', label: 'Asignado' },
        { key: 'openDate', label: 'Apertura', render: (r) => fmtDate(r.openDate) },
        { key: 'dueDate', label: 'Compromiso', render: (r) => fmtDate(r.dueDate) },
        { key: 'days', label: 'Días', render: (r) => (r.days != null ? `${r.days}d` : '—') },
      ]}
      formFields={[
        { key: 'title', label: 'Título', required: true },
        { key: 'priority', label: 'Prioridad', type: 'select', options: PRIORITIES },
        { key: 'status', label: 'Estado', type: 'select', options: STATUSES },
        { key: 'site', label: 'Sitio' },
        { key: 'client', label: 'Cliente' },
        { key: 'projectCode', label: 'Código proyecto' },
        { key: 'assignedTo', label: 'Asignado a' },
        { key: 'openDate', label: 'Fecha apertura', type: 'date' },
        { key: 'dueDate', label: 'Fecha compromiso', type: 'date' },
        { key: 'description', label: 'Descripción', type: 'textarea', full: true },
      ]}
    />
  );
}
