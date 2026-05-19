import { useEffect, useState } from 'react';
import CrudPage from '../components/CrudPage';
import ImportButton from '../components/ImportButton';
import { directorioApi, importarApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';

const CATEGORIAS = ['Cliente', 'Proveedor', 'Técnico', 'Interno', 'Distribuidor', 'Mantenimiento'];
const SYSTEM_TYPES = ['PV', 'BESS', 'Híbrido'];

export default function Directorio() {
  const { hasRole } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);

  const extra = hasRole('admin') ? (
    <ImportButton uploader={importarApi.directorio} onDone={() => setReloadKey((k) => k + 1)} />
  ) : null;

  return (
    <CrudPage
      key={reloadKey}
      title="Directorio"
      api={directorioApi}
      writeRoles={['admin', 'operator']}
      deleteRoles={['admin']}
      extraActions={extra}
      helpText="Contactos por proyecto (mantenimiento + cliente). Importa desde el Excel maestro DIRECTORIO.xlsm."
      filters={[{ key: 'category', label: 'categorías', options: CATEGORIAS }]}
      columns={[
        { key: 'project', label: 'Proyecto' },
        { key: 'projectCode', label: 'Código' },
        { key: 'systemType', label: 'Sistema' },
        { key: 'maintContact', label: 'Contacto Mantto' },
        { key: 'maintPhone', label: 'Tel. Mantto' },
        { key: 'clientName', label: 'Cliente' },
        { key: 'clientCompany', label: 'Empresa Cliente' },
        { key: 'clientEmail', label: 'Email Cliente' },
      ]}
      formFields={[
        { key: 'project', label: 'Proyecto', required: true },
        { key: 'projectCode', label: 'Código de proyecto' },
        { key: 'systemType', label: 'Tipo de sistema', type: 'select', options: SYSTEM_TYPES },
        { key: 'category', label: 'Categoría', type: 'select', options: CATEGORIAS },

        // Contacto de mantenimiento
        { key: 'maintContact', label: 'Contacto Mantenimiento en sitio' },
        { key: 'maintPhone', label: 'Teléfono Mantto' },
        { key: 'maintContact2', label: '2° Contacto Mantto' },
        { key: 'maintPhone2', label: '2° Teléfono Mantto' },
        { key: 'maintEmail', label: 'Email Mantto', type: 'email' },

        // PM interno
        { key: 'internalPm', label: 'PM Interno' },
        { key: 'internalPhone', label: 'Teléfono PM' },

        // Cliente / Empresa
        { key: 'clientName', label: 'Nombre del cliente' },
        { key: 'clientCompany', label: 'Empresa del cliente' },
        { key: 'clientPhone', label: 'Teléfono cliente' },
        { key: 'clientEmail', label: 'Email cliente', type: 'email' },

        { key: 'notes', label: 'Notas', type: 'textarea', full: true },
      ]}
    />
  );
}
