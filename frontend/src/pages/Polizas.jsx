import { useState } from 'react';
import CrudPage from '../components/CrudPage';
import ImportButton from '../components/ImportButton';
import { polizasApi, importarApi } from '../api/endpoints';
import { fmtDate, statusClass } from '../utils/format';
import { useAuth } from '../context/AuthContext';

function diasRestantes(end) {
  if (!end) return null;
  const d = new Date(end);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((d - today) / (1000 * 60 * 60 * 24));
}
function statusVigencia(end) {
  const d = diasRestantes(end);
  if (d === null) return null;
  if (d < 0) return 'Vencida';
  if (d <= 30) return 'Por vencer';
  return 'Vigente';
}
function diasBadge(d) {
  if (d === null) return '—';
  if (d < 0) return `Vencida hace ${-d}d`;
  if (d <= 30) return `${d}d ⚠️`;
  return `${d}d`;
}

export default function Polizas() {
  const { hasRole } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);

  const extra = hasRole('admin') ? (
    <>
      <a className="btn btn-sm" href="/templates/polizas_template.xlsx" download
         title="Descarga la plantilla con columnas y ejemplo">
        📄 Plantilla
      </a>
      <ImportButton uploader={importarApi.polizas} onDone={() => setReloadKey((k) => k + 1)}
        label="📥 Importar pólizas" />
    </>
  ) : null;

  return (
    <CrudPage
      key={reloadKey}
      title="Pólizas"
      api={polizasApi}
      writeRoles={['admin']}
      deleteRoles={['admin']}
      extraActions={extra}
      helpText="Base maestra de proyectos. Incluye fechas de inicio y fin de póliza/garantía. Sólo el administrador puede crear o modificar pólizas; el resto de roles tiene acceso de consulta."
      filters={[{ key: 'status', label: 'estados', options: ['Vigente', 'Por vencer', 'Vencida'] }]}
      columns={[
        { key: 'item', label: '#' },
        { key: 'grupo', label: 'Grupo' },
        { key: 'project', label: 'Proyecto' },
        { key: 'code', label: 'Código' },
        { key: 'platform', label: 'Plataforma' },
        { key: 'poliza', label: 'Tipo' },
        { key: 'sysStart', label: 'Inicio sistema', render: (r) => fmtDate(r.sysStart) },
        { key: 'polStart', label: 'Inicio póliza', render: (r) => fmtDate(r.polStart) },
        { key: 'polEnd', label: 'Fin póliza', render: (r) => fmtDate(r.polEnd) },
        {
          key: '_dias', label: 'Días',
          render: (r) => {
            const d = diasRestantes(r.polEnd);
            return <span className={`badge ${d === null ? '' : d < 0 ? 's-cerrada' : d <= 30 ? 's-pendiente' : 's-vigente'}`}>
              {diasBadge(d)}
            </span>;
          },
        },
        {
          key: 'status', label: 'Estado',
          render: (r) => {
            const auto = statusVigencia(r.polEnd) || r.status;
            return <span className={`badge ${statusClass(auto)}`}>{auto || '—'}</span>;
          },
        },
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
        { key: 'sysStart', label: 'Inicio del sistema', type: 'date' },
        { key: 'polStart', label: 'Inicio de póliza/garantía *', type: 'date' },
        { key: 'polEnd', label: 'Fin de póliza/garantía *', type: 'date' },
        { key: 'poliza', label: 'Tipo de póliza' },
        { key: 'zona', label: 'Zona' },
        { key: 'cuadrilla', label: 'Cuadrilla' },
      ]}
    />
  );
}
