import { useEffect, useMemo, useState } from 'react';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import ImportButton from '../components/ImportButton';
import { directorioApi, polizasApi, importarApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { downloadXLSX } from '../utils/format';

const CATEGORIAS = ['Cliente', 'Proveedor', 'Técnico', 'Interno', 'Distribuidor', 'Mantenimiento'];
const SYSTEM_TYPES = ['PV', 'BESS', 'Híbrido'];

const empty = {
  project: '', projectCode: '', systemType: '', category: 'Mantenimiento',
  maintContact: '', maintPhone: '', maintContact2: '', maintPhone2: '', maintEmail: '',
  internalPm: '', internalPhone: '',
  clientName: '', clientCompany: '', clientPhone: '', clientEmail: '',
  notes: '',
};

// Deriva el tipo de sistema desde el código de pólizas: BT=BESS, FV=PV, HB=Híbrido
function systemFromCode(code) {
  if (!code) return '';
  const c = code.toUpperCase();
  if (c.includes('-BT')) return 'BESS';
  if (c.includes('-FV')) return 'PV';
  if (c.includes('-HB')) return 'Híbrido';
  return '';
}

export default function Directorio() {
  const { hasRole } = useAuth();
  const toast = useToast();
  const canWrite = hasRole('admin', 'operator');
  const canDelete = hasRole('admin');

  const [items, setItems] = useState([]);
  const [polizas, setPolizas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);

  const load = () => {
    setLoading(true);
    directorioApi.list({ q, category })
      .then(setItems)
      .catch(() => toast('Error al cargar', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [q, category]);

  useEffect(() => {
    polizasApi.list().then(setPolizas).catch(() => {});
  }, []);

  // ─── Auto-fill desde Pólizas cuando se selecciona / escribe un proyecto ───
  const onProjectChange = (value) => {
    setForm((f) => ({ ...f, project: value }));
    const match = polizas.find(
      (p) =>
        p.project?.toLowerCase() === value.toLowerCase() ||
        p.code?.toLowerCase() === value.toLowerCase()
    );
    if (match) {
      setForm((f) => ({
        ...f,
        project: match.project,
        projectCode: match.code || f.projectCode,
        systemType: f.systemType || systemFromCode(match.code) || (match.poliza?.includes('BESS') ? 'BESS' : 'PV'),
        clientCompany: f.clientCompany || match.grupo,
        category: f.category || (match.grupo ? 'Cliente' : 'Mantenimiento'),
      }));
    }
  };

  const onNew = () => { setForm(empty); setEditingId(null); setOpen(true); };
  const onEdit = (row) => { setForm({ ...empty, ...row }); setEditingId(row.id); setOpen(true); };
  const onSave = async () => {
    if (!form.project) return toast('El proyecto es obligatorio', 'error');
    try {
      if (editingId) await directorioApi.update(editingId, form);
      else await directorioApi.create(form);
      toast(editingId ? 'Actualizado' : 'Creado');
      setOpen(false); load();
    } catch (e) {
      toast(e?.response?.data?.message || 'Error al guardar', 'error');
    }
  };
  const onDelete = async (id) => {
    if (!confirm('¿Eliminar este contacto?')) return;
    await directorioApi.remove(id);
    toast('Eliminado'); load();
  };

  const columns = useMemo(() => {
    const cols = [
      { key: 'project', label: 'Proyecto' },
      { key: 'projectCode', label: 'Código' },
      { key: 'systemType', label: 'Sistema' },
      { key: 'maintContact', label: 'Contacto Mantto' },
      { key: 'maintPhone', label: 'Tel. Mantto' },
      { key: 'clientName', label: 'Cliente' },
      { key: 'clientCompany', label: 'Empresa Cliente' },
      { key: 'clientEmail', label: 'Email Cliente' },
    ];
    if (canWrite || canDelete) {
      cols.push({
        key: '_actions', label: 'Acciones', sortable: false,
        render: (r) => (
          <div style={{ display: 'flex', gap: 4 }}>
            {canWrite && <button className="btn btn-sm" onClick={() => onEdit(r)}>Editar</button>}
            {canDelete && <button className="btn btn-sm btn-danger" onClick={() => onDelete(r.id)}>×</button>}
          </div>
        ),
      });
    }
    return cols;
  }, [canWrite, canDelete]);

  return (
    <div>
      <div className="section-header">
        <h2>Directorio</h2>
        <span style={{ color: 'var(--gray-400)', fontSize: 12 }}>{items.length} registros</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {hasRole('admin') && (
            <>
              <a className="btn btn-sm" href="/templates/directorio_full.xlsx" download
                 title="156 contactos del Excel original">
                📄 Plantilla
              </a>
              <ImportButton uploader={importarApi.directorio} onDone={load} />
            </>
          )}
          <button className="btn btn-sm" onClick={() => downloadXLSX(items, 'Directorio', `directorio_${Date.now()}.xlsx`)}>
            ⬇ Exportar
          </button>
          {canWrite && <button className="btn btn-sm btn-primary" onClick={onNew}>+ Nuevo</button>}
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 12 }}>
        Contactos por proyecto. Al elegir un proyecto del listado se auto-llenan código, tipo de sistema y empresa cliente desde Pólizas.
        {items.length === 0 && (
          <span style={{ color: 'var(--amber)', fontWeight: 600 }}>
            {' '}Para cargar los 156 contactos del Excel maestro: <strong>1)</strong> Descarga "📄 Plantilla", <strong>2)</strong> pulsa "📥 Importar Excel" y selecciona ese mismo archivo.
          </span>
        )}
      </div>

      <div className="filters-bar">
        <input className="filter-input search-input" placeholder="Buscar proyecto, contacto, email..."
          value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="filter-select" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Todas las categorías</option>
          {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      {loading ? <div className="empty"><span className="spinner" /></div> : <DataTable columns={columns} data={items} />}

      <Modal
        open={open} onClose={() => setOpen(false)}
        title={editingId ? `Editar contacto` : 'Nuevo contacto'}
        wide
        footer={
          <>
            <button className="btn" onClick={() => setOpen(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={onSave}>Guardar</button>
          </>
        }
      >
        <div className="form-grid">
          {/* ─── Selección de proyecto con datalist ─── */}
          <FormRow label="Proyecto *" full>
            <input
              list="dir-projects"
              value={form.project}
              onChange={(e) => onProjectChange(e.target.value)}
              placeholder={polizas.length ? `Empieza a escribir (${polizas.length} proyectos cargados)…` : 'Carga pólizas primero o escribe libre'}
            />
            <datalist id="dir-projects">
              {polizas.map((p) => (
                <option key={p.id} value={p.project}>
                  {p.code} — {p.grupo}
                </option>
              ))}
            </datalist>
            <div style={{ fontSize: 11, color: 'var(--sky-dark)', marginTop: 4 }}>
              💡 Selecciona del listado para auto-llenar código, tipo de sistema y empresa cliente.
            </div>
          </FormRow>

          <FormRow label="Código de proyecto (auto)">
            <input value={form.projectCode} onChange={(e) => setForm({ ...form, projectCode: e.target.value })} />
          </FormRow>
          <FormRow label="Tipo de sistema (auto)">
            <select value={form.systemType} onChange={(e) => setForm({ ...form, systemType: e.target.value })}>
              <option value="">—</option>
              {SYSTEM_TYPES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </FormRow>
          <FormRow label="Categoría (auto)">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </FormRow>

          {/* ─── Mantenimiento ─── */}
          <FormRow label="Contacto Mantto en sitio" full>
            <input value={form.maintContact} onChange={(e) => setForm({ ...form, maintContact: e.target.value })} />
          </FormRow>
          <FormRow label="Teléfono Mantto">
            <input value={form.maintPhone} onChange={(e) => setForm({ ...form, maintPhone: e.target.value })} />
          </FormRow>
          <FormRow label="Email Mantto">
            <input type="email" value={form.maintEmail} onChange={(e) => setForm({ ...form, maintEmail: e.target.value })} />
          </FormRow>

          <FormRow label="2° Contacto Mantto">
            <input value={form.maintContact2} onChange={(e) => setForm({ ...form, maintContact2: e.target.value })} />
          </FormRow>
          <FormRow label="2° Teléfono Mantto">
            <input value={form.maintPhone2} onChange={(e) => setForm({ ...form, maintPhone2: e.target.value })} />
          </FormRow>

          {/* ─── PM Interno ─── */}
          <FormRow label="PM Interno">
            <input value={form.internalPm} onChange={(e) => setForm({ ...form, internalPm: e.target.value })} />
          </FormRow>
          <FormRow label="Teléfono PM">
            <input value={form.internalPhone} onChange={(e) => setForm({ ...form, internalPhone: e.target.value })} />
          </FormRow>

          {/* ─── Cliente ─── */}
          <FormRow label="Nombre del cliente">
            <input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
          </FormRow>
          <FormRow label="Empresa del cliente (auto)">
            <input value={form.clientCompany} onChange={(e) => setForm({ ...form, clientCompany: e.target.value })} />
          </FormRow>
          <FormRow label="Teléfono cliente">
            <input value={form.clientPhone} onChange={(e) => setForm({ ...form, clientPhone: e.target.value })} />
          </FormRow>
          <FormRow label="Email cliente">
            <input type="email" value={form.clientEmail} onChange={(e) => setForm({ ...form, clientEmail: e.target.value })} />
          </FormRow>

          <FormRow label="Notas" full>
            <textarea rows="2" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </FormRow>
        </div>
      </Modal>
    </div>
  );
}

function FormRow({ label, full, children }) {
  return (
    <div className={`form-row ${full ? 'full' : ''}`}>
      <label>{label}</label>
      {children}
    </div>
  );
}
