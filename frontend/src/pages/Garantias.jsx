import { useEffect, useMemo, useState } from 'react';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { garantiasApi, polizasApi } from '../api/endpoints';
import { fmtDate, downloadXLSX } from '../utils/format';

const STATUSES = [
  'En revisión',
  'En espera de respuesta de distribuidor',
  'Aprobada, por gestionar entrega',
  'Aprobada',
  'Rechazada',
  'Cerrada',
];

// Color por proceso
const STATUS_STYLE = {
  'En revisión':                            { bg: '#fef3c7', fg: '#92400e' },  // amarillo
  'En espera de respuesta de distribuidor': { bg: '#dbeafe', fg: '#1e40af' },  // azul
  'Aprobada, por gestionar entrega':        { bg: '#e0e7ff', fg: '#3730a3' },  // índigo
  'Aprobada':                               { bg: '#d1fae5', fg: '#065f46' },  // verde
  'Rechazada':                              { bg: '#fee2e2', fg: '#991b1b' },  // rojo
  'Cerrada':                                { bg: '#e5e7eb', fg: '#374151' },  // gris
};

const empty = {
  project: '', code: '', equipment: '', brand: '', model: '', sn: '',
  error: '', supplier: '', contact: '', ticket: '',
  status: 'En revisión',
  uploadDate: new Date().toISOString().slice(0, 10),
  comments: '',
};

function diasBadge(d) {
  if (d == null) return '—';
  if (d < 0) return '—';
  if (d === 0) return 'Hoy';
  if (d === 1) return '1 día';
  if (d <= 7) return `${d}d`;
  if (d <= 30) return `${d}d ⏳`;
  if (d <= 60) return `${d}d ⚠️`;
  return `${d}d 🔴`;
}
function diasColor(d, status) {
  const closed = (status || '').toLowerCase().includes('cerrada') ||
                 (status || '').toLowerCase().includes('aprobada') ||
                 (status || '').toLowerCase().includes('rechazada');
  if (closed) return 's-cerrada';
  if (d == null) return '';
  if (d > 60) return 's-critica';
  if (d > 30) return 's-pendiente';
  return 's-vigente';
}

export default function Garantias() {
  const { hasRole } = useAuth();
  const toast = useToast();
  const canWrite = hasRole('admin', 'mantenimiento');
  const canDelete = hasRole('admin');

  const [items, setItems] = useState([]);
  const [polizas, setPolizas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);

  const load = () => {
    setLoading(true);
    garantiasApi.list({ status: statusFilter, q })
      .then(setItems)
      .catch(() => toast('Error al cargar', 'error'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusFilter, q]);
  useEffect(() => { polizasApi.list().then(setPolizas).catch(() => {}); }, []);

  // ── Auto-fill desde Pólizas (igual que Incidencias) ──
  const onProjectAutofill = (changedField) => {
    const codeU = (form.code || '').toUpperCase().trim();
    const projL = (form.project || '').toLowerCase().trim();
    if (!codeU && !projL) return;

    const matchByCode = (exact) => polizas.find((x) => {
      const c = (x.code || '').toUpperCase();
      return exact ? c === codeU : (c.includes(codeU) && codeU.length >= 3);
    });
    const matchByProj = (exact) => polizas.find((x) => {
      const s = (x.project || '').toLowerCase();
      return exact ? s === projL : (s.includes(projL) && projL.length >= 3);
    });

    let p = null;
    if (changedField === 'code' && codeU) p = matchByCode(true) || matchByCode(false);
    else if (changedField === 'project' && projL) p = matchByProj(true) || matchByProj(false);
    else p = (codeU && matchByCode(true)) || (projL && matchByProj(true))
          || (codeU && matchByCode(false)) || (projL && matchByProj(false));

    if (p) {
      setForm((f) => ({
        ...f,
        project: p.project || f.project,
        code: p.code || f.code,
        supplier: f.supplier || p.platform || '',
      }));
      toast(`✓ Proyecto cargado: ${p.project}`);
    }
  };

  const onNew = () => {
    setForm({ ...empty, uploadDate: new Date().toISOString().slice(0, 10) });
    setEditingId(null);
    setOpen(true);
  };
  const onEdit = (row) => { setForm({ ...empty, ...row }); setEditingId(row.id); setOpen(true); };
  const onDelete = async (id) => {
    if (!confirm('¿Eliminar esta garantía?')) return;
    await garantiasApi.remove(id); toast('Eliminada'); load();
  };
  const onSave = async () => {
    if (!form.project) return toast('El proyecto es obligatorio', 'error');
    try {
      if (editingId) await garantiasApi.update(editingId, form);
      else await garantiasApi.create(form);
      toast(editingId ? 'Actualizada' : 'Creada'); setOpen(false); load();
    } catch (e) {
      toast(e?.response?.data?.message || 'Error al guardar', 'error');
    }
  };

  const columns = useMemo(() => {
    const cols = [
      { key: 'project', label: 'Proyecto' },
      { key: 'code', label: 'Código' },
      { key: 'equipment', label: 'Equipo' },
      { key: 'brand', label: 'Marca' },
      { key: 'model', label: 'Modelo' },
      { key: 'error', label: 'Error' },
      { key: 'supplier', label: 'Proveedor' },
      { key: 'ticket', label: 'Ticket' },
      {
        key: 'status', label: 'Proceso',
        render: (r) => {
          const s = STATUS_STYLE[r.status] || { bg: '#f3f4f6', fg: '#374151' };
          return (
            <span style={{
              background: s.bg, color: s.fg, padding: '3px 8px',
              borderRadius: 12, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
            }}>
              {r.status || '—'}
            </span>
          );
        },
      },
      {
        key: 'uploadDate', label: 'Fecha alta',
        render: (r) => fmtDate(r.uploadDate || r.createdAt),
      },
      {
        key: 'days', label: 'Antigüedad',
        render: (r) => (
          <span className={`badge ${diasColor(r.days, r.status)}`} title={`Desde ${fmtDate(r.uploadDate || r.createdAt)}`}>
            {diasBadge(r.days)}
          </span>
        ),
      },
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

  // KPIs rápidos por estado
  const counts = useMemo(() => {
    const c = { total: items.length };
    items.forEach((g) => {
      const k = (g.status || '—').toLowerCase().replace(/\s/g, '_');
      c[k] = (c[k] || 0) + 1;
    });
    return c;
  }, [items]);

  return (
    <div>
      <div className="section-header">
        <h2>Garantías</h2>
        <span style={{ color: 'var(--gray-400)', fontSize: 12 }}>{items.length} registros</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn btn-sm" onClick={() => downloadXLSX(items, 'Garantias', `garantias_${Date.now()}.xlsx`)}>⬇ Exportar</button>
          {canWrite && <button className="btn btn-sm btn-primary" onClick={onNew}>+ Nueva</button>}
        </div>
      </div>

      {/* Mini-KPIs por proceso */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0 16px' }}>
        {STATUSES.map((s) => {
          const k = s.toLowerCase().replace(/\s/g, '_');
          const n = counts[k] || 0;
          const st = STATUS_STYLE[s];
          return (
            <div key={s} style={{
              background: st.bg, color: st.fg, padding: '6px 12px',
              borderRadius: 10, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', opacity: !statusFilter || statusFilter === s ? 1 : 0.5,
            }} onClick={() => setStatusFilter(statusFilter === s ? '' : s)}>
              {s} · <strong>{n}</strong>
            </div>
          );
        })}
      </div>

      <div className="filters-bar">
        <input className="filter-input search-input" placeholder="Buscar proyecto, marca, error..."
          value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Todos los procesos</option>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      {loading ? <div className="empty"><span className="spinner" /></div> : <DataTable columns={columns} data={items} />}

      <Modal
        open={open} onClose={() => setOpen(false)}
        title={editingId ? `Editar garantía #${editingId}` : 'Nueva garantía'}
        wide
        footer={
          <>
            <button className="btn" onClick={() => setOpen(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={onSave}>Guardar</button>
          </>
        }
      >
        <div className="form-grid">
          {/* ── Proyecto primero (auto-fill desde Pólizas) ── */}
          <FormRow label="Código proyecto">
            <input list="g-codes" value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              onBlur={() => onProjectAutofill('code')}
              placeholder="Código de la planta" />
            <datalist id="g-codes">
              {polizas.map((p) => <option key={p.id} value={p.code}>{p.project}</option>)}
            </datalist>
          </FormRow>
          <FormRow label="Proyecto *">
            <input list="g-projects" value={form.project}
              onChange={(e) => setForm({ ...form, project: e.target.value })}
              onBlur={() => onProjectAutofill('project')}
              placeholder="Nombre del proyecto / planta" />
            <datalist id="g-projects">
              {polizas.map((p) => <option key={p.id} value={p.project}>{p.code}</option>)}
            </datalist>
          </FormRow>
          <FormRow label="Proceso (estado)">
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </FormRow>

          {/* ── Equipo ── */}
          <FormRow label="Equipo">
            <input value={form.equipment} onChange={(e) => setForm({ ...form, equipment: e.target.value })} />
          </FormRow>
          <FormRow label="Marca">
            <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
          </FormRow>
          <FormRow label="Modelo">
            <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          </FormRow>
          <FormRow label="Número de serie">
            <input value={form.sn} onChange={(e) => setForm({ ...form, sn: e.target.value })} />
          </FormRow>

          {/* ── Falla ── */}
          <FormRow label="Error / falla" full>
            <input value={form.error} onChange={(e) => setForm({ ...form, error: e.target.value })} />
          </FormRow>

          {/* ── Proveedor y ticket ── */}
          <FormRow label="Proveedor">
            <input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
          </FormRow>
          <FormRow label="Contacto proveedor">
            <input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
          </FormRow>
          <FormRow label="Ticket relacionado">
            <input value={form.ticket} onChange={(e) => setForm({ ...form, ticket: e.target.value })} />
          </FormRow>

          <FormRow label="Fecha de alta">
            <input type="date" value={form.uploadDate?.slice(0, 10) || ''}
              onChange={(e) => setForm({ ...form, uploadDate: e.target.value })} />
          </FormRow>

          <FormRow label="Comentarios" full>
            <textarea rows="3" value={form.comments} onChange={(e) => setForm({ ...form, comments: e.target.value })} />
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
