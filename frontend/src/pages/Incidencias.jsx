import { useEffect, useMemo, useState } from 'react';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import {
  incidenciasApi,
  erroresApi,
  polizasApi,
  ticketsApi,
  assigneesApi,
  importarApi,
} from '../api/endpoints';
import ImportButton from '../components/ImportButton';
import { fmtDate, priorityClass, statusClass, downloadXLSX } from '../utils/format';

const PRIORITIES = ['Critico', 'Alta', 'Intermedia', 'Baja'];
const PLATFORMS = ['SUNGROW', 'SOLIS', 'HUAWEI', 'SMA', 'ENNEXOS', 'FUSION', 'SKYCONTROL', 'OTRO'];

const empty = {
  platform: '', num: '', site: '', client: '', code: '',
  priority: '', notes: '', incDate: '', errCode: '',
  classification: '', equipment: '',
  problem: '', cause: '', solution: '', ticketAlta: 'NO', ticketDate: '',
  responsible: '', comments: '',
  // sub-form de ticket inline
  _createTicket: false,
  _ticketTitle: '', _ticketAssigned: '', _ticketDueDate: '',
  _ticketTipo: 'Remota', _ticketDescription: '',
};

// Deriva plataforma desde el campo platform de Pólizas (texto libre → marca normalizada)
function normalizePlatform(s) {
  if (!s) return '';
  const k = s.toUpperCase();
  if (k.includes('SUNGROW')) return 'SUNGROW';
  if (k.includes('SOLIS')) return 'SOLIS';
  if (k.includes('HUAWEI') || k.includes('FUSION')) return 'HUAWEI';
  if (k.includes('SMA') || k.includes('ENNEX')) return 'SMA';
  if (k.includes('SKYCONTROL')) return 'SKYCONTROL';
  return k;
}

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

  // Catálogos en memoria para autocompletar y dropdowns
  const [errors, setErrors] = useState([]);
  const [polizas, setPolizas] = useState([]);
  const [assignees, setAssignees] = useState([]);

  const load = () => {
    setLoading(true);
    incidenciasApi
      .list({ q, priority, status })
      .then(setItems)
      .catch(() => toast('Error al cargar', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [q, priority, status]);

  // Catálogos sólo se cargan una vez
  useEffect(() => {
    erroresApi.list().then(setErrors).catch(() => {});
    polizasApi.list().then(setPolizas).catch(() => {});
    assigneesApi.list().then(setAssignees).catch(() => {});
  }, []);

  // ── Filtrado de códigos de error por plataforma seleccionada ──
  const codesForPlatform = useMemo(() => {
    if (!form.platform) return [];
    return errors.filter((e) => e.brand?.toUpperCase() === form.platform.toUpperCase());
  }, [errors, form.platform]);

  const onNew = () => { setForm(empty); setEditingId(null); setOpenModal(true); };
  const onEdit = (row) => {
    setForm({ ...empty, ...row });
    setEditingId(row.id);
    setOpenModal(true);
  };

  // ── Cuando cambia el código de error (o se selecciona) → auto-llenar ──
  const onErrCodeChange = (code) => {
    const match = errors.find(
      (e) =>
        e.brand?.toUpperCase() === form.platform?.toUpperCase() &&
        String(e.code) === String(code)
    );
    setForm((f) => ({
      ...f,
      errCode: code,
      ...(match
        ? {
            classification: match.classification || f.classification,
            equipment: match.equipment || f.equipment,
            problem: match.problem || f.problem,
            cause: match.cause || f.cause,
            solution: match.solution || f.solution,
            priority: f.priority || match.priority || '',
          }
        : {}),
    }));
  };

  // ── Cuando cambia el sitio/código de proyecto → buscar en Pólizas y auto-llenar ──
  const onProjectAutofill = () => {
    if (!form.code && !form.site) return;
    const codeU = (form.code || '').toUpperCase();
    const siteL = (form.site || '').toLowerCase();
    // 1. Coincidencia exacta primero
    let p = polizas.find(
      (x) =>
        (codeU && x.code?.toUpperCase() === codeU) ||
        (siteL && x.project?.toLowerCase() === siteL)
    );
    // 2. Si no, coincidencia parcial (substring) — útil mientras se escribe
    if (!p) {
      p = polizas.find(
        (x) =>
          (codeU && x.code?.toUpperCase().includes(codeU) && codeU.length >= 3) ||
          (siteL && x.project?.toLowerCase().includes(siteL) && siteL.length >= 3)
      );
    }
    if (p) {
      const newPlatform = normalizePlatform(p.platform) || p.platform;
      setForm((f) => ({
        ...f,
        site: p.project || f.site,
        code: p.code || f.code,
        client: p.grupo || f.client,
        platform: newPlatform || f.platform,   // se actualiza si la póliza tiene plataforma
        errCode: newPlatform !== f.platform ? '' : f.errCode,
      }));
      toast(`Datos cargados desde la póliza${newPlatform ? ` (${newPlatform})` : ''}`);
    }
  };

  const onSave = async () => {
    if (!form.site) return toast('El sitio es obligatorio', 'error');
    try {
      // Si pidió crear ticket, forzar Ticket Alta = SI
      const payload = { ...form };
      if (form._createTicket) {
        payload.ticketAlta = 'SI';
        if (!payload.ticketDate) payload.ticketDate = new Date().toISOString().slice(0, 10);
      }
      // Limpia campos internos antes de mandar
      delete payload._createTicket;
      delete payload._ticketTitle;
      delete payload._ticketAssigned;
      delete payload._ticketDueDate;
      delete payload._ticketTipo;
      delete payload._ticketDescription;

      let inc;
      if (editingId) {
        inc = await incidenciasApi.update(editingId, payload);
      } else {
        inc = await incidenciasApi.create(payload);
      }

      // Crear ticket si el usuario lo activó
      if (form._createTicket) {
        await ticketsApi.create({
          title: form._ticketTitle || `${form.classification || 'Atención'} — ${form.site}`,
          site: form.site,
          client: form.client,
          projectCode: form.code,
          priority: form.priority || 'Intermedia',
          status: 'Abierto',
          assignedTo: form._ticketAssigned,
          openDate: new Date().toISOString().slice(0, 10),
          dueDate: form._ticketDueDate,
          description: form._ticketDescription || form.notes,
          incidenciaId: inc.id,
        });
        toast('Incidencia y ticket creados');
      } else {
        toast(editingId ? 'Incidencia actualizada' : 'Incidencia creada');
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

  const exportXlsx = () => downloadXLSX(items, 'Incidencias', `incidencias_${Date.now()}.xlsx`);

  const columns = useMemo(() => [
    { key: 'id', label: '#' },
    { key: 'platform', label: 'Plataforma' },
    { key: 'site', label: 'Proyecto' },
    { key: 'client', label: 'Cliente' },
    { key: 'priority', label: 'Prioridad', render: (r) => <span className={`badge ${priorityClass(r.priority)}`}>{r.priority || '—'}</span> },
    { key: 'errCode', label: 'Error' },
    { key: 'classification', label: 'Clasif.' },
    { key: 'incDate', label: 'Fecha', render: (r) => fmtDate(r.incDate) },
    { key: 'ticketAlta', label: 'Ticket' },
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
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {hasRole('admin') && (
            <>
              <a className="btn btn-sm" href="/templates/incidencias_template.xlsx" download>📄 Plantilla</a>
              <ImportButton uploader={importarApi.incidencias} onDone={load} />
            </>
          )}
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
          {/* ── PROYECTO PRIMERO ── */}
          <FormRow label="Código proyecto">
            <div style={{ display: 'flex', gap: 4 }}>
              <input list="poliza-codes" value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                onBlur={onProjectAutofill}
                placeholder="Código de la planta"
                style={{ flex: 1 }} />
              <datalist id="poliza-codes">
                {polizas.map((p) => <option key={p.id} value={p.code}>{p.project}</option>)}
              </datalist>
            </div>
          </FormRow>
          <FormRow label="Proyecto *">
            <input list="poliza-projects" value={form.site}
              onChange={(e) => setForm({ ...form, site: e.target.value })}
              onBlur={onProjectAutofill}
              placeholder="Nombre del proyecto / planta" />
            <datalist id="poliza-projects">
              {polizas.map((p) => <option key={p.id} value={p.project}>{p.code}</option>)}
            </datalist>
          </FormRow>
          {/* ── PLATAFORMA: auto desde código/proyecto ── */}
          <FormRow label="Plataforma del equipo (auto)">
            <input
              value={form.platform || ''}
              readOnly
              className="readonly-auto"
              placeholder="Se rellena al elegir código o proyecto"
            />
          </FormRow>
          <FormRow label="Cliente">
            <input value={form.client} readOnly className="readonly-auto" />
          </FormRow>

          {/* ── CÓDIGO DE ERROR (dropdown filtrado por plataforma) ── */}
          <FormRow label={`Código de Error ${form.platform ? `(${codesForPlatform.length} disponibles)` : '— elige plataforma'}`}>
            <select value={form.errCode} onChange={(e) => onErrCodeChange(e.target.value)} disabled={!form.platform}>
              <option value="">—</option>
              {codesForPlatform.map((e) => (
                <option key={e.id} value={e.code}>
                  {e.code} — {e.problem || e.classification}
                </option>
              ))}
            </select>
          </FormRow>
          <FormRow label="Prioridad">
            <input value={form.priority} readOnly className="readonly-auto" />
          </FormRow>

          <FormRow label="Equipo">
            <input value={form.equipment} readOnly className="readonly-auto"
              placeholder="Se llena al elegir código de error" />
          </FormRow>
          <FormRow label="Problema">
            <input value={form.problem} readOnly className="readonly-auto" />
          </FormRow>

          <FormRow label="Causa Posible" full>
            <textarea rows="2" value={form.cause} readOnly className="readonly-auto" />
          </FormRow>
          <FormRow label="Solución" full>
            <textarea rows="2" value={form.solution} readOnly className="readonly-auto" />
          </FormRow>

          <FormRow label="Notas de Monitoreo" full>
            <textarea rows="2" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </FormRow>

          <FormRow label="Fecha/Hora Incidencia">
            <input type="date" value={form.incDate?.slice(0, 10) || ''} onChange={(e) => setForm({ ...form, incDate: e.target.value })} />
          </FormRow>
          <FormRow label="Alta de Ticket">
            <select value={form.ticketAlta} onChange={(e) => setForm({ ...form, ticketAlta: e.target.value })}>
              <option value="NO">NO</option>
              <option value="SI">SI — Ya generado</option>
            </select>
          </FormRow>
          <FormRow label="Fecha Ticket Plataforma">
            <input type="date" value={form.ticketDate?.slice(0, 10) || ''} onChange={(e) => setForm({ ...form, ticketDate: e.target.value })} />
          </FormRow>
          <FormRow label="Responsable">
            <input value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value })}
              placeholder="Nombre del responsable" />
          </FormRow>
          <FormRow label="Comentarios" full>
            <textarea rows="2" value={form.comments} onChange={(e) => setForm({ ...form, comments: e.target.value })} />
          </FormRow>

          {/* ─────────── PANEL DE TICKET INLINE ─────────── */}
          {!editingId && (
            <div className="full" style={{
              gridColumn: '1/-1',
              border: '1px solid var(--sky)',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
              marginTop: 8,
            }}>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'var(--sky)', color: '#fff',
                padding: '10px 14px', cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={form._createTicket}
                  onChange={(e) => setForm({ ...form, _createTicket: e.target.checked })}
                />
                <strong>📋 Crear ticket de atención simultáneamente</strong>
                <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.85 }}>
                  Marcará Ticket Alta = SI automáticamente
                </span>
              </label>
              {form._createTicket && (
                <div style={{ padding: 14, background: '#F0F9FF' }}>
                  <div className="form-grid">
                    <FormRow label="Título del ticket">
                      <input value={form._ticketTitle}
                        onChange={(e) => setForm({ ...form, _ticketTitle: e.target.value })}
                        placeholder={`${form.classification || 'Atención'} — ${form.site || 'sitio'}`} />
                    </FormRow>
                    <FormRow label="Tipo de atención">
                      <select value={form._ticketTipo} onChange={(e) => setForm({ ...form, _ticketTipo: e.target.value })}>
                        <option>Remota</option>
                        <option>Presencial</option>
                        <option>Mixta</option>
                      </select>
                    </FormRow>
                    <FormRow label="Asignar a (usuario o cuadrilla)">
                      <select value={form._ticketAssigned}
                        onChange={(e) => setForm({ ...form, _ticketAssigned: e.target.value })}>
                        <option value="">— elegir —</option>
                        <optgroup label="Usuarios">
                          {assignees.filter((a) => a.type === 'user').map((a) => (
                            <option key={a.id} value={a.value}>{a.label}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Cuadrillas">
                          {assignees.filter((a) => a.type === 'cuadrilla').map((a) => (
                            <option key={a.id} value={a.value}>{a.label}</option>
                          ))}
                        </optgroup>
                      </select>
                    </FormRow>
                    <FormRow label="Fecha compromiso visita">
                      <input type="date" value={form._ticketDueDate}
                        onChange={(e) => setForm({ ...form, _ticketDueDate: e.target.value })} />
                    </FormRow>
                    <FormRow label="Comentarios del ticket" full>
                      <textarea rows="2" value={form._ticketDescription}
                        onChange={(e) => setForm({ ...form, _ticketDescription: e.target.value })}
                        placeholder="Instrucciones, materiales necesarios, etc." />
                    </FormRow>
                  </div>
                </div>
              )}
            </div>
          )}
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
