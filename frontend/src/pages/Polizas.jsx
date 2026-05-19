import { useState } from 'react';
import CrudPage from '../components/CrudPage';
import ImportButton from '../components/ImportButton';
import { polizasApi, importarApi } from '../api/endpoints';
import { fmtDate, statusClass } from '../utils/format';
import { useAuth } from '../context/AuthContext';

export default function Polizas() {
  const { hasRole } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);

  const extra = hasRole('admin') ? (
    <ImportButton uploader={importarApi.polizas} onDone={() => setReloadKey((k) => k + 1)}
      label="📥 Importar pólizas" />
  ) : null;

  return (
    <CrudPage
      key={reloadKey}
      title="Pólizas"
      api={polizasApi}
      writeRoles={['admin', 'mantenimiento']}
      deleteRoles={['admin']}
      extraActions={extra}
      helpText="Base maestra de proyectos. Importa el Excel de Vigencia para cargar todas las plantas con fechas de inicio y fin de póliza/garantía."
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
