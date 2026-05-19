import CrudPage from '../components/CrudPage';
import { directorioApi } from '../api/endpoints';

const CATEGORIAS = ['Cliente', 'Proveedor', 'Técnico', 'Interno', 'Distribuidor', 'Operador'];

export default function Directorio() {
  return (
    <CrudPage
      title="Directorio"
      api={directorioApi}
      writeRoles={['admin', 'operator']}
      deleteRoles={['admin']}
      filters={[{ key: 'category', label: 'categorías', options: CATEGORIAS }]}
      columns={[
        { key: 'name', label: 'Nombre' },
        { key: 'role', label: 'Rol' },
        { key: 'company', label: 'Empresa' },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Teléfono' },
        { key: 'category', label: 'Categoría' },
      ]}
      formFields={[
        { key: 'name', label: 'Nombre', required: true },
        { key: 'role', label: 'Rol / Cargo' },
        { key: 'company', label: 'Empresa' },
        { key: 'email', label: 'Email', type: 'email' },
        { key: 'phone', label: 'Teléfono' },
        { key: 'category', label: 'Categoría', type: 'select', options: CATEGORIAS },
        { key: 'notes', label: 'Notas', type: 'textarea', full: true },
      ]}
    />
  );
}
