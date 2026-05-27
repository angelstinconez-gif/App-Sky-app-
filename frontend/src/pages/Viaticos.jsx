import { useEffect, useMemo, useState } from 'react';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { viaticosApi, ticketsApi, polizasApi, mantenimientoApi } from '../api/endpoints';
import { fmtDate, downloadXLSX } from '../utils/format';

const ESTADOS = ['Solicitado', 'Aprobado', 'Comprobado', 'Rechazado'];
const ESTADO_STYLE = {
  Solicitado:  { bg: '#fef3c7', fg: '#92400e' },
  Aprobado:    { bg: '#dbeafe', fg: '#1e40af' },
  Comprobado:  { bg: '#d1fae5', fg: '#065f46' },
  Rechazado:   { bg: '#fee2e2', fg: '#991b1b' },
};

const empty = {
  ticketId: '', project: '', code: '', responsable: '',
  monto: '', moneda: 'MXN', tagCarro: '',
  diasSitio: '',
  fechaSalida: new Date().toISOString().slice(0, 10),
  fechaRegreso: '',
  estado: 'Solicitado', notas: '',
};

const money = (n, c = 'MXN') => {
  if (n == null || n === '') return '—';
  try { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: c || 'MXN' }).format(n); }
  catch { return `$${n}`; }
};

export default function Viaticos() {
  const { hasRole } = useAuth();
  const toast = useToast();
  const canWrite = hasRole('admin', 'operator', 'mantenimiento');
  const canDelete = hasRole('admin');

  const [items, setItems] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [mants, setMants] = useState([]);
  const [polizas, setPolizas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [estado, setEstado] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);

  const load = () => {
    setLoading(true);
    viaticosApi.list({ estado, q }).then(setItems).catch(() => toast('Error', 'error')).finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [estado, q]);
  useEffect(() => {
    ticketsApi.list().then(setTickets).catch(() => {});
    polizasApi.list().then(setPolizas).catch(() => {});
    mantenimientoApi.list().then(setMants).catch(() => {});
  }, []);

  // Cuando elige una orden (ticket o mantenimiento), autocompleta proyecto/código
  const onOrdenChange = (val) => {
    if (!val) {
      setForm((f) => ({ ...f, ticketId: '' }));
      return;
    }
    const [kind, id] = val.split(':');
    if (kind === 't') {
      const t = tickets.find((x) => String(x.id) === String(id));
      setForm((f) => ({
        ...f,
        ticketId: id,
        project: t?.site || f.project,
        code: t?.projectCode || f.code,
        responsable: t?.assignedTo || f.responsable,
        notas: t ? `🎫 Ticket #${id} · ${t.title || ''}` : f.notas,
      }));
    } else if (kind === 'm') {
      const m = mants.find((x) => String(x.id) === String(id));
      setForm((f) => ({
        ...f,
        ticketId: `M${id}`,    // prefijo M para indicar mantenimiento
        project: m?.project || f.project,
        code: m?.code || f.code,
        responsable: m?.responsable || m?.cuadrilla || f.responsable,
        notas: m ? `🔧 Mantenimiento #${id} · ${m.tipo || ''} — ${m.project || ''}` : f.notas,
      }));
    }
  };

  // Valor mostrado en el selector
  const ordenValue = (() => {
    if (!form.ticketId) return '';
    if (String(form.ticketId).startsWith('M')) return `m:${String(form.ticketId).slice(1)}`;
    return `t:${form.ticketId}`;
  })();

  // Cuando elige proyecto desde datalist
  const onProjectChange = (val) => {
    setForm((f) => ({ ...f, project: val }));
    const p = polizas.find((x) => x.project?.toLowerCase() === val.toLowerCase());
    if (p) setForm((f) => ({ ...f, project: p.project, code: p.code || f.code }));
  };

  // Calcular días si hay ambas fechas
  const onDateChange = (field, value) => {
    setForm((f) => {
      const next = { ...f, [field]: value };
      if (next.fechaSalida && next.fechaRegreso) {
        const d1 = new Date(next.fechaSalida);
        const d2 = new Date(next.fechaRegreso);
        const days = Math.max(0, Math.floor((d2 - d1) / 86400000) + 1);
        next.diasSitio = days;
      }
      return next;
    });
  };

  const onNew = () => { setForm({ ...empty }); setEditingId(null); setOpen(true); };
  const onEdit = (r) => { setForm({ ...empty, ...r }); setEditingId(r.id); setOpen(true); };
  const onDelete = async (id) => {
    if (!confirm('¿Eliminar este viático?')) return;
    await viaticosApi.remove(id); toast('Eliminado'); load();
  };
  const onSave = async () => {
    try {
      if (editingId) await viaticosApi.update(editingId, form);
      else await viaticosApi.create(form);
      toast(editingId ? 'Actualizado' : 'Creado'); setOpen(false); load();
    } catch (e) { toast(e?.response?.data?.message || 'Error', 'error'); }
  };

  const totalMonto = useMemo(
    () => items.reduce((s, v) => s + (Number(v.monto) || 0), 0),
    [items]
  );

  const columns = useMemo(() => {
    const cols = [
      {
        key: 'ticketId', label: 'Orden',
        render: (r) => {
          if (!r.ticketId) return '—';
          const v = String(r.ticketId);
          return v.startsWith('M')
            ? <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 6px', borderRadius: 10, fontSize: 11 }}>🔧 M{v.slice(1)}</span>
            : <span style={{ background: '#dbeafe', color: '#1e40af', padding: '2px 6px', borderRadius: 10, fontSize: 11 }}>🎫 #{v}</span>;
        },
      },
      { key: 'project', label: 'Proyecto' },
      { key: 'responsable', label: 'Responsable' },
      { key: 'tagCarro', label: 'TAG / Placa' },
      { key: 'monto', label: 'Monto', render: (r) => money(r.monto, r.moneda) },
      { key: 'diasSitio', label: 'Días sitio', render: (r) => r.diasSitio ? `${r.diasSitio}d` : '—' },
      { key: 'fechaSalida', label: 'Salida', render: (r) => fmtDate(r.fechaSalida) },
      { key: 'fechaRegreso', label: 'Regreso', render: (r) => fmtDate(r.fechaRegreso) },
      {
        key: 'estado', label: 'Estado',
        render: (r) => {
          const s = ESTADO_STYLE[r.estado] || {};
          return <span style={{ background: s.bg, color: s.fg, padding: '3px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{r.estado || '—'}</span>;
        },
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

  return (
    <div>
      <div className="section-header">
        <h2>Viáticos</h2>
        <span style={{ color: 'var(--gray-400)', fontSize: 12 }}>
          {items.length} registros · Total: <strong style={{ color: 'var(--sky)' }}>{money(totalMonto)}</strong>
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn btn-sm" onClick={() => downloadXLSX(items, 'Viaticos', `viaticos_${Date.now()}.xlsx`)}>⬇ Exportar</button>
          {canWrite && <button className="btn btn-sm btn-primary" onClick={onNew}>+ Nuevo viático</button>}
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 12 }}>
        Asocia gastos de visita a un ticket. Al elegir el ticket se autollena proyecto y responsable.
      </div>

      <div className="filters-bar">
        <input className="filter-input search-input" placeholder="Buscar proyecto, TAG, responsable..."
          value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="filter-select" value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {ESTADOS.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      {loading ? <div className="empty"><span className="spinner" /></div> : <DataTable columns={columns} data={items} />}

      <Modal
        open={open} onClose={() => setOpen(false)}
        title={editingId ? `Editar viático #${editingId}` : 'Nuevo viático'}
        wide
        footer={
          <>
            <button className="btn" onClick={() => setOpen(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={onSave}>Guardar</button>
          </>
        }
      >
        <div className="form-grid">
          <FormRow label="Orden asociada (ticket o mantto)">
            <select value={ordenValue} onChange={(e) => onOrdenChange(e.target.value)}>
              <option value="">— Sin orden —</option>
              <optgroup label="🎫 Tickets">
                {tickets.map((t) => (
                  <option key={`t-${t.id}`} value={`t:${t.id}`}>#{t.id} · {t.title} ({t.site || '—'})</option>
                ))}
              </optgroup>
              <optgroup label="🔧 Mantenimientos">
                {mants.map((m) => (
                  <option key={`m-${m.id}`} value={`m:${m.id}`}>M{m.id} · {m.tipo || 'Mant.'} — {m.project || m.proyecto || '—'}</option>
                ))}
              </optgroup>
            </select>
          </FormRow>
          <FormRow label="Proyecto">
            <input list="vt-projects" value={form.project} onChange={(e) => onProjectChange(e.target.value)} />
            <datalist id="vt-projects">
              {polizas.map((p) => <option key={p.id} value={p.project}>{p.code}</option>)}
            </datalist>
          </FormRow>
          <FormRow label="Código (auto)">
            <input value={form.code} readOnly className="readonly-auto" />
          </FormRow>

          <FormRow label="Responsable / Conductor">
            <input value={form.responsable} onChange={(e) => setForm({ ...form, responsable: e.target.value })} />
          </FormRow>
          <FormRow label="TAG / Placa del vehículo *">
            <input value={form.tagCarro} onChange={(e) => setForm({ ...form, tagCarro: e.target.value })}
              placeholder="Ej: ABC-123 / TAG-007" />
          </FormRow>

          <FormRow label="Monto asignado">
            <div style={{ display: 'flex', gap: 4 }}>
              <input type="number" step="0.01" value={form.monto}
                onChange={(e) => setForm({ ...form, monto: e.target.value })}
                style={{ flex: 1 }} />
              <select value={form.moneda} onChange={(e) => setForm({ ...form, moneda: e.target.value })}>
                <option>MXN</option><option>USD</option>
              </select>
            </div>
          </FormRow>
          <FormRow label="Estado">
            <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
              {ESTADOS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </FormRow>

          <FormRow label="Fecha salida">
            <input type="date" value={form.fechaSalida?.slice(0, 10) || ''}
              onChange={(e) => onDateChange('fechaSalida', e.target.value)} />
          </FormRow>
          <FormRow label="Fecha regreso">
            <input type="date" value={form.fechaRegreso?.slice(0, 10) || ''}
              onChange={(e) => onDateChange('fechaRegreso', e.target.value)} />
          </FormRow>
          <FormRow label="Días en sitio (auto)">
            <input type="number" value={form.diasSitio} className="readonly-auto" readOnly />
          </FormRow>

          <FormRow label="Notas" full>
            <textarea rows="2" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
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
