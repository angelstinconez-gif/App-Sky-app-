import { useState } from 'react';
import CrudPage from '../components/CrudPage';
import ImportButton from '../components/ImportButton';
import { erroresApi, importarApi } from '../api/endpoints';
import { priorityClass } from '../utils/format';
import { useAuth } from '../context/AuthContext';

const BRANDS = ['HUAWEI', 'SUNGROW', 'SOLIS', 'SMA', 'FRONIUS', 'GROWATT', 'ENNEXOS', 'FUSION', 'OTRO'];
const CLASSIFICATIONS = ['INVERSOR', 'STRING', 'COMUNICACIÓN', 'MEDIDOR', 'BATERÍA', 'RED', 'OTRO'];
const PRIORITIES = ['Critico', 'Alta', 'Intermedia', 'Baja'];

export default function Errores() {
  const { hasRole } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);

  const extra = hasRole('admin') ? (
    <>
      <a
        className="btn btn-sm"
        href="/templates/errores_full.xlsx"
        download
        title="Descarga el catálogo completo del Excel original (129 códigos)"
      >
        📄 Plantilla / catálogo completo
      </a>
      <ImportButton
        uploader={importarApi.errores}
        onDone={() => setReloadKey((k) => k + 1)}
        label="📥 Importar Excel"
      />
    </>
  ) : null;

  return (
    <CrudPage
      key={reloadKey}
      title="Catálogo de errores"
      api={erroresApi}
      writeRoles={['admin']}
      deleteRoles={['admin']}
      extraActions={extra}
      helpText="Códigos por fabricante (HUAWEI, SUNGROW, SOLIS, SMA). Si la base aparece vacía: 1) Click '📄 Plantilla / catálogo completo' para bajar el Excel con los 129 códigos, 2) Click '📥 Importar Excel' y selecciona el archivo recién descargado."
      filters={[
        { key: 'brand', label: 'marcas', options: BRANDS },
        { key: 'classification', label: 'clasificaciones', options: CLASSIFICATIONS },
      ]}
      columns={[
        { key: 'brand', label: 'Marca' },
        { key: 'code', label: 'Código' },
        { key: 'equipment', label: 'Equipo' },
        { key: 'tipo', label: 'Tipo' },
        { key: 'problem', label: 'Problema' },
        { key: 'cause', label: 'Causa' },
        { key: 'priority', label: 'Prioridad', render: (r) => <span className={`badge ${priorityClass(r.priority)}`}>{r.priority || '—'}</span> },
      ]}
      formFields={[
        { key: 'brand', label: 'Marca', type: 'select', options: BRANDS, required: true },
        { key: 'code', label: 'Código', required: true },
        { key: 'equipment', label: 'Equipo (modelo)' },
        { key: 'classification', label: 'Clasificación', type: 'select', options: CLASSIFICATIONS },
        { key: 'tipo', label: 'Tipo' },
        { key: 'priority', label: 'Prioridad', type: 'select', options: PRIORITIES },
        { key: 'problem', label: 'Problema' },
        { key: 'cause', label: 'Causa', type: 'textarea', full: true },
        { key: 'solution', label: 'Solución', type: 'textarea', full: true },
        { key: 'impact', label: 'Impacto operativo', type: 'textarea', full: true },
        { key: 'sourceUrl', label: 'URL fuente' },
      ]}
    />
  );
}
