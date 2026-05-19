import CrudPage from '../components/CrudPage';
import { polizasApi } from '../api/endpoints';
import { fmtDate, statusClass } from '../utils/format';

export default function Polizas() {
  return (
    <CrudPage
      title="Pólizas"
      api={polizasApi}
      writeRoles={['admin', 'mantenimiento']}
      deleteRoles={['admin']}
      filters={[{ key: 'status', label: 'estados', options: ['Vigente', 'Vencida'] }]}
      columns={[
        { key: 'item', label: '#' },
        { key: 'grupo', label: 'Grupo' },
        { key: 'project', label: 'Proyecto' },
        { key: 'code', label: 'Código' },
        { key: 'platform', label: 'Plataforma' },
        { key: 'panels', label: 'Paneles' },
        { key: 'inv', label: 'Inv.' },
        { key: 'polStart', label: 'Inicio', render: (r) => fmtDate(r.polStart) },
        { key: 'polEnd', label: 'Vence', render: (r) => fmtDate(r.polEnd) },
        { key: 'status', label: 'Estado', render: (r) => <span className={`badge ${statusClass(r.status)}`}>{r.status}</span> },
        { key: 'zona', label: 'Zona' },
        { key: 'cuadrilla', label: 'Cuadrilla' },
      ]}
      formFields={[
        { key: 'item', label: '# Ítem', type: 'number' },
        { key: 'grupo', label: 'Grupo' },
        { key: 'project', label: 'Proyecto', required: true },
        { key: 'code', label: 'Código' },
        { key: 'tarifa', label: 'Tarifa' },
        { key: 'platform', label: 'Plataforma' },
        { key: 'panels', label: 'Paneles' },
        { key: 'inv', label: 'Inversores' },
        { key: 'sysStart', label: 'Inicio sistema', type: 'date' },
        { key: 'polStart', label: 'Inicio póliza', type: 'date' },
        { key: 'polEnd', label: 'Fin póliza', type: 'date' },
        { key: 'poliza', label: 'Tipo de póliza' },
        { key: 'zona', label: 'Zona' },
        { key: 'cuadrilla', label: 'Cuadrilla' },
      ]}
    />
  );
}
