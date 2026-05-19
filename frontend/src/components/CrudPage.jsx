import { useEffect, useMemo, useState } from 'react';
import DataTable from './DataTable';
import Modal from './Modal';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import { downloadXLSX } from '../utils/format';

/**
 * Página CRUD genérica. Props:
 *   title:      string
 *   api:        { list, create, update, remove }
 *   columns:    columnas DataTable
 *   formFields: [{ key, label, type, options?, full?, required? }]
 *   filters:    [{ key, label, options, placeholder }]   (opcional)
 *   searchKey:  string (query param para búsqueda libre)
 *   writeRoles: ['admin', ...]
 *   deleteRoles:['admin']
 *   defaults:   objeto con valores por defecto
 */
export default function CrudPage({
  title,
  api,
  columns,
  formFields,
  filters = [],
  searchKey = 'q',
  writeRoles = ['admin'],
  deleteRoles = ['admin'],
  defaults = {},
  exportName,
}) {
  const { hasRole } = useAuth();
  const toast = useToast();
  const canWrite = hasRole(...writeRoles);
  const canDelete = hasRole(...deleteRoles);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterValues, setFilterValues] = useState({});
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(defaults);
  const [editingId, setEditingId] = useState(null);

  const params = useMemo(() => {
    const p = { ...filterValues };
    if (search) p[searchKey] = search;
    return p;
  }, [filterValues, search, searchKey]);

  const load = () => {
    setLoading(true);
    api.list(params).then(setItems).catch(() => toast('Error al cargar', 'error')).finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [JSON.stringify(params)]);

  const onNew = () => { setForm({ ...defaults }); setEditingId(null); setOpen(true); };
  const onEdit = (row) => { setForm({ ...defaults, ...row }); setEditingId(row.id); setOpen(true); };
  const onDelete = async (id) => {
    if (!confirm('¿Eliminar este registro?')) return;
    try { await api.remove(id); toast('Eliminado'); load(); }
    catch (e) { toast(e?.response?.data?.message || 'Error al eliminar', 'error'); }
  };
  const onSave = async () => {
    const required = formFields.filter((f) => f.required);
    for (const f of required) {
      if (!form[f.key]) { toast(`${f.label} es obligatorio`, 'error'); return; }
    }
    try {
      if (editingId) await api.update(editingId, form);
      else await api.create(form);
      toast(editingId ? 'Actualizado' : 'Creado');
      setOpen(false); load();
    } catch (e) {
      toast(e?.response?.data?.message || 'Error al guardar', 'error');
    }
  };

  const actionsCol = {
    key: '_actions', label: 'Acciones', sortable: false,
    render: (r) => (
      <div style={{ display: 'flex', gap: 4 }}>
        {canWrite && <button className="btn btn-sm" onClick={() => onEdit(r)}>Editar</button>}
        {canDelete && <button className="btn btn-sm btn-danger" onClick={() => onDelete(r.id)}>×</button>}
      </div>
    ),
  };

  const allCols = canWrite || canDelete ? [...columns, actionsCol] : columns;

  return (
    <div>
      <div className="section-header">
        <h2>{title}</h2>
        <span style={{ color: 'var(--gray-400)', fontSize: 12 }}>{items.length} registros</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn btn-sm" onClick={() => downloadXLSX(items, exportName || title, `${(exportName||title).toLowerCase()}_${Date.now()}.xlsx`)}>
            ⬇ Exportar
          </button>
          {canWrite && <button className="btn btn-sm btn-primary" onClick={onNew}>+ Nuevo</button>}
        </div>
      </div>

      <div className="filters-bar">
        <input className="filter-input search-input" placeholder="Buscar..."
          value={search} onChange={(e) => setSearch(e.target.value)} />
        {filters.map((f) => (
          <select
            key={f.key} className="filter-select"
            value={filterValues[f.key] || ''}
            onChange={(e) => setFilterValues({ ...filterValues, [f.key]: e.target.value })}
          >
            <option value="">{f.placeholder || `Todos los ${f.label}`}</option>
            {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ))}
      </div>

      {loading ? <div className="empty"><span className="spinner" /></div> : <DataTable columns={allCols} data={items} />}

      <Modal
        open={open} onClose={() => setOpen(false)}
        title={editingId ? `Editar ${title.slice(0, -1)}` : `Nuevo en ${title}`}
        wide
        footer={
          <>
            <button className="btn" onClick={() => setOpen(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={onSave}>Guardar</button>
          </>
        }
      >
        <div className="form-grid">
          {formFields.map((f) => (
            <div key={f.key} className={`form-row ${f.full ? 'full' : ''}`}>
              <label>{f.label}{f.required && ' *'}</label>
              {f.type === 'textarea' ? (
                <textarea rows="2" value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              ) : f.type === 'select' ? (
                <select value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                  <option value="">—</option>
                  {f.options.map((o) => <option key={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  type={f.type || 'text'}
                  value={(f.type === 'date' ? (form[f.key]?.slice(0, 10) || '') : (form[f.key] ?? ''))}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
              )}
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
