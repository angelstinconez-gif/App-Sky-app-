import CrudPage from '../components/CrudPage';
import { erroresApi } from '../api/endpoints';
import { priorityClass } from '../utils/format';

const BRANDS = ['HUAWEI', 'SUNGROW', 'SOLIS', 'SMA', 'FRONIUS', 'GROWATT', 'ENNEXOS', 'FUSION', 'OTRO'];
const CLASSIFICATIONS = ['INVERSOR', 'STRING', 'COMUNICACIÓN', 'MEDIDOR', 'BATERÍA', 'RED', 'OTRO'];
const PRIORITIES = ['Critico', 'Alta', 'Intermedia', 'Baja'];

export default function Errores() {
  return (
    <CrudPage
      title="Catálogo de errores"
      api={erroresApi}
      writeRoles={['admin']}
      deleteRoles={['admin']}
      filters={[
        { key: 'brand', label: 'marcas', options: BRANDS },
        { key: 'classification', label: 'clasificaciones', options: CLASSIFICATIONS },
      ]}
      columns={[
        { key: 'brand', label: 'Marca' },
        { key: 'code', label: 'Código' },
        { key: 'classification', label: 'Clasificación' },
        { key: 'problem', label: 'Problema' },
        { key: 'cause', label: 'Causa' },
        { key: 'priority', label: 'Prioridad', render: (r) => <span className={`badge ${priorityClass(r.priority)}`}>{r.priority || '—'}</span> },
      ]}
      formFields={[
        { key: 'brand', label: 'Marca', type: 'select', options: BRANDS, required: true },
        { key: 'code', label: 'Código', required: true },
        { key: 'classification', label: 'Clasificación', type: 'select', options: CLASSIFICATIONS },
        { key: 'priority', label: 'Prioridad', type: 'select', options: PRIORITIES },
        { key: 'problem', label: 'Problema' },
        { key: 'cause', label: 'Causa', type: 'textarea', full: true },
        { key: 'solution', label: 'Solución', type: 'textarea', full: true },
      ]}
    />
  );
}
