import CrudPage from '../components/CrudPage';
import { cuadrillasApi } from '../api/endpoints';

const ZONAS = [
  'Península', 'Metropolitana', 'Especial', 'Monterrey', 'Tizayuca', 'Proveedor',
  'Yucatán', 'Quintana Roo', 'Oaxaca', 'Veracruz', 'Otra',
];

export default function Cuadrillas() {
  return (
    <CrudPage
      title="Cuadrillas"
      api={cuadrillasApi}
      writeRoles={['admin', 'operator']}
      deleteRoles={['admin']}
      filters={[{ key: 'zona', label: 'zonas', options: ZONAS }]}
      columns={[
        { key: 'nombre', label: 'Nombre' },
        { key: 'zona', label: 'Zona' },
        { key: 'lider', label: 'Líder' },
        { key: 'telefono', label: 'Teléfono' },
        { key: 'miembros', label: 'Miembros' },
      ]}
      formFields={[
        { key: 'nombre', label: 'Nombre', required: true },
        { key: 'zona', label: 'Zona', type: 'select', options: ZONAS },
        { key: 'lider', label: 'Líder' },
        { key: 'telefono', label: 'Teléfono' },
        { key: 'miembros', label: 'Miembros', type: 'textarea', full: true },
        { key: 'notes', label: 'Notas', type: 'textarea', full: true },
      ]}
    />
  );
}
