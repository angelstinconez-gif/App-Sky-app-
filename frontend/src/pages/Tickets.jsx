import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Pencil, X, Plus, Download } from 'lucide-react';
import DataTable from '../components/DataTable';
import RelatedAlert from '../components/RelatedAlert';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { ticketsApi, polizasApi, assigneesApi, incidenciasApi } from '../api/endpoints';
import { fmtDate, priorityClass, statusClass, downloadXLSX } from '../utils/format';

const STATUSES = ['Abierto', 'En proceso', 'Cerrado'];
const PRIORITIES = ['Critico', 'Alta', 'Intermedia', 'Baja'];

const empty = {
  title: '', site: '', client: '', projectCode: '',
  priority: 'Intermedia', status: 'Abierto', assignedTo: '',
  openDate: '', dueDate: '', description: '',
};

export default function Tickets() {
  const { hasRole } = useAuth();
  const toast = useToast();
  const canWrite = hasRole('admin', 'operator', 'mantenimiento');
  const canDelete = hasRole('admin');

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');

  const [openModal, setOpenModal] = useState(false);
  const [relatedTickets, setRelatedTickets] = useState([]);
  const [relatedIncidencias, setRelatedIncidencias] = useState([]);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);

  const [polizas, setPolizas] = useState([]);
  const [assignees, setAssignees] = useState([]);

  const load = () => {
    setLoading(true);
    ticketsApi.list({ q, status, priority })
      .then(setItems)
      .catch(() => toast('Error al cargar', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [q, status, priority]);

  // Debounce: buscar tickets E incidencias relacionados mientras se edita el form
  useEffect(() => {
    if (!openModal) {
      setRelatedTickets([]); setRelatedIncidencias([]); return;
    }
    if (!form.site && !form.projectCode) {
      setRelatedTickets([]); setRelatedIncidencias([]); return;
    }
    const t = setTimeout(() => {
      ticketsApi.related({
        site: form.site || '',
        code: form.projectCode || '',
        excludeId: editingId || '',
      }).then(setRelatedTickets).catch(() => setRelatedTickets([]));
      // También buscar incidencias del mismo proyecto
      incidenciasApi.related({
        site: form.site || '',
        code: form.projectCode || '',
      }).then(setRelatedIncidencias).catch(() => setRelatedIncidencias([]));
    }, 400);
    return () => clearTimeout(t);
  }, [openModal, form.site, form.projectCode, editingId]);

  useEffect(() => {
    polizasApi.list().then(setPolizas).catch(() => {});
    assigneesApi.list().then(setAssignees).catch(() => {});
  }, []);

  // ── Auto-fill cliente/sitio/código al elegir un proyecto desde la lista ──
  const onTitleChange = (value) => {
    setForm((f) => ({ ...f, title: value }));
    // Buscar coincidencia con proyectos en pólizas
    const match = polizas.find(
      (p) =>
        p.project?.toLowerCase().includes(value.toLowerCase()) ||
        p.code?.toLowerCase() === value.toLowerCase()
    );
    if (match && value.length > 3) {
      setForm((f) => ({
        ...f,
        site: f.site || match.project,
        projectCode: f.projectCode || match.code,
        client: f.client || match.grupo,
      }));
    }
  };

  // ── Cuando se selecciona explícitamente un proyecto del datalist ──
  const onPickProject = (projectName) => {
    const p = polizas.find((x) => x.project === projectName);
    if (p) {
      setForm((f) => ({
        ...f,
        title: f.title || `Atención — ${p.project}`,
        site: p.project,
        projectCode: p.code,
        client: p.grupo,
      }));
    }
  };

  const onNew = () => { setForm({ ...empty, openDate: new Date().toISOString().slice(0, 10) }); setEditingId(null); setOpenModal(true); };
  const onEdit = (row) => { setForm({ ...empty, ...row }); setEditingId(row.id); setOpenModal(true); };

  // ── Auto-abrir ticket cuando viene ?focus=ID (desde el buscador global) ──
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const focusId = parseInt(searchParams.get('focus'), 10);
    if (!focusId || !items || items.length === 0) return;
    const row = items.find((r) => r.id === focusId);
    if (row) {
      onEdit(row);
      // limpiar el query param para no re-abrir
      const sp = new URLSearchParams(searchParams);
      sp.delete('focus');
      setSearchParams(sp, { replace: true });
    }
    // eslint-disable-next-line
  }, [items, searchParams]);

  const onSave = async () => {
    if (!form.title) return toast('El título es obligatorio', 'error');
    // Aviso de tickets abiertos relacionados al CREAR
    if (!editingId) {
      const abiertos = relatedTickets.filter((r) =>
        r.tieneRelacion && r.estaAbierto !== false &&
        (r.status || '').toLowerCase() !== 'cerrado'
      );
      if (abiertos.length > 0) {
        const lista = abiertos.slice(0, 3).map((r) =>
          `#${r.id} · ${r.title || 's/título'} (${r.razones?.join(', ') || '—'}) [${r.status || ''}]`
        ).join('\n');
        const ok = await window.skyConfirm(
          `⚠️ Ya existen ${abiertos.length} ticket(s) abierto(s) para este proyecto:\n\n${lista}\n\n` +
          `¿Aún así deseas crear uno nuevo?`
        );
        if (!ok) return;
      }
    }
    try {
      if (editingId) await ticketsApi.update(editingId, form);
      else await ticketsApi.create(form);
      toast(editingId ? 'Actualizado' : 'Creado');
      setOpenModal(false); load();
    } catch (e) {
      toast(e?.response?.data?.message || 'Error al guardar', 'error');
    }
  };
  const onDelete = async (id) => {
    if (!await window.skyConfirm('¿Eliminar este ticket?')) return;
    await ticketsApi.remove(id);
    toast('Eliminado'); load();
  };

  const columns = useMemo(() => [
    { key: 'id', label: '#' },
    { key: 'title', label: 'Título' },
    { key: 'site', label: 'Proyecto' },
    { key: 'client', label: 'Cliente' },
    { key: 'projectCode', label: 'Código' },
    { key: 'priority', label: 'Prioridad', render: (r) => <span className={`badge ${priorityClass(r.priority)}`}>{r.priority || '—'}</span> },
    { key: 'status', label: 'Estado', render: (r) => <span className={`badge ${statusClass(r.status)}`}>{r.status}</span> },
    { key: 'assignedTo', label: 'Asignado' },
    { key: 'openDate', label: 'Apertura', render: (r) => fmtDate(r.openDate) },
    { key: 'dueDate', label: 'Compromiso', render: (r) => fmtDate(r.dueDate) },
    { key: 'days', label: 'Días', render: (r) => (r.days != null ? `${r.days}d` : '—') },
    {
      key: '_actions', label: 'Acciones', sortable: false,
      render: (r) => (
        <div style={{ display: 'inline-flex', gap: 4, flexWrap: 'nowrap', alignItems: 'center' }}>
          {canWrite && <button className="btn btn-sm" title="Editar" onClick={() => onEdit(r)}><Pencil size={14} /></button>}
          {canDelete && <button className="btn btn-sm btn-danger" title="Eliminar" onClick={() => onDelete(r.id)}><X size={14} /></button>}
        </div>
      ),
    },
  ], [canWrite, canDelete]);

  return (
    <div>
      <div className="section-header">
        <h2>Tickets</h2>
        <span style={{ color: 'var(--gray-400)', fontSize: 12 }}>{items.length} registros</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn btn-sm" onClick={() => downloadXLSX(items, 'Tickets', `tickets_${Date.now()}.xlsx`)}>
            <Download size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Exportar
          </button>
          {canWrite && <button className="btn btn-sm btn-primary" onClick={onNew}>
            <Plus size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Nuevo
          </button>}
        </div>
      </div>

      <div className="filters-bar">
        <input className="filter-input search-input" placeholder="Buscar..."
          value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="filter-select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos los estados</option>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="filter-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">Todas las prioridades</option>
          {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
        </select>
      </div>

      {loading ? <div className="empty"><span className="spinner" /></div> : <DataTable columns={columns} data={items} />}

      <Modal
        open={openModal} onClose={() => setOpenModal(false)}
        title={editingId ? `Editar ticket #${editingId}` : 'Nuevo ticket'}
        wide
        footer={
          <>
            <button className="btn" onClick={() => setOpenModal(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={onSave}>Guardar</button>
          </>
        }
      >
        {/* Aviso de incidencias relacionadas al proyecto */}
        <RelatedAlert items={relatedIncidencias} kind="incidencia"
          onNavigate={(route) => { setOpenModal(false); window.open(route, '_blank'); }} />
        {/* Aviso de tickets ya existentes para el mismo proyecto */}
        <RelatedAlert items={relatedTickets} kind="ticket"
          onNavigate={(route) => { setOpenModal(false); window.open(route, '_blank'); }} />
        <div className="form-grid">
          <FormRow label="Título *" full>
            <input list="tk-projects" value={form.title}
              onChange={(e) => onTitleChange(e.target.value)}
              onChange-final={(e) => onPickProject(e.target.value)}
              placeholder="Empieza a escribir un proyecto o describe el ticket" />
            <datalist id="tk-projects">
              {polizas.map((p) => (
                <option key={p.id} value={p.project}>{p.code} — {p.grupo}</option>
              ))}
            </datalist>
            <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>
              💡 Tip: al elegir un proyecto del listado se auto-llenan cliente, proyecto y código.
            </div>
          </FormRow>

          <FormRow label="Proyecto">
            <input value={form.site} readOnly className="readonly-auto"
              onChange={(e) => setForm({ ...form, site: e.target.value })} />
          </FormRow>
          <FormRow label="Cliente (auto)">
            <input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} />
          </FormRow>
          <FormRow label="Código proyecto (auto)">
            <input value={form.projectCode} onChange={(e) => setForm({ ...form, projectCode: e.target.value })} />
          </FormRow>

          <FormRow label="Prioridad">
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </FormRow>
          <FormRow label="Estado">
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </FormRow>

          <FormRow label={`Asignado a${editingId && !hasRole('admin') ? ' (sólo admin puede cambiar)' : ''}`}>
            <select value={form.assignedTo}
              disabled={editingId && !hasRole('admin')}
              className={editingId && !hasRole('admin') ? 'readonly-auto' : ''}
              onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}>
              <option value="">— elegir —</option>
              <optgroup label="👤 Usuarios">
                {assignees.filter((a) => a.type === 'user').map((a) => (
                  <option key={a.id} value={a.value}>{a.label} ({a.role})</option>
                ))}
              </optgroup>
              <optgroup label="👥 Cuadrillas">
                {assignees.filter((a) => a.type === 'cuadrilla').map((a) => (
                  <option key={a.id} value={a.value}>{a.label}</option>
                ))}
              </optgroup>
              <optgroup label="🧑‍🔧 Técnicos">
                {assignees.filter((a) => a.type === 'tecnico').map((a) => (
                  <option key={a.id} value={a.value}>{a.label}</option>
                ))}
              </optgroup>
            </select>
          </FormRow>

          <FormRow label="Fecha apertura">
            <input type="date" value={form.openDate?.slice(0, 10) || ''} onChange={(e) => setForm({ ...form, openDate: e.target.value })} />
          </FormRow>
          <FormRow label="Fecha compromiso">
            <input type="date" value={form.dueDate?.slice(0, 10) || ''} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </FormRow>

          <FormRow label="Descripción" full>
            <textarea rows="3" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
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
