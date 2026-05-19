import CrudPage from '../components/CrudPage';
import { usersApi } from '../api/endpoints';
import { fmtDateTime } from '../utils/format';

const ROLES = ['admin', 'operator', 'mantenimiento'];

export default function Usuarios() {
  return (
    <CrudPage
      title="Usuarios"
      api={usersApi}
      writeRoles={['admin']}
      deleteRoles={['admin']}
      defaults={{ role: 'operator', active: true }}
      columns={[
        { key: 'name', label: 'Nombre' },
        { key: 'email', label: 'Email' },
        { key: 'role', label: 'Rol' },
        { key: 'active', label: 'Activo', render: (r) => (r.active ? '✓' : '—') },
        { key: 'last_login', label: 'Último ingreso', render: (r) => fmtDateTime(r.last_login) },
      ]}
      formFields={[
        { key: 'name', label: 'Nombre', required: true },
        { key: 'email', label: 'Email', type: 'email', required: true },
        { key: 'password', label: 'Contraseña (mín. 6)', type: 'password' },
        { key: 'role', label: 'Rol', type: 'select', options: ROLES },
        { key: 'initials', label: 'Iniciales (2 letras)' },
      ]}
    />
  );
}
