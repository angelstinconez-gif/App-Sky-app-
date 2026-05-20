import { useEffect, useMemo, useState } from 'react';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import ImportButton from '../components/ImportButton';
import { mantenimientoApi, polizasApi, assigneesApi, importarApi } from '../api/endpoints';
import { fmtDate, downloadXLSX } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';

const TIPOS = ['Preventivo', 'Correctivo', 'Limpieza', 'Inspección', 'Otro'];
const ESTADOS = ['Programado', 'En curso', 'Completado', 'Cancelado'];

const empty = {
  project: '', code: '', tipo: 'Preventivo', estado: 'Programado',
  fechaProgramada: '', fechaEjecutada: '',
  cuadrilla: '', responsable: '',
  descripcion: '', resultados: '',
};

export default function Mantenimiento() {
  const { hasRole } = useAuth();
  const toast = useToast();
  const canWrite = hasRole('admin', 'mantenimiento');
  const canDelete = hasRole('admin');

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState('');
  const [tipo, setTipo] = useState('');

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);

  const [polizas, setPolizas] = useState([]);
  const [assignees, setAssignees] = useState([]);

  const load = () => {
    setLoading(true);
    mantenimientoApi.list({ q, estado, tipo })
      .then(setItems)
      .catch(() => toast('Error al cargar', 'error'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [q, estado, tipo]);
  useEffect(() => {
    polizasApi.list().then(setPolizas).catch(() => {});
    assigneesApi.list().then(setAssignees).catch(() => {});
  }, []);

  const onProjectChange = (value) => {
    setForm((f) => ({ ...f, project: value }));
    const p = polizas.find((x) => x.project?.toLowerCase() === value.toLowerCase() || x.code?.toLowerCase() === value.toLowerCase());
    if (p) {
      setForm((f) => ({
        ...f,
        project: p.project,
        code: p.code || f.code,
        cuadrilla: f.cuadrilla || p.cuadrilla || '',
      }));
    }
  };

  const onNew = () => { setForm({ ...empty, fechaProgramada: new Date().toISOString().slice(0, 10) }); setEditingId(null); setOpen(true); };
  const onEdit = (row) => { setForm({ ...empty, ...row }); setEditingId(row.id); setOpen(true); };
  const onSave = async () => {
    if (!form.project) return toast('El proyecto es obligatorio', 'error');
    try {
      if (editingId) await mantenimientoApi.update(editingId, form);
      else await mantenimientoApi.create(form);
      toast(editingId ? 'Actualizado' : 'Creado — notificación enviada a suscriptores');
      setOpen(false); load();
    } catch (e) {
      toast(e?.response?.data?.message || 'Error al guardar', 'error');
    }
  };
  const onDelete = async (id) => {
    if (!confirm('¿Eliminar este mantenimiento?')) return;
    await mantenimientoApi.remove(id);
    toast('Eliminado'); load();
  };

  const columns = useMemo(() => {
    const cols = [
      { key: 'project', label: 'Proyecto' },
      { key: 'code', label: 'Código' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'estado', label: 'Estado' },
      { key: 'fechaProgramada', label: 'Programado', render: (r) => fmtDate(r.fechaProgramada) },
      { key: 'fechaEjecutada', label: 'Ejecutado', render: (r) => fmtDate(r.fechaEjecutada) },
      { key: 'cuadrilla', label: 'Cuadrilla' },
      { key: 'responsable', label: 'Responsable' },
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
        <h2>Mantenimiento</h2>
        <span style={{ color: 'var(--gray-400)', fontSize: 12 }}>{items.length} registros</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {hasRole('admin') && (
            <>
              <a className="btn btn-sm" href="/templates/mantenimiento_template.xlsx" download>📄 Plantilla</a>
              <ImportButton uploader={importarApi.mantenimiento} onDone={load} />
            </>
          )}
          <button className="btn btn-sm" onClick={() => downloadXLSX(items, 'Mantenimiento', `mantenimiento_${Date.now()}.xlsx`)}>⬇ Exportar</button>
          {canWrite && <button className="btn btn-sm btn-primary" onClick={onNew}>+ Nuevo</button>}
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 12 }}>
        🔔 Al crear o cambiar estado se notifica por WhatsApp / Push a usuarios suscritos.
      </div>

      <div className="filters-bar">
        <input className="filter-input search-input" placeholder="Buscar..."
          value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="filter-select" value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {ESTADOS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="filter-select" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          {TIPOS.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>

      {loading ? <div className="empty"><span className="spinner" /></div> : <DataTable columns={columns} data={items} />}

      <Modal
        open={open} onClose={() => setOpen(false)}
        title={editingId ? `Editar mantenimiento #${editingId}` : 'Nuevo mantenimiento'}
        wide
        footer={
          <>
            <button className="btn" onClick={() => setOpen(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={onSave}>Guardar</button>
          </>
        }
      >
        <div className="form-grid">
          <FormRow label="Proyecto *" full>
            <input
              list="mant-projects"
              value={form.project}
              onChange={(e) => onProjectChange(e.target.value)}
              placeholder={polizas.length ? `Empieza a escribir (${polizas.length} proyectos)…` : 'Escribe libre'}
            />
            <datalist id="mant-projects">
              {polizas.map((p) => (
                <option key={p.id} value={p.project}>{p.code} — {p.grupo}</option>
              ))}
            </datalist>
            <div style={{ fontSize: 11, color: 'var(--sky-dark)', marginTop: 4 }}>
              💡 Auto-llena código y cuadrilla al seleccionar del listado.
            </div>
          </FormRow>

          <FormRow label="Código (auto)">
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </FormRow>
          <FormRow label="Tipo">
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              {TIPOS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </FormRow>
          <FormRow label="Estado">
            <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
              {ESTADOS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </FormRow>

          <FormRow label="Fecha programada">
            <input type="date" value={form.fechaProgramada?.slice(0, 10) || ''} onChange={(e) => setForm({ ...form, fechaProgramada: e.target.value })} />
          </FormRow>
          <FormRow label="Fecha ejecutada">
            <input type="date" value={form.fechaEjecutada?.slice(0, 10) || ''} onChange={(e) => setForm({ ...form, fechaEjecutada: e.target.value })} />
          </FormRow>

          <FormRow label="Cuadrilla">
            <select value={form.cuadrilla} onChange={(e) => setForm({ ...form, cuadrilla: e.target.value })}>
              <option value="">—</option>
              {assignees.filter((a) => a.type === 'cuadrilla').map((a) => (
                <option key={a.id} value={a.value}>{a.label}</option>
              ))}
            </select>
          </FormRow>
          <FormRow label="Responsable (usuario)">
            <select value={form.responsable} onChange={(e) => setForm({ ...form, responsable: e.target.value })}>
              <option value="">—</option>
              {assignees.filter((a) => a.type === 'user').map((a) => (
                <option key={a.id} value={a.value}>{a.label}</option>
              ))}
            </select>
          </FormRow>

          <FormRow label="Descripción" full>
            <textarea rows="2" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
          </FormRow>
          <FormRow label="Resultados" full>
            <textarea rows="2" value={form.resultados} onChange={(e) => setForm({ ...form, resultados: e.target.value })} />
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
