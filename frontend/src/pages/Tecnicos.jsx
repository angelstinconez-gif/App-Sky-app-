import { useEffect, useState } from 'react';
import CrudPage from '../components/CrudPage';
import { tecnicosApi, cuadrillasApi, polizasApi } from '../api/endpoints';

const ROLES = ['Líder', 'Técnico', 'Auxiliar', 'Electricista', 'Mantenimiento', 'Especialista'];

export default function Tecnicos() {
  const [cuadrillas, setCuadrillas] = useState([]);
  const [zonas, setZonas] = useState([]);

  useEffect(() => {
    cuadrillasApi.list().then(setCuadrillas).catch(() => {});
    polizasApi.zonas().then(setZonas).catch(() => setZonas([]));
  }, []);

  return (
    <CrudPage
      title="Directorio de técnicos"
      api={tecnicosApi}
      writeRoles={['admin', 'operator']}
      deleteRoles={['admin']}
      helpText="Personal asignable a cuadrillas y tickets. Las zonas se sincronizan automáticamente con las de las Pólizas."
      filters={[
        { key: 'rol', label: 'roles', options: ROLES },
        { key: 'zona', label: 'zonas', options: zonas },
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
        { key: 'zona', label: 'Zona (de pólizas)', type: 'select', options: zonas },
        { key: 'notas', label: 'Notas', type: 'textarea', full: true },
      ]}
    />
  );
}
