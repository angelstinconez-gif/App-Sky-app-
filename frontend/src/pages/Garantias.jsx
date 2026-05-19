import CrudPage from '../components/CrudPage';
import { garantiasApi } from '../api/endpoints';
import { fmtDate } from '../utils/format';

const STATUSES = [
  'En revisión',
  'En espera de respuesta de distribuidor',
  'Aprobada, por gestionar entrega',
  'Aprobada',
  'Rechazada',
  'Cerrada',
];

export default function Garantias() {
  return (
    <CrudPage
      title="Garantías"
      api={garantiasApi}
      writeRoles={['admin', 'mantenimiento']}
      deleteRoles={['admin']}
      filters={[{ key: 'status', label: 'estados', options: STATUSES }]}
      columns={[
        { key: 'project', label: 'Proyecto' },
        { key: 'equipment', label: 'Equipo' },
        { key: 'brand', label: 'Marca' },
        { key: 'model', label: 'Modelo' },
        { key: 'error', label: 'Error' },
        { key: 'supplier', label: 'Proveedor' },
        { key: 'ticket', label: 'Ticket' },
        { key: 'status', label: 'Estado' },
        { key: 'uploadDate', label: 'Fecha', render: (r) => fmtDate(r.uploadDate) },
      ]}
      formFields={[
        { key: 'project', label: 'Proyecto', required: true },
        { key: 'code', label: 'Código' },
        { key: 'equipment', label: 'Equipo' },
        { key: 'brand', label: 'Marca' },
        { key: 'model', label: 'Modelo' },
        { key: 'sn', label: 'Número de serie' },
        { key: 'error', label: 'Error' },
        { key: 'supplier', label: 'Proveedor' },
        { key: 'contact', label: 'Contacto' },
        { key: 'ticket', label: 'Ticket' },
        { key: 'status', label: 'Estado', type: 'select', options: STATUSES },
        { key: 'uploadDate', label: 'Fecha alta', type: 'date' },
        { key: 'comments', label: 'Comentarios', type: 'textarea', full: true },
      ]}
    />
  );
}
