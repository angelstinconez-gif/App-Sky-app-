import { useState } from 'react';
import CrudPage from '../components/CrudPage';
import { tecnicosApi, cuadrillasApi } from '../api/endpoints';
import { useEffect } from 'react';

const ROLES = ['Líder', 'Técnico', 'Auxiliar', 'Electricista', 'Mantenimiento', 'Especialista'];
const ZONAS = ['Norte', 'Sur', 'Centro', 'Bajío', 'Península', 'Noreste', 'Noroeste', 'Sureste', 'Otra'];

export default function Tecnicos() {
  const [cuadrillas, setCuadrillas] = useState([]);
  useEffect(() => { cuadrillasApi.list().then(setCuadrillas).catch(() => {}); }, []);

  return (
    <CrudPage
      title="Directorio de técnicos"
      api={tecnicosApi}
      writeRoles={['admin', 'operator']}
      deleteRoles={['admin']}
      helpText="Personal asignable a cuadrillas y tickets. Al crear una cuadrilla, los miembros y el líder se eligen de aquí."
      filters={[
        { key: 'rol', label: 'roles', options: ROLES },
        { key: 'zona', label: 'zonas', options: ZONAS },
      ]}
      columns={[
        { key: 'nombre', label: 'Nombre' },
        { key: 'rol', label: 'Rol' },
        { key: 'telefono', label: 'Teléfono' },
        { key: 'email', label: 'Email' },
        { key: 'cuadrillaNombre', label: 'Cuadrilla' },
        { key: 'zona', label: 'Zona' },
        { key: 'activo', label: 'Activo', render: (r) => (r.activo === false ? '—' : '✓') },
      ]}
      formFields={[
        { key: 'nombre', label: 'Nombre completo', required: true },
        { key: 'telefono', label: 'Teléfono' },
        { key: 'email', label: 'Correo' },
        { key: 'rol', label: 'Rol', type: 'select', options: ROLES },
        {
          key: 'cuadrillaId', label: 'Cuadrilla asignada', type: 'select',
          options: [{ value: '', label: '— Sin asignar —' }, ...cuadrillas.map((c) => ({ value: c.id, label: c.nombre }))],
        },
        { key: 'zona', label: 'Zona', type: 'select', options: ZONAS },
        { key: 'notas', label: 'Notas', type: 'textarea', full: true },
      ]}
    />
  );
}
