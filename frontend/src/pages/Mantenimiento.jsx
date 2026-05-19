import CrudPage from '../components/CrudPage';
import { mantenimientoApi } from '../api/endpoints';
import { fmtDate } from '../utils/format';

const TIPOS = ['Preventivo', 'Correctivo', 'Limpieza', 'Inspección', 'Otro'];
const ESTADOS = ['Programado', 'En curso', 'Completado', 'Cancelado'];

export default function Mantenimiento() {
  return (
    <CrudPage
      title="Mantenimiento"
      api={mantenimientoApi}
      writeRoles={['admin', 'mantenimiento']}
      deleteRoles={['admin']}
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
        { key: 'cuadrilla', label: 'Cuadrilla' },
        { key: 'responsable', label: 'Responsable' },
        { key: 'descripcion', label: 'Descripción', type: 'textarea', full: true },
        { key: 'resultados', label: 'Resultados', type: 'textarea', full: true },
      ]}
    />
  );
}
