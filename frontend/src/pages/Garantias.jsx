import { useEffect, useMemo, useState } from 'react';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { garantiasApi, polizasApi, ticketsApi, assigneesApi } from '../api/endpoints';
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
  error: '', supplier: '', contact: '', ticket: '', caso: '',
  status: 'En revisión',
  uploadDate: new Date().toISOString().slice(0, 10),
  abiertoPor: '',
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
  const { hasRole, user } = useAuth();
  const toast = useToast();
  const canWrite = hasRole('admin', 'mantenimiento');
  const canDelete = hasRole('admin');

  const [items, setItems] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [assignees, setAssignees] = useState([]);
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
  useEffect(() => {
    polizasApi.list().then(setPolizas).catch(() => {});
    ticketsApi.list().then(setTickets).catch(() => {});
    assigneesApi.list().then(setAssignees).catch(() => {});
  }, []);

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
    setForm({
      ...empty,
      uploadDate: new Date().toISOString().slice(0, 10),
      abiertoPor: user?.name || '',
    });
    setEditingId(null);
    setOpen(true);
  };
  const onEdit = (row) => { setForm({ ...empty, ...row }); setEditingId(row.id); setOpen(true); };
  const onDelete = async (id) => {
    if (!await window.skyConfirm('¿Eliminar esta garantía?')) return;
    await garantiasApi.remove(id); toast('Eliminada'); load();
  };
  const onSave = async () => {
    if (!form.project) return toast('El proyecto es obligatorio', 'error');
    if (!form.abiertoPor) return toast('Indica quién abre el ticket (responsable)', 'error');
    // Ticket obligatorio salvo "caso especial"
    if (!form.ticket && !form._casoEspecial) {
      return toast('Asocia un ticket o marca "caso especial"', 'error');
    }
    try {
      const payload = { ...form };
      delete payload._casoEspecial;
      delete payload._justifEspecial;
      if (form._casoEspecial) {
        payload.comments = `⚠️ GARANTÍA ESPECIAL: ${form._justifEspecial || 'sin justificación'}\n\n${form.comments || ''}`;
      }
      if (editingId) await garantiasApi.update(editingId, payload);
      else await garantiasApi.create(payload);
      toast(editingId ? 'Actualizada' : 'Creada'); setOpen(false); load();
    } catch (e) {
      // 409 = duplicate (anti-duplicado del backend)
      if (e?.response?.status === 409) {
        const existing = e?.response?.data?.existing;
        await window.skyAlert(
          '⚠️ Ya existe una garantía con esos mismos datos.\n\n' +
          (existing ? `ID #${existing.id} · Proyecto: ${existing.project}\n` +
                      `Ticket: ${existing.ticket || '—'} · Error: ${existing.error || '—'}\n\n` : '') +
          'Para evitar duplicados, edita la existente en lugar de crear una nueva.'
        );
        setOpen(false);
        load();
      } else {
        toast(e?.response?.data?.message || 'Error al guardar', 'error');
      }
    }
  };

  const columns = useMemo(() => {
    const cols = [
      { key: 'project', label: 'Proyecto' },
      { key: 'code', label: 'Código' },
      { key: 'equipment', label: 'Equipo' },
      { key: 'brand', label: 'Marca' },
      { key: 'model', label: 'Modelo' },
      {
        key: 'sn', label: 'SN Inversor',
        render: (r) => r.sn
          ? <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 600 }}>{r.sn}</span>
          : '—',
      },
      { key: 'error', label: 'Error' },
      { key: 'supplier', label: 'Proveedor' },
      { key: 'ticket', label: 'Ticket prov.' },
      {
        key: 'caso', label: '# Caso',
        render: (r) => r.caso
          ? <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 600, color: '#0033A0' }}>#{r.caso}</span>
          : <span style={{ color: 'var(--gray-400)' }}>—</span>,
      },
      {
        key: 'abiertoPor', label: 'Abrió ticket',
        render: (r) => r.abiertoPor
          ? <span style={{ fontSize: 11 }}>👤 {r.abiertoPor}</span>
          : <span style={{ color: 'var(--gray-400)' }}>—</span>,
      },
      {
        key: 'creadoPor', label: 'Subió',
        render: (r) => r.creadoPor
          ? <span style={{ fontSize: 11, color: '#0033A0' }}>📤 {r.creadoPor}</span>
          : <span style={{ color: 'var(--gray-400)' }}>—</span>,
      },
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
          <FormRow label="Ticket relacionado *">
            <select value={form.ticket || ''}
              disabled={form._casoEspecial}
              onChange={(e) => {
                const id = e.target.value;
                const t = tickets.find((x) => String(x.id) === String(id));
                setForm({ ...form, ticket: id, project: form.project || t?.site || '' });
              }}>
              <option value="">— Elegir ticket —</option>
              {tickets.map((t) => (
                <option key={t.id} value={t.id}>#{t.id} · {t.title} ({t.site || '—'})</option>
              ))}
            </select>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, fontSize: 12 }}>
              <input type="checkbox" checked={!!form._casoEspecial}
                onChange={(e) => setForm({ ...form, _casoEspecial: e.target.checked, ticket: e.target.checked ? '' : form.ticket })} />
              ⚠️ Caso especial — garantía sin ticket previo
            </label>
            {form._casoEspecial && (
              <input style={{ marginTop: 4 }}
                placeholder="Justificación del caso especial..."
                value={form._justifEspecial || ''}
                onChange={(e) => setForm({ ...form, _justifEspecial: e.target.value })} />
            )}
          </FormRow>

          <FormRow label="# Caso (interno)">
            <input value={form.caso || ''}
              onChange={(e) => setForm({ ...form, caso: e.target.value })}
              placeholder="Ej: G-2026-001"
              style={{ fontFamily: 'monospace', fontWeight: 600 }} />
          </FormRow>
          <FormRow label="Fecha de alta">
            <input type="date" value={form.uploadDate?.slice(0, 10) || ''}
              onChange={(e) => setForm({ ...form, uploadDate: e.target.value })} />
          </FormRow>
          <FormRow label="👤 Abrió el ticket (responsable) *">
            <select value={form.abiertoPor || ''}
              onChange={(e) => setForm({ ...form, abiertoPor: e.target.value })}>
              <option value="">— Elegir responsable —</option>
              <optgroup label="👤 Usuarios de la plataforma">
                {assignees.filter((a) => a.type === 'user').map((a) => (
                  <option key={a.id} value={a.value}>{a.label} ({a.role})</option>
                ))}
              </optgroup>
              <optgroup label="🧑‍🔧 Técnicos">
                {assignees.filter((a) => a.type === 'tecnico').map((a) => (
                  <option key={a.id} value={a.value}>{a.label}</option>
                ))}
              </optgroup>
              <optgroup label="👥 Cuadrillas">
                {assignees.filter((a) => a.type === 'cuadrilla').map((a) => (
                  <option key={a.id} value={a.value}>{a.label}</option>
                ))}
              </optgroup>
            </select>
            <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 4 }}>
              Persona responsable del seguimiento de esta garantía.
            </div>
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
