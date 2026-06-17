import { useEffect, useState } from 'react';
import CrudPage from '../components/CrudPage';
import ImportButton from '../components/ImportButton';
import { erroresApi, importarApi } from '../api/endpoints';
import { priorityClass } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';

const BRANDS = ['HUAWEI', 'SUNGROW', 'SOLIS', 'SMA', 'FRONIUS', 'GROWATT', 'ENNEXOS', 'FUSION', 'GENERAL', 'OTRO'];
const CLASSIFICATIONS = ['INVERSOR', 'STRING', 'COMUNICACIÓN', 'MEDIDOR', 'BATERÍA', 'RED', 'OTRO'];
const PRIORITIES = ['Critico', 'Alta', 'Intermedia', 'Baja'];

export default function Errores() {
  const { hasRole } = useAuth();
  const toast = useToast();
  const [reloadKey, setReloadKey] = useState(0);
  const [diag, setDiag] = useState(null);
  const [recargando, setRecargando] = useState(false);

  // Diagnóstico automático al cargar
  useEffect(() => {
    erroresApi.diagnostico().then(setDiag).catch(() => {});
  }, [reloadKey]);

  const onRecargar = async () => {
    if (!await window.skyConfirm('Recargará los 201 códigos del Excel oficial.\n\n✓ Conservará TODOS los códigos que hayas creado manualmente.\n✓ Sólo actualiza los del catálogo oficial.\n\n¿Continuar?')) return;
    setRecargando(true);
    try {
      const r = await erroresApi.recargarCatalogo();
      toast(`✓ ${r.creados} nuevos · ${r.actualizados} actualizados · ${r.manualesIntactos} manuales intactos`);
      setReloadKey((k) => k + 1);
    } catch (e) {
      toast(e?.response?.data?.message || 'Error al recargar', 'error');
    } finally {
      setRecargando(false);
    }
  };

  const extra = hasRole('admin') ? (
    <>
      <a
        className="btn btn-sm"
        href="/templates/errores_full.xlsx"
        download
        title="Descarga la plantilla con todos los códigos catalogados"
      >
        📄 Plantilla
      </a>
      <button className="btn btn-sm" onClick={onRecargar} disabled={recargando}
        title="Re-aplica el catálogo oficial sin tocar tus códigos manuales">
        {recargando ? <span className="spinner" /> : '🔄 Recargar catálogo oficial'}
      </button>
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
      helpText={
        diag
          ? `📊 ${diag.totalEnBD} códigos en BD (${diag.manuales} manuales · ${diag.generales} generales) · ${diag.enArchivoSeed} en archivo seed. Por marca: ${Object.entries(diag.porMarca || {}).map(([k, v]) => `${k}:${v}`).join(', ') || '—'}. Los códigos manuales NUNCA se borran al hacer deploy.`
          : '201 códigos catalogados (HUAWEI, SUNGROW, SOLIS, SMA + 30 GENERAL). Los códigos manuales (creados desde esta página) NUNCA se borran en deploys.'
      }
      filters={[
        { key: 'brand', label: 'marcas', options: BRANDS },
        { key: 'classification', label: 'clasificaciones', options: CLASSIFICATIONS },
      ]}
      columns={[
        {
          key: 'brand', label: 'Marca',
          render: (r) => (
            <span>
              {r.brand}
              {(r.esGeneral || r.brand === 'GENERAL') && (
                <span style={{ background: '#dbeafe', color: '#1e40af', padding: '1px 6px', borderRadius: 8, fontSize: 9, fontWeight: 700, marginLeft: 4 }}>
                  🌐 GEN
                </span>
              )}
            </span>
          ),
        },
        { key: 'code', label: 'Código' },
        { key: 'equipment', label: 'Equipo' },
        { key: 'tipo', label: 'Tipo' },
        { key: 'problem', label: 'Problema' },
        { key: 'cause', label: 'Causa' },
        { key: 'solution', label: 'Solución' },
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
