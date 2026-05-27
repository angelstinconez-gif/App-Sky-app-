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
  const [viewModal, setViewModal] = useState(null);   // incidencia para visualización (solo lectura)
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

  // ── Auto-fill desde Pólizas: busca SOLO por el campo que el usuario acaba de cambiar
  //    (si no, al cambiar el código sigue encontrando el sitio antiguo y revierte).
  const onProjectAutofill = (changedField /* 'code' | 'site' | undefined */) => {
    const codeU = (form.code || '').toUpperCase().trim();
    const siteL = (form.site || '').toLowerCase().trim();
    if (!codeU && !siteL) return;

    let p = null;
    const matchByCode = (exact) => polizas.find((x) => {
      const c = (x.code || '').toUpperCase();
      return exact ? c === codeU : (c.includes(codeU) && codeU.length >= 3);
    });
    const matchBySite = (exact) => polizas.find((x) => {
      const s = (x.project || '').toLowerCase();
      return exact ? s === siteL : (s.includes(siteL) && siteL.length >= 3);
    });

    if (changedField === 'code' && codeU) {
      p = matchByCode(true) || matchByCode(false);
    } else if (changedField === 'site' && siteL) {
      p = matchBySite(true) || matchBySite(false);
    } else {
      // Sin indicación: probar exacto primero por ambos
      p = (codeU && matchByCode(true)) || (siteL && matchBySite(true))
        || (codeU && matchByCode(false)) || (siteL && matchBySite(false));
    }

    if (p) {
      const newPlatform = normalizePlatform(p.platform) || p.platform || '';
      setForm((f) => {
        const platformChanged = newPlatform && newPlatform !== f.platform;
        return {
          ...f,
          // Sobrescribir TODOS los campos del proyecto con los de la nueva póliza
          site: p.project || '',
          code: p.code || '',
          client: p.grupo || '',
          platform: newPlatform || f.platform,
          // Si la plataforma cambia, limpia el código de error (era de otra plataforma)
          errCode: platformChanged ? '' : f.errCode,
          equipment: platformChanged ? '' : f.equipment,
        };
      });
      toast(`✓ Datos cargados: ${p.project}${newPlatform ? ` · ${newPlatform}` : ''}`);
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

  // ── Helper: estado de póliza para un proyecto ──
  // Devuelve { vigente, pol, msg } basado en pol_end de la póliza relacionada.
  const polizaInfo = (siteOrCode) => {
    if (!siteOrCode) return { vigente: null, pol: null, msg: 'Sin proyecto' };
    const lc = siteOrCode.toLowerCase();
    const pol = polizas.find((p) =>
      p.project?.toLowerCase() === lc || p.code?.toLowerCase() === lc
    );
    if (!pol) return { vigente: false, pol: null, msg: 'Sin póliza registrada' };
    if (!pol.polEnd) return { vigente: false, pol, msg: 'Póliza sin fecha de vencimiento' };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const end = new Date(pol.polEnd);
    const dias = Math.floor((end - today) / 86400000);
    if (dias < 0) return { vigente: false, pol, msg: `Vencida hace ${-dias} días` };
    if (dias <= 30) return { vigente: true, pol, msg: `Vence en ${dias} días ⚠️`, porVencer: true };
    return { vigente: true, pol, msg: `Vigente (${dias}d)` };
  };

  // ── Modal rápido para generar ticket desde una incidencia existente ──
  const [genTicketFor, setGenTicketFor] = useState(null);  // incidencia seleccionada
  const [genMode, setGenMode] = useState('normal');        // 'normal' | 'especial'
  const [genForm, setGenForm] = useState({
    title: '', assignedTo: '', dueDate: '', tipo: 'Remota', description: '',
    requiereCotizacion: false, justificacion: '',
  });

  const openGenTicket = (inc, mode = 'normal') => {
    const info = polizaInfo(inc.code || inc.site);
    setGenMode(mode);
    setGenForm({
      title: mode === 'especial'
        ? `[ATENCIÓN ESPECIAL] ${inc.classification || inc.equipment || 'Atención'} — ${inc.site || ''}`
        : `${inc.classification || inc.equipment || 'Atención'} — ${inc.site || ''}`,
      assignedTo: '',
      dueDate: '',
      tipo: mode === 'especial' ? 'Fuera de póliza' : 'Remota',
      description: inc.notes || inc.problem || '',
      requiereCotizacion: mode === 'especial',
      justificacion: mode === 'especial' ? info.msg : '',
    });
    setGenTicketFor(inc);
  };

  const onGenTicketSave = async () => {
    if (!genTicketFor) return;
    try {
      // Compone descripción con justificación de atención especial si aplica
      let desc = genForm.description || '';
      if (genMode === 'especial') {
        desc = `⚠️ ATENCIÓN ESPECIAL (fuera de póliza)\n` +
               `Motivo: ${genForm.justificacion || 'Póliza no vigente'}\n` +
               (genForm.requiereCotizacion ? `🧾 Requiere cotización previa\n` : '') +
               `\n${desc}`;
      }
      // 1. Crear el ticket
      await ticketsApi.create({
        title: genForm.title || `Atención — ${genTicketFor.site}`,
        site: genTicketFor.site,
        client: genTicketFor.client,
        projectCode: genTicketFor.code,
        priority: genMode === 'especial' ? 'Alta' : (genTicketFor.priority || 'Intermedia'),
        status: genMode === 'especial' ? 'En espera de aprobación' : 'Abierto',
        assignedTo: genForm.assignedTo,
        openDate: new Date().toISOString().slice(0, 10),
        dueDate: genForm.dueDate,
        description: desc,
        incidenciaId: genTicketFor.id,
      });
      // 2. Marcar la incidencia con ticket_alta = SI
      await incidenciasApi.update(genTicketFor.id, {
        ...genTicketFor,
        ticketAlta: 'SI',
        ticketDate: new Date().toISOString().slice(0, 10),
      });
      toast(genMode === 'especial'
        ? `⚠️ Ticket de atención ESPECIAL generado (incidencia #${genTicketFor.id})`
        : `✓ Ticket generado para incidencia #${genTicketFor.id}`);
      setGenTicketFor(null);
      load();
    } catch (e) {
      toast(e?.response?.data?.message || 'Error al generar ticket', 'error');
    }
  };

  // Helpers para detectar si la incidencia ya tiene ticket
  const hasTicket = (r) => {
    const t = (r.ticketAlta || '').toString().toUpperCase().trim();
    return t === 'SI' || t === 'YES' || t === '1';
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
    { key: 'createdAt', label: 'Creada', render: (r) => fmtDate(r.createdAt) },
    { key: 'incDate', label: 'F. incidencia', render: (r) => fmtDate(r.incDate) },
    {
      key: 'ticketAlta', label: 'Ticket',
      render: (r) => hasTicket(r)
        ? <span className="badge s-vigente">✓ SI {r.ticketDate ? `· ${fmtDate(r.ticketDate)}` : ''}</span>
        : <span className="badge s-abierta">Sin ticket</span>,
    },
    { key: 'days', label: 'Días', render: (r) => (r.days != null ? `${r.days}d` : '—') },
    { key: 'status', label: 'Estado', render: (r) => <span className={`badge ${statusClass(r.status)}`}>{r.status}</span> },
    {
      key: '_actions', label: 'Acciones', sortable: false,
      render: (r) => {
        const info = polizaInfo(r.code || r.site);
        return (
          <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center', flexWrap: 'nowrap' }}>
            {/* Botón "Ver detalle" — disponible para TODOS los roles, siempre */}
            <button className="btn btn-sm" title="Ver detalle (solo lectura)"
              onClick={() => setViewModal(r)}>👁</button>
            {canWrite && r.status === 'abierta' && (
              <>
                <button className="btn btn-sm" title="Editar" onClick={() => onEdit(r)}>✏️</button>
                {!hasTicket(r) && (
                  info.vigente ? (
                    <button className="btn btn-sm btn-primary"
                      title={`Generar ticket — Póliza ${info.msg}`}
                      onClick={() => openGenTicket(r, 'normal')}
                      style={{ padding: '4px 8px' }}>
                      🎫
                    </button>
                  ) : (
                    <button className="btn btn-sm"
                      title={`Asignación especial: ${info.msg}`}
                      onClick={() => openGenTicket(r, 'especial')}
                      style={{ background: '#fef3c7', color: '#92400e', borderColor: '#f59e0b', padding: '4px 8px' }}>
                      ⚠️
                    </button>
                  )
                )}
                <button className="btn btn-sm" title="Cerrar incidencia" onClick={() => setCloseModal(r)}>✓</button>
              </>
            )}
            {canDelete && <button className="btn btn-sm btn-danger" title="Eliminar" onClick={() => onDelete(r.id)}>×</button>}
          </div>
        );
      },
    },
  ], [canWrite, canDelete, polizas]);

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

      {/* ── Banner: incidencias abiertas sin ticket ── */}
      {(() => {
        const sinTicket = items.filter((r) => r.status === 'abierta' && !hasTicket(r));
        if (sinTicket.length === 0 || !canWrite) return null;
        const vigentes = sinTicket.filter((r) => polizaInfo(r.code || r.site).vigente);
        const noVigentes = sinTicket.filter((r) => !polizaInfo(r.code || r.site).vigente);
        return (
          <div style={{
            background: '#fff7ed', border: '1px solid #fed7aa',
            borderLeft: '4px solid #f97316', borderRadius: 8,
            padding: '10px 14px', marginBottom: 12,
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <div style={{ flex: 1, fontSize: 13, minWidth: 200 }}>
              <strong>{sinTicket.length} incidencia{sinTicket.length === 1 ? '' : 's'} abierta{sinTicket.length === 1 ? '' : 's'} sin ticket.</strong>{' '}
              <span style={{ color: 'var(--gray-600)' }}>
                {vigentes.length > 0 && `${vigentes.length} con póliza vigente`}
                {vigentes.length > 0 && noVigentes.length > 0 && ' · '}
                {noVigentes.length > 0 && `${noVigentes.length} requieren atención especial`}
              </span>
            </div>
            {vigentes.length > 0 && (
              <button className="btn btn-sm btn-primary"
                onClick={() => openGenTicket(vigentes[0], 'normal')}>
                🎫 Generar (vigente)
              </button>
            )}
            {noVigentes.length > 0 && (
              <button className="btn btn-sm"
                onClick={() => openGenTicket(noVigentes[0], 'especial')}
                style={{ background: '#fef3c7', color: '#92400e', borderColor: '#f59e0b' }}>
                ⚠️ Atención especial
              </button>
            )}
          </div>
        );
      })()}

      {loading ? <div className="empty"><span className="spinner" /></div> : <DataTable columns={columns} data={items} />}

      {/* ── Modal: Generar ticket desde incidencia ── */}
      <Modal
        open={!!genTicketFor} onClose={() => setGenTicketFor(null)}
        title={genTicketFor ? (
          genMode === 'especial'
            ? `⚠️ Asignación especial — Incidencia #${genTicketFor.id}`
            : `🎫 Generar ticket — Incidencia #${genTicketFor.id}`
        ) : ''}
        wide
        footer={
          <>
            <button className="btn" onClick={() => setGenTicketFor(null)}>Cancelar</button>
            <button
              className="btn btn-primary"
              onClick={onGenTicketSave}
              style={genMode === 'especial' ? { background: '#f59e0b', borderColor: '#f59e0b' } : undefined}
            >
              {genMode === 'especial' ? '⚠️ Crear ticket especial' : 'Crear ticket'}
            </button>
          </>
        }
      >
        {genTicketFor && (() => {
          const info = polizaInfo(genTicketFor.code || genTicketFor.site);
          return (
            <div className="form-grid">
              {/* Resumen de la incidencia */}
              <div className="form-row full" style={{
                background: 'var(--gray-50)', padding: 12, borderRadius: 8, marginBottom: 4,
              }}>
                <div style={{ fontSize: 12, color: 'var(--gray-700)', lineHeight: 1.7 }}>
                  <div><strong>Proyecto:</strong> {genTicketFor.site || '—'} · <strong>Cliente:</strong> {genTicketFor.client || '—'}</div>
                  <div><strong>Plataforma:</strong> {genTicketFor.platform || '—'} · <strong>Error:</strong> {genTicketFor.errCode || '—'} · <strong>Prioridad inc:</strong> {genTicketFor.priority || '—'}</div>
                </div>
              </div>

              {/* Estado de póliza */}
              <div className="form-row full" style={{
                background: info.vigente ? '#dcfce7' : '#fef3c7',
                border: `1px solid ${info.vigente ? '#86efac' : '#fcd34d'}`,
                borderLeft: `4px solid ${info.vigente ? '#16a34a' : '#f59e0b'}`,
                padding: 10, borderRadius: 8, marginBottom: 4, fontSize: 12,
                color: info.vigente ? '#065f46' : '#92400e',
              }}>
                {info.vigente ? '✓' : '⚠️'} <strong>Póliza: {info.msg}</strong>
                {info.pol && <span> · Fin: {info.pol.polEnd || 's/f'} · Tipo: {info.pol.poliza || '—'}</span>}
                {genMode === 'especial' && (
                  <div style={{ marginTop: 6, fontWeight: 600 }}>
                    Esta atención queda registrada como <em>fuera de cobertura</em> y se marca como pendiente de aprobación.
                  </div>
                )}
              </div>

              <FormRow label="Título del ticket" full>
                <input value={genForm.title}
                  onChange={(e) => setGenForm({ ...genForm, title: e.target.value })} />
              </FormRow>

              <FormRow label="Asignado a">
                <select value={genForm.assignedTo}
                  onChange={(e) => setGenForm({ ...genForm, assignedTo: e.target.value })}>
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

              <FormRow label="Tipo de atención">
                <select value={genForm.tipo}
                  onChange={(e) => setGenForm({ ...genForm, tipo: e.target.value })}>
                  {genMode === 'especial' ? (
                    <>
                      <option>Fuera de póliza</option>
                      <option>Atención por garantía vencida</option>
                      <option>Visita extraordinaria</option>
                      <option>Cortesía</option>
                    </>
                  ) : (
                    <>
                      <option>Remota</option>
                      <option>Visita en sitio</option>
                      <option>Garantía</option>
                    </>
                  )}
                </select>
              </FormRow>

              <FormRow label="Fecha compromiso">
                <input type="date" value={genForm.dueDate}
                  onChange={(e) => setGenForm({ ...genForm, dueDate: e.target.value })} />
              </FormRow>

              {genMode === 'especial' && (
                <>
                  <FormRow label="Justificación / motivo *" full>
                    <input value={genForm.justificacion}
                      onChange={(e) => setGenForm({ ...genForm, justificacion: e.target.value })}
                      placeholder="Por qué se da la atención aun fuera de póliza" />
                  </FormRow>
                  <FormRow label="" full>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                      <input type="checkbox" checked={genForm.requiereCotizacion}
                        onChange={(e) => setGenForm({ ...genForm, requiereCotizacion: e.target.checked })} />
                      🧾 Requiere cotización previa al cliente
                    </label>
                  </FormRow>
                </>
              )}

              <FormRow label="Descripción de la atención" full>
                <textarea rows="3" value={genForm.description}
                  onChange={(e) => setGenForm({ ...genForm, description: e.target.value })}
                  placeholder="Detalles de la atención necesaria" />
              </FormRow>
            </div>
          );
        })()}
      </Modal>

      {/* ── Modal: VISTA DETALLE (solo lectura, todos los roles) ── */}
      <Modal
        open={!!viewModal} onClose={() => setViewModal(null)}
        title={viewModal ? `👁 Incidencia #${viewModal.id} (solo lectura)` : ''}
        wide
        footer={<button className="btn btn-primary" onClick={() => setViewModal(null)}>Cerrar</button>}
      >
        {viewModal && (() => {
          const info = polizaInfo(viewModal.code || viewModal.site);
          const Field = ({ label, value, full }) => (
            <div className={`form-row ${full ? 'full' : ''}`}>
              <label style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</label>
              <div style={{ padding: '6px 10px', background: 'var(--gray-50)', borderRadius: 6, minHeight: 32, fontSize: 13 }}>
                {value || <span style={{ color: 'var(--gray-400)' }}>—</span>}
              </div>
            </div>
          );
          return (
            <div>
              {/* Encabezado con badges */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                <span className={`badge ${priorityClass(viewModal.priority)}`}>{viewModal.priority || 's/p'}</span>
                <span className={`badge ${statusClass(viewModal.status)}`}>{viewModal.status}</span>
                {hasTicket(viewModal)
                  ? <span className="badge s-vigente">🎫 Con ticket {viewModal.ticketDate && `· ${fmtDate(viewModal.ticketDate)}`}</span>
                  : <span className="badge s-abierta">Sin ticket</span>}
                <span style={{
                  background: info.vigente ? '#dcfce7' : '#fef3c7',
                  color: info.vigente ? '#065f46' : '#92400e',
                  padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                }}>
                  Póliza: {info.msg}
                </span>
              </div>

              <div className="form-grid">
                <Field label="Plataforma" value={viewModal.platform} />
                <Field label="Código proyecto" value={viewModal.code} />
                <Field label="Proyecto" value={viewModal.site} />
                <Field label="Cliente" value={viewModal.client} />
                <Field label="Código de error" value={viewModal.errCode} />
                <Field label="Clasificación" value={viewModal.classification} />
                <Field label="Equipo" value={viewModal.equipment} />
                <Field label="Responsable" value={viewModal.responsible} />
                <Field label="Fecha incidencia" value={fmtDate(viewModal.incDate)} />
                <Field label="Fecha creación" value={fmtDate(viewModal.createdAt)} />
                <Field label="Días abierta" value={viewModal.days != null ? `${viewModal.days}d` : null} />
                <Field label="Última modificación" value={fmtDate(viewModal.lastMod || viewModal.updatedAt)} />
                <Field label="Problema (síntoma)" value={viewModal.problem} full />
                <Field label="Causa" value={viewModal.cause} full />
                <Field label="Solución aplicada" value={viewModal.solution} full />
                <Field label="Notas" value={viewModal.notes} full />
                <Field label="Comentarios" value={viewModal.comments} full />
                {viewModal.status === 'cerrada' && (
                  <>
                    <Field label="Cerrada por" value={viewModal.closedBy} />
                    <Field label="Fecha cierre" value={fmtDate(viewModal.closedAt)} />
                    <Field label="Resultado del cierre" value={viewModal.closeResult} full />
                  </>
                )}
              </div>
            </div>
          );
        })()}
      </Modal>

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
                onBlur={() => onProjectAutofill('code')}
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
              onBlur={() => onProjectAutofill('site')}
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
