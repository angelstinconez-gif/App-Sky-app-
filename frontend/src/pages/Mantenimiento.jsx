import { useEffect, useState } from 'react';
import CrudPage from '../components/CrudPage';
import ImportButton from '../components/ImportButton';
import { mantenimientoApi, importarApi, assigneesApi } from '../api/endpoints';
import { fmtDate } from '../utils/format';
import { useAuth } from '../context/AuthContext';

const TIPOS = ['Preventivo', 'Correctivo', 'Limpieza', 'Inspección', 'Otro'];
const ESTADOS = ['Programado', 'En curso', 'Completado', 'Cancelado'];

export default function Mantenimiento() {
  const { hasRole } = useAuth();
  const [assignees, setAssignees] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    assigneesApi.list().then(setAssignees).catch(() => {});
  }, []);

  const extra = hasRole('admin') ? (
    <ImportButton uploader={importarApi.mantenimiento} onDone={() => setReloadKey((k) => k + 1)} />
  ) : null;

  // Las opciones de cuadrilla salen del catálogo de assignees
  const cuadrillaOptions = assignees.filter((a) => a.type === 'cuadrilla').map((a) => a.value);
  const responsableOptions = assignees.filter((a) => a.type === 'user').map((a) => a.value);

  return (
    <CrudPage
      key={reloadKey}
      title="Mantenimiento"
      api={mantenimientoApi}
      writeRoles={['admin', 'mantenimiento']}
      deleteRoles={['admin']}
      extraActions={extra}
      helpText="🔔 Al crear o cambiar estado, se enviará una notificación a usuarios suscritos (WhatsApp / Push)."
      filters={[
        { key: 'estado', label: 'estados', options: ESTADOS },
        { key: 'tipo', label: 'tipos', options: TIPOS },
      ]}
      columns={[
        { key: 'project', label: 'Proyecto' },
        { key: 'code', label: 'Código' },
        { key: 'tipo', label: 'Tipo' },
        { key: 'estado', label: 'Estado' },
        { key: 'fechaProgramada', label: 'Programado', render: (r) => fmtDate(r.fechaProgramada) },
        { key: 'fechaEjecutada', label: 'Ejecutado', render: (r) => fmtDate(r.fechaEjecutada) },
        { key: 'cuadrilla', label: 'Cuadrilla' },
        { key: 'responsable', label: 'Responsable' },
      ]}
      formFields={[
        { key: 'project', label: 'Proyecto', required: true },
        { key: 'code', label: 'Código' },
        { key: 'tipo', label: 'Tipo', type: 'select', options: TIPOS },
        { key: 'estado', label: 'Estado', type: 'select', options: ESTADOS },
        { key: 'fechaProgramada', label: 'Fecha programada', type: 'date' },
        { key: 'fechaEjecutada', label: 'Fecha ejecutada', type: 'date' },
        { key: 'cuadrilla', label: 'Cuadrilla', type: 'select', options: cuadrillaOptions },
        { key: 'responsable', label: 'Responsable', type: 'select', options: responsableOptions },
        { key: 'descripcion', label: 'Descripción', type: 'textarea', full: true },
        { key: 'resultados', label: 'Resultados', type: 'textarea', full: true },
      ]}
    />
  );
}
