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
  const [classifying, setClassifying] = useState(false);

  const onAutoClasificar = async () => {
    if (!confirm(
      'Va a recorrer TODAS las pólizas y aplicar las reglas:\n\n' +
      '· Código con -FV → Tipo PV\n' +
      '· Código con -HB → Tipo Híbrido\n' +
      '· Código con -BT → Tipo BESS\n\n' +
      'Las que ya están bien clasificadas no se tocan.\n¿Continuar?'
    )) return;
    setClassifying(true);
    try {
      const r = await polizasApi.autoClasificar({ sobrescribir: true });
      alert(
        `✓ ${r.totalPolizas} pólizas analizadas\n\n` +
        `· ${r.cambios} actualizadas con tipo correcto\n` +
        `· ${r.sinCambio} ya estaban correctas\n` +
        `· ${r.sinCodigo} sin código (no aplica regla)\n\n` +
        `Las plantas PV ya aparecen en Revisión diaria SFV.`
      );
      setReloadKey((k) => k + 1);
    } catch (e) {
      alert(e?.response?.data?.message || 'Error al clasificar');
    } finally {
      setClassifying(false);
    }
  };

  const extra = hasRole('admin') ? (
    <>
      <a className="btn btn-sm" href="/templates/polizas_template.xlsx" download
         title="Descarga la plantilla con columnas y ejemplo">
        📄 Plantilla
      </a>
      <button className="btn btn-sm" onClick={onAutoClasificar} disabled={classifying}
        title="Aplica tipo PV/BESS/Híbrido según el código del proyecto"
        style={{
          background: '#dbeafe', color: '#1e40af', borderColor: '#bae6fd',
          fontWeight: 600,
        }}>
        {classifying ? <span className="spinner" /> : '⚡ Auto-clasificar PV/BESS/Híbrido'}
      </button>
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
      helpText={
        'Base maestra de proyectos. Reglas automáticas por código: ' +
        '-FV → PV · -HB → Híbrido · -BT → BESS. ' +
        'Usa "Auto-clasificar" para aplicar las reglas masivamente. ' +
        'Las plantas marcadas como PV o Híbrido aparecen automáticamente en Revisión diaria SFV.'
      }
      filters={[{ key: 'status', label: 'estados', options: ['Vigente', 'Por vencer', 'Vencida'] }]}
      columns={[
        { key: 'item', label: '#' },
        { key: 'grupo', label: 'Grupo' },
        { key: 'project', label: 'Proyecto' },
        { key: 'code', label: 'Código' },
        { key: 'platform', label: 'Plataforma' },
        {
          key: 'poliza', label: 'Tipo',
          render: (r) => {
            const t = (r.poliza || '').trim();
            const styles = {
              'PV':       { bg: '#dbeafe', fg: '#1e40af' },
              'BESS':     { bg: '#fef3c7', fg: '#92400e' },
              'Híbrido':  { bg: '#e9d5ff', fg: '#6b21a8' },
              'Hibrido':  { bg: '#e9d5ff', fg: '#6b21a8' },
            };
            const s = styles[t] || { bg: '#f3f4f6', fg: '#6b7280' };
            if (!t) return <span style={{ color: 'var(--gray-400)', fontSize: 11 }}>sin tipo</span>;
            return (
              <span style={{
                background: s.bg, color: s.fg,
                padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700,
              }}>{t}</span>
            );
          },
        },
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
