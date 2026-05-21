import { useEffect, useMemo, useState } from 'react';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { cuadrillasApi, tecnicosApi } from '../api/endpoints';
import { downloadXLSX } from '../utils/format';

const ZONAS = [
  'Península', 'Metropolitana', 'Especial', 'Monterrey', 'Tizayuca', 'Proveedor',
  'Yucatán', 'Quintana Roo', 'Oaxaca', 'Veracruz', 'Otra',
];

const empty = { nombre: '', zona: '', liderId: '', telefono: '', miembrosIds: [], notes: '' };

export default function Cuadrillas() {
  const { hasRole } = useAuth();
  const toast = useToast();
  const canWrite = hasRole('admin', 'operator');
  const canDelete = hasRole('admin');

  const [items, setItems] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [zona, setZona] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);

  const load = () => {
    setLoading(true);
    cuadrillasApi.list({ zona }).then(setItems).catch(() => toast('Error al cargar', 'error')).finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [zona]);
  useEffect(() => { tecnicosApi.list().then(setTecnicos).catch(() => {}); }, []);

  // ── Cuando se elige líder, auto-llenar teléfono ──
  const onLiderChange = (id) => {
    const t = tecnicos.find((x) => String(x.id) === String(id));
    setForm((f) => ({
      ...f,
      liderId: id,
      telefono: t?.telefono || f.telefono,
      // Asegurar que el líder también esté en miembros
      miembrosIds: id && !f.miembrosIds.includes(Number(id))
        ? [...f.miembrosIds, Number(id)]
        : f.miembrosIds,
    }));
  };

  const toggleMember = (id) => {
    const n = Number(id);
    setForm((f) => ({
      ...f,
      miembrosIds: f.miembrosIds.includes(n)
        ? f.miembrosIds.filter((x) => x !== n)
        : [...f.miembrosIds, n],
    }));
  };

  const onNew = () => { setForm({ ...empty }); setEditingId(null); setOpen(true); };
  const onEdit = (row) => {
    setForm({
      nombre: row.nombre || '',
      zona: row.zona || '',
      liderId: row.liderId || '',
      telefono: row.telefono || '',
      miembrosIds: row.miembrosIds || [],
      notes: row.notes || '',
    });
    setEditingId(row.id);
    setOpen(true);
  };
  const onSave = async () => {
    if (!form.nombre) return toast('El nombre es obligatorio', 'error');
    try {
      if (editingId) await cuadrillasApi.update(editingId, form);
      else await cuadrillasApi.create(form);
      toast(editingId ? 'Actualizada' : 'Creada'); setOpen(false); load();
    } catch (e) { toast(e?.response?.data?.message || 'Error al guardar', 'error'); }
  };
  const onDelete = async (id) => {
    if (!confirm('¿Eliminar esta cuadrilla?')) return;
    await cuadrillasApi.remove(id); toast('Eliminada'); load();
  };

  const columns = useMemo(() => [
    { key: 'nombre', label: 'Nombre' },
    { key: 'zona', label: 'Zona' },
    { key: 'lider', label: 'Líder' },
    { key: 'telefono', label: 'Tel. líder' },
    {
      key: 'miembrosData', label: 'Miembros',
      render: (r) => (r.miembrosData || []).map((m) => m.nombre).join(', ') || '—',
    },
    {
      key: '_actions', label: 'Acciones', sortable: false,
      render: (r) => (
        <div style={{ display: 'flex', gap: 4 }}>
          {canWrite && <button className="btn btn-sm" onClick={() => onEdit(r)}>Editar</button>}
          {canDelete && <button className="btn btn-sm btn-danger" onClick={() => onDelete(r.id)}>×</button>}
        </div>
      ),
    },
  ], [canWrite, canDelete, tecnicos]);

  // Filtrar técnicos por zona de la cuadrilla (para sugerir)
  const tecnicosFiltrados = useMemo(() => {
    if (!form.zona) return tecnicos;
    return tecnicos.filter((t) => !t.zona || t.zona === form.zona);
  }, [form.zona, tecnicos]);

  return (
    <div>
      <div className="section-header">
        <h2>Cuadrillas</h2>
        <span style={{ color: 'var(--gray-400)', fontSize: 12 }}>{items.length} registros</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn btn-sm" onClick={() => downloadXLSX(items, 'Cuadrillas', `cuadrillas_${Date.now()}.xlsx`)}>⬇ Exportar</button>
          {canWrite && <button className="btn btn-sm btn-primary" onClick={onNew}>+ Nueva</button>}
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 12 }}>
        Líder y miembros se eligen del Directorio de Técnicos. Al seleccionar líder, el teléfono se autocompleta.
      </div>

      <div className="filters-bar">
        <select className="filter-select" value={zona} onChange={(e) => setZona(e.target.value)}>
          <option value="">Todas las zonas</option>
          {ZONAS.map((z) => <option key={z}>{z}</option>)}
        </select>
      </div>

      {loading ? <div className="empty"><span className="spinner" /></div> : <DataTable columns={columns} data={items} />}

      <Modal
        open={open} onClose={() => setOpen(false)}
        title={editingId ? `Editar cuadrilla #${editingId}` : 'Nueva cuadrilla'}
        wide
        footer={
          <>
            <button className="btn" onClick={() => setOpen(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={onSave}>Guardar</button>
          </>
        }
      >
        <div className="form-grid">
          <FormRow label="Nombre *">
            <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </FormRow>
          <FormRow label="Zona">
            <select value={form.zona} onChange={(e) => setForm({ ...form, zona: e.target.value })}>
              <option value="">—</option>
              {ZONAS.map((z) => <option key={z}>{z}</option>)}
            </select>
          </FormRow>

          <FormRow label="Líder (técnico)">
            <select value={form.liderId} onChange={(e) => onLiderChange(e.target.value)}>
              <option value="">— Elegir —</option>
              {tecnicosFiltrados.map((t) => (
                <option key={t.id} value={t.id}>{t.nombre} {t.rol ? `(${t.rol})` : ''}</option>
              ))}
            </select>
          </FormRow>
          <FormRow label="Teléfono líder (auto)">
            <input value={form.telefono || ''} readOnly className="readonly-auto"
              onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
          </FormRow>

          <FormRow label={`Miembros (${form.miembrosIds.length} seleccionados)`} full>
            <div style={{
              maxHeight: 220, overflowY: 'auto', border: '1px solid var(--gray-200, #e5e7eb)',
              borderRadius: 8, padding: 8, background: 'var(--card-bg, #fff)',
            }}>
              {tecnicosFiltrados.length === 0 && (
                <div style={{ color: 'var(--gray-400)', fontSize: 12 }}>
                  No hay técnicos registrados {form.zona ? `en zona ${form.zona}` : ''}. Crea primero en "Técnicos".
                </div>
              )}
              {tecnicosFiltrados.map((t) => (
                <label key={t.id} style={{
                  display: 'flex', gap: 8, alignItems: 'center', padding: '4px 6px',
                  fontSize: 13, cursor: 'pointer',
                }}>
                  <input
                    type="checkbox"
                    checked={form.miembrosIds.includes(t.id)}
                    onChange={() => toggleMember(t.id)}
                  />
                  <strong>{t.nombre}</strong>
                  <span style={{ color: 'var(--gray-500)', fontSize: 11 }}>
                    {t.rol || ''} {t.telefono ? `• ${t.telefono}` : ''} {t.zona ? `• ${t.zona}` : ''}
                  </span>
                </label>
              ))}
            </div>
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
