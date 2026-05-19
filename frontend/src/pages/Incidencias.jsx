import { useEffect, useMemo, useState } from 'react';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { incidenciasApi, erroresApi } from '../api/endpoints';
import { fmtDate, priorityClass, statusClass, downloadXLSX } from '../utils/format';

const PRIORITIES = ['Critico', 'Alta', 'Intermedia', 'Baja'];
const PLATFORMS = ['SUNGROW', 'SOLIS', 'HUAWEI', 'SMA', 'ENNEXOS', 'FUSION', 'SKYCONTROL', 'OTRO'];

const empty = {
  platform: '', num: '', site: '', client: '', code: '',
  priority: '', notes: '', incDate: '', errCode: '', classification: '',
  problem: '', cause: '', solution: '', ticketAlta: 'NO', ticketDate: '',
  responsible: '', comments: '',
};

export default function Incidencias() {
  const { hasRole } = useAuth();
  const toast = useToast();
  const canWrite = hasRole('admin', 'operator');
  const canDelete = hasRole('admin');

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [priority, setPriority] = useState('');
  const [status, setStatus] = useState('');
  const [openModal, setOpenModal] = useState(false);
  const [closeModal, setCloseModal] = useState(null);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);

  const load = () => {
    setLoading(true);
    incidenciasApi
      .list({ q, priority, status })
      .then(setItems)
      .catch(() => toast('Error al cargar', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [q, priority, status]);

  const onNew = () => { setForm(empty); setEditingId(null); setOpenModal(true); };
  const onEdit = (row) => {
    setForm({ ...empty, ...row });
    setEditingId(row.id);
    setOpenModal(true);
  };
  const onSave = async () => {
    if (!form.site) return toast('El sitio es obligatorio', 'error');
    try {
      if (editingId) {
        await incidenciasApi.update(editingId, form);
        toast('Incidencia actualizada');
      } else {
        await incidenciasApi.create(form);
        toast('Incidencia creada');
      }
      setOpenModal(false);
      load();
    } catch (e) {
      toast(e?.response?.data?.message || 'Error al guardar', 'error');
    }
  };
  const onDelete = async (id) => {
    if (!confirm('¿Eliminar esta incidencia?')) return;
    await incidenciasApi.remove(id);
    toast('Eliminada');
    load();
  };
  const onClose = async (id, data) => {
    await incidenciasApi.close(id, data);
    toast('Incidencia cerrada');
    setCloseModal(null);
    load();
  };

  const onLookupError = async () => {
    if (!form.platform || !form.errCode) return;
    try {
      const e = await erroresApi.lookup(form.platform, form.errCode);
      if (e) {
        setForm((f) => ({
          ...f,
          classification: e.classification || f.classification,
          problem: e.problem || f.problem,
          cause: e.cause || f.cause,
          solution: e.solution || f.solution,
          priority: f.priority || e.priority || '',
        }));
        toast('Datos cargados del catálogo');
      } else {
        toast('No se encontró ese código', 'error');
      }
    } catch {}
  };

  const exportXlsx = () => downloadXLSX(items, 'Incidencias', `incidencias_${Date.now()}.xlsx`);

  const columns = useMemo(() => [
    { key: 'id', label: '#' },
    { key: 'platform', label: 'Plataforma' },
    { key: 'site', label: 'Sitio' },
    { key: 'client', label: 'Cliente' },
    { key: 'priority', label: 'Prioridad', render: (r) => <span className={`badge ${priorityClass(r.priority)}`}>{r.priority || '—'}</span> },
    { key: 'errCode', label: 'Error' },
    { key: 'classification', label: 'Clasif.' },
    { key: 'incDate', label: 'Fecha', render: (r) => fmtDate(r.incDate) },
    { key: 'days', label: 'Días', render: (r) => (r.days != null ? `${r.days}d` : '—') },
    { key: 'status', label: 'Estado', render: (r) => <span className={`badge ${statusClass(r.status)}`}>{r.status}</span> },
    {
      key: '_actions', label: 'Acciones', sortable: false,
      render: (r) => (
        <div style={{ display: 'flex', gap: 4 }}>
          {canWrite && r.status === 'abierta' && (
            <>
              <button className="btn btn-sm" onClick={() => onEdit(r)}>Editar</button>
              <button className="btn btn-sm btn-primary" onClick={() => setCloseModal(r)}>Cerrar</button>
            </>
          )}
          {canDelete && <button className="btn btn-sm btn-danger" onClick={() => onDelete(r.id)}>×</button>}
        </div>
      ),
    },
  ], [canWrite, canDelete]);

  return (
    <div>
      <div className="section-header">
        <h2>Incidencias</h2>
        <span style={{ color: 'var(--gray-400)', fontSize: 12 }}>{items.length} registros</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn btn-sm" onClick={exportXlsx}>⬇ Exportar</button>
          {canWrite && <button className="btn btn-sm btn-primary" onClick={onNew}>+ Nueva</button>}
        </div>
      </div>

      <div className="filters-bar">
        <input className="filter-input search-input" placeholder="Buscar sitio, código, notas..."
          value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="filter-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">Todas las prioridades</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className="filter-select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="abierta">Abierta</option>
          <option value="cerrada">Cerrada</option>
        </select>
      </div>

      {loading ? <div className="empty"><span className="spinner" /></div> : <DataTable columns={columns} data={items} />}

      <Modal
        open={openModal} onClose={() => setOpenModal(false)}
        title={editingId ? `Editar incidencia #${editingId}` : 'Nueva incidencia'}
        wide
        footer={
          <>
            <button className="btn" onClick={() => setOpenModal(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={onSave}>Guardar</button>
          </>
        }
      >
        <div className="form-grid">
          <FormRow label="Plataforma">
            <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
              <option value="">—</option>
              {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </FormRow>
          <FormRow label="Sitio *">
            <input value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })} />
          </FormRow>
          <FormRow label="Cliente">
            <input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} />
          </FormRow>
          <FormRow label="Código proyecto">
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </FormRow>
          <FormRow label="Prioridad">
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option value="">—</option>
              {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </FormRow>
          <FormRow label="Código de error">
            <div style={{ display: 'flex', gap: 4 }}>
              <input value={form.errCode} onChange={(e) => setForm({ ...form, errCode: e.target.value })}
                onBlur={onLookupError} style={{ flex: 1 }} />
              <button type="button" className="btn btn-sm" onClick={onLookupError}>🔍</button>
            </div>
          </FormRow>
          <FormRow label="Fecha incidencia">
            <input type="date" value={form.incDate?.slice(0, 10) || ''} onChange={(e) => setForm({ ...form, incDate: e.target.value })} />
          </FormRow>
          <FormRow label="Clasificación">
            <input value={form.classification} onChange={(e) => setForm({ ...form, classification: e.target.value })} />
          </FormRow>
          <FormRow label="Problema">
            <input value={form.problem} onChange={(e) => setForm({ ...form, problem: e.target.value })} />
          </FormRow>
          <FormRow label="Ticket Alta">
            <select value={form.ticketAlta} onChange={(e) => setForm({ ...form, ticketAlta: e.target.value })}>
              <option>NO</option>
              <option>SI</option>
            </select>
          </FormRow>
          <FormRow label="Fecha ticket">
            <input type="date" value={form.ticketDate?.slice(0, 10) || ''} onChange={(e) => setForm({ ...form, ticketDate: e.target.value })} />
          </FormRow>
          <FormRow label="Responsable">
            <input value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value })} />
          </FormRow>

          <FormRow label="Notas" full>
            <textarea rows="2" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </FormRow>
          <FormRow label="Causa" full>
            <textarea rows="2" value={form.cause} onChange={(e) => setForm({ ...form, cause: e.target.value })} />
          </FormRow>
          <FormRow label="Solución" full>
            <textarea rows="2" value={form.solution} onChange={(e) => setForm({ ...form, solution: e.target.value })} />
          </FormRow>
        </div>
      </Modal>

      <CloseIncModal item={closeModal} onClose={() => setCloseModal(null)} onSave={onClose} />
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

function CloseIncModal({ item, onClose, onSave }) {
  const [result, setResult] = useState('');
  const [responsible, setResponsible] = useState('');
  if (!item) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title={`Cerrar incidencia: ${item.site}`}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onSave(item.id, { result, responsible })}>
            Cerrar incidencia
          </button>
        </>
      }
    >
      <div className="form-grid">
        <FormRow label="Responsable">
          <input value={responsible} onChange={(e) => setResponsible(e.target.value)} placeholder="Tu nombre" />
        </FormRow>
        <FormRow label="Resultado / observaciones" full>
          <textarea rows="3" value={result} onChange={(e) => setResult(e.target.value)} />
        </FormRow>
      </div>
    </Modal>
  );
}
