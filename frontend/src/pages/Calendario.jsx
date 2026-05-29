import { useEffect, useMemo, useState } from 'react';
import { eventosApi, mantenimientoApi, incidenciasApi, ticketsApi, polizasApi } from '../api/endpoints';
import { fmtDate } from '../utils/format';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';

const VIEWS = [
  { id: 'day', label: 'Día' },
  { id: 'month', label: 'Mes' },
  { id: 'year', label: 'Año' },
];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const TYPE_FILTERS = [
  { id: 'mantenimiento', label: 'Mantenimientos', color: '#f59e0b' },
  { id: 'ticket',        label: 'Tickets',        color: '#0EA5E9' },
  { id: 'incidencia',    label: 'Incidencias',    color: '#e11d48' },
  { id: 'evento',        label: 'Eventos / avisos', color: '#8b5cf6' },
];

export default function Calendario() {
  const { hasRole } = useAuth();
  const toast = useToast();
  const canSchedule = hasRole('admin', 'operator');

  const [view, setView] = useState('month');
  const [cursor, setCursor] = useState(() => new Date());
  const [activeTypes, setActiveTypes] = useState(() => TYPE_FILTERS.map((t) => t.id));
  const [projectFilter, setProjectFilter] = useState('');
  const [events, setEvents] = useState([]);
  const [mants, setMants] = useState([]);
  const [tks, setTks] = useState([]);
  const [incs, setIncs] = useState([]);
  const [polizas, setPolizas] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal: agendar nuevo (ticket o mantenimiento)
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    kind: 'ticket', date: '', title: '', project: '', code: '', priority: 'Intermedia',
    tipo: 'Preventivo', cuadrilla: '', notes: '',
  });

  // Modal: detalle de evento seleccionado
  const [detailItem, setDetailItem] = useState(null);

  const toggleType = (id) =>
    setActiveTypes((arr) => arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  // Carga datos del año actual (cubre vista año, mes y día)
  useEffect(() => {
    const y = cursor.getFullYear();
    const start = `${y}-01-01`;
    const end = `${y}-12-31`;
    setLoading(true);
    Promise.all([
      eventosApi.list({ start, end }).catch(() => []),
      mantenimientoApi.list().catch(() => []),
      ticketsApi.list().catch(() => []),
      incidenciasApi.list().catch(() => []),
    ]).then(([ev, mt, tk, inc]) => {
      setEvents(ev || []);
      setMants(mt || []);
      setTks(tk || []);
      setIncs(inc || []);
    }).finally(() => setLoading(false));
  }, [cursor.getFullYear()]);

  useEffect(() => { polizasApi.list().then(setPolizas).catch(() => {}); }, []);

  // ── Auto-fill al teclear proyecto/código en el modal agendar ──
  const onScheduleProject = (val) => {
    setScheduleForm((f) => ({ ...f, project: val }));
    const p = polizas.find((x) =>
      x.project?.toLowerCase() === val.toLowerCase() ||
      x.code?.toLowerCase() === val.toLowerCase()
    );
    if (p) setScheduleForm((f) => ({ ...f, project: p.project, code: p.code || f.code }));
  };

  const onSaveSchedule = async () => {
    const { kind, date, title, project, code, priority, tipo, cuadrilla, notes } = scheduleForm;
    if (!date) return toast('Falta la fecha', 'error');
    if (!project && !title) return toast('Indica proyecto o título', 'error');
    try {
      if (kind === 'ticket') {
        await ticketsApi.create({
          title: title || `Visita — ${project}`,
          site: project, projectCode: code, priority,
          status: 'Abierto',
          openDate: new Date().toISOString().slice(0, 10),
          dueDate: date,
          description: notes,
        });
        toast(`Ticket programado para ${date}`);
      } else {
        await mantenimientoApi.create({
          project, code, tipo, cuadrilla,
          fechaProgramada: date, estado: 'Programado',
          descripcion: notes,
        });
        toast(`Mantenimiento programado para ${date}`);
      }
      setScheduleOpen(false);
      // Recargar datos
      const y = cursor.getFullYear();
      const start = `${y}-01-01`, end = `${y}-12-31`;
      Promise.all([
        eventosApi.list({ start, end }).catch(() => []),
        mantenimientoApi.list().catch(() => []),
        ticketsApi.list().catch(() => []),
        incidenciasApi.list().catch(() => []),
      ]).then(([ev, mt, tk, inc]) => {
        setEvents(ev || []); setMants(mt || []); setTks(tk || []); setIncs(inc || []);
      });
    } catch (e) {
      toast(e?.response?.data?.message || 'Error al agendar', 'error');
    }
  };

  const openSchedule = (iso, kind = 'ticket') => {
    setScheduleForm((f) => ({ ...f, kind, date: iso || new Date().toISOString().slice(0, 10) }));
    setScheduleOpen(true);
  };

  // Normaliza todos en {id, date, title, type, color, project, tooltip, raw}
  const allItems = useMemo(() => {
    const ms = mants.map((m) => ({
      id: `m-${m.id}`,
      date: (m.fecha_programada || m.fechaProgramada || '').slice(0, 10),
      title: `${m.tipo || 'Mant.'} — ${m.project || m.proyecto || ''}`,
      project: m.project || m.proyecto || '',
      type: 'mantenimiento',
      color: m.estado === 'Ejecutado' ? '#16a34a' : '#f59e0b',
      tooltip: `🔧 ${m.tipo || 'Mantenimiento'}\nProyecto: ${m.project || m.proyecto || '—'}\nEstado: ${m.estado || '—'}\nCuadrilla: ${m.cuadrilla || '—'}\nResponsable: ${m.responsable || '—'}`,
      raw: m,
    })).filter((x) => x.date);
    const tt = tks.map((t) => ({
      id: `t-${t.id}`,
      date: (t.openDate || t.open_date || '').slice(0, 10),
      title: `#${t.id} ${t.title || ''}`,
      project: t.site || '',
      type: 'ticket',
      color: t.status === 'Cerrado' ? '#16a34a' : '#0EA5E9',
      tooltip: `🎫 Ticket #${t.id}\n${t.title || ''}\nProyecto: ${t.site || '—'}\nPrioridad: ${t.priority || '—'}\nEstado: ${t.status || '—'}\nAsignado: ${t.assignedTo || '—'}\nApertura: ${t.openDate || '—'}\nCompromiso: ${t.dueDate || '—'}`,
      raw: t,
    })).filter((x) => x.date);
    const ii = incs.map((i) => ({
      id: `i-${i.id}`,
      date: (i.incDate || i.inc_date || '').slice(0, 10),
      title: `${i.site || ''} — ${i.problem || i.errCode || ''}`,
      project: i.site || '',
      type: 'incidencia',
      color: i.status === 'cerrada' ? '#16a34a' : '#e11d48',
      tooltip: `⚠️ Incidencia #${i.id}\nProyecto: ${i.site || '—'}\nCliente: ${i.client || '—'}\nPlataforma: ${i.platform || '—'}\nCódigo error: ${i.errCode || '—'}\nProblema: ${i.problem || '—'}\nPrioridad: ${i.priority || '—'}\nEstado: ${i.status || '—'}`,
      raw: i,
    })).filter((x) => x.date);
    const ee = events.map((e) => ({
      id: `e-${e.id}`, date: e.eventDate, title: e.title,
      project: e.project || '', type: 'evento', color: e.color || '#8b5cf6',
      tooltip: `📅 ${e.title}\nFecha: ${e.eventDate}\nTipo: ${e.eventType || 'evento'}`,
      raw: e,
    }));
    const all = [...ms, ...tt, ...ii, ...ee].filter((x) => activeTypes.includes(x.type));
    if (!projectFilter.trim()) return all;
    const q = projectFilter.toLowerCase().trim();
    return all.filter((x) => (x.project || '').toLowerCase().includes(q));
  }, [events, mants, tks, incs, activeTypes, projectFilter]);

  // Lista única de proyectos (de pólizas + de items) para el datalist
  const projectsList = useMemo(() => {
    const set = new Set();
    polizas.forEach((p) => p.project && set.add(p.project));
    [...mants, ...tks, ...incs].forEach((x) => {
      const p = x.project || x.proyecto || x.site;
      if (p) set.add(p);
    });
    return [...set].sort();
  }, [polizas, mants, tks, incs]);

  const onMonthSelect = (idx) => setCursor(new Date(cursor.getFullYear(), idx, 1));
  const onYearChange = (y) => setCursor(new Date(parseInt(y, 10), cursor.getMonth(), 1));
  const navDay = (d) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + d));
  const navMonth = (d) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + d, 1));
  const navYear = (d) => setCursor(new Date(cursor.getFullYear() + d, cursor.getMonth(), 1));

  const yearOptions = [];
  const thisYear = new Date().getFullYear();
  for (let y = thisYear - 3; y <= thisYear + 5; y++) yearOptions.push(y);

  return (
    <div>
      <div className="section-header">
        <h2>Calendario</h2>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 0, border: '1px solid var(--gray-200, #e5e7eb)', borderRadius: 6, overflow: 'hidden' }}>
            {VIEWS.map((v) => (
              <button key={v.id} className="btn btn-sm"
                style={{
                  borderRadius: 0, border: 'none',
                  background: view === v.id ? 'var(--sky, #0EA5E9)' : 'transparent',
                  color: view === v.id ? '#fff' : 'inherit',
                }}
                onClick={() => setView(v.id)}>{v.label}</button>
            ))}
          </div>
          <select className="filter-select" value={cursor.getMonth()} onChange={(e) => onMonthSelect(parseInt(e.target.value, 10))}>
            {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select className="filter-select" value={cursor.getFullYear()} onChange={(e) => onYearChange(e.target.value)}>
            {yearOptions.map((y) => <option key={y}>{y}</option>)}
          </select>
          {view === 'day' && <><button className="btn btn-sm" onClick={() => navDay(-1)}>‹</button><button className="btn btn-sm" onClick={() => navDay(1)}>›</button></>}
          {view === 'month' && <><button className="btn btn-sm" onClick={() => navMonth(-1)}>‹</button><button className="btn btn-sm" onClick={() => navMonth(1)}>›</button></>}
          {view === 'year' && <><button className="btn btn-sm" onClick={() => navYear(-1)}>‹</button><button className="btn btn-sm" onClick={() => navYear(1)}>›</button></>}
          <button className="btn btn-sm" onClick={() => setCursor(new Date())}>Hoy</button>
          {canSchedule && (
            <button className="btn btn-sm btn-primary" onClick={() => openSchedule(null, 'ticket')}>
              + Agendar
            </button>
          )}
        </div>
      </div>

      {/* ── Buscador por proyecto ── */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0 12px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>🔍 Filtrar por proyecto:</span>
        <input
          list="cal-projects"
          className="filter-input"
          placeholder="Empieza a escribir el proyecto..."
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          style={{ minWidth: 260 }}
        />
        <datalist id="cal-projects">
          {projectsList.map((p) => <option key={p} value={p} />)}
        </datalist>
        {projectFilter && (
          <button className="btn btn-sm" onClick={() => setProjectFilter('')}>× Quitar filtro</button>
        )}
      </div>

      {/* ── Filtros por tipo (chips) ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0 16px' }}>
        <span style={{ fontSize: 12, color: 'var(--gray-500)', alignSelf: 'center' }}>Mostrar:</span>
        {TYPE_FILTERS.map((t) => {
          const on = activeTypes.includes(t.id);
          return (
            <button
              key={t.id}
              onClick={() => toggleType(t.id)}
              style={{
                fontSize: 12, padding: '4px 10px', borderRadius: 999,
                border: `2px solid ${t.color}`,
                background: on ? t.color : 'transparent',
                color: on ? '#fff' : t.color,
                cursor: 'pointer', fontWeight: 600,
              }}
            >
              {on ? '✓ ' : ''}{t.label}
            </button>
          );
        })}
        <button
          onClick={() => setActiveTypes(activeTypes.length === TYPE_FILTERS.length ? [] : TYPE_FILTERS.map((t) => t.id))}
          className="btn btn-sm" style={{ marginLeft: 'auto' }}>
          {activeTypes.length === TYPE_FILTERS.length ? 'Quitar todos' : 'Ver todos'}
        </button>
      </div>

      {loading ? <div className="empty"><span className="spinner" /></div> : (
        view === 'month' ? <MonthView cursor={cursor} items={allItems} canSchedule={canSchedule}
          onDayClick={(iso) => openSchedule(iso, 'ticket')}
          onItemClick={(it) => setDetailItem(it)} /> :
        view === 'year' ? <YearView cursor={cursor} items={allItems} onPick={onMonthSelect} /> :
        <DayView cursor={cursor} items={allItems} canSchedule={canSchedule}
          onItemClick={(it) => setDetailItem(it)}
          onSchedule={(kind) => openSchedule(
            `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`,
            kind
          )} />
      )}

      <div style={{ marginTop: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Próximos en {cursor.getFullYear()}</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Título</th></tr></thead>
            <tbody>
              {allItems
                .filter((e) => e.date >= new Date().toISOString().slice(0, 10))
                .sort((a, b) => a.date.localeCompare(b.date))
                .slice(0, 20)
                .map((e) => (
                  <tr key={e.id}>
                    <td>{fmtDate(e.date)}</td>
                    <td><span style={{ background: e.color, color: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 10 }}>{e.type}</span></td>
                    <td>{e.title}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal: Detalle del evento seleccionado ── */}
      <Modal
        open={!!detailItem} onClose={() => setDetailItem(null)}
        title={detailItem ? `${detailItem.type === 'mantenimiento' ? '🔧' : detailItem.type === 'ticket' ? '🎫' : detailItem.type === 'incidencia' ? '⚠️' : '📅'} ${detailItem.title || ''}` : ''}
        wide
        footer={
          <>
            {detailItem && detailItem.type === 'ticket' && (
              <button className="btn" onClick={() => { setDetailItem(null); window.open('/tickets', '_blank'); }}>Ir a Tickets</button>
            )}
            {detailItem && detailItem.type === 'mantenimiento' && (
              <button className="btn" onClick={() => { setDetailItem(null); window.open('/mantenimiento', '_blank'); }}>Ir a Mantenimiento</button>
            )}
            {detailItem && detailItem.type === 'incidencia' && (
              <button className="btn" onClick={() => { setDetailItem(null); window.open('/incidencias', '_blank'); }}>Ir a Incidencias</button>
            )}
            <button className="btn btn-primary" onClick={() => setDetailItem(null)}>Cerrar</button>
          </>
        }
      >
        {detailItem && (
          <div style={{
            background: 'var(--gray-50)', padding: 14, borderRadius: 8, fontSize: 13, lineHeight: 1.7,
            borderLeft: `4px solid ${detailItem.color}`,
          }}>
            <div style={{ marginBottom: 10 }}>
              <span style={{
                background: detailItem.color, color: 'white',
                padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
              }}>{detailItem.type}</span>
              <span style={{ marginLeft: 10, color: 'var(--gray-500)', fontSize: 12 }}>
                📅 {fmtDate(detailItem.date)}
              </span>
            </div>
            <h3 style={{ marginBottom: 12, color: 'var(--gray-800)' }}>{detailItem.title}</h3>
            <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', color: 'var(--gray-700)' }}>
              {detailItem.tooltip}
            </div>
            {detailItem.raw && (
              <details style={{ marginTop: 14, fontSize: 11, color: 'var(--gray-500)' }}>
                <summary style={{ cursor: 'pointer' }}>Ver datos completos (JSON)</summary>
                <pre style={{
                  fontSize: 10, padding: 8, background: 'var(--gray-100)', borderRadius: 4,
                  marginTop: 6, overflow: 'auto', maxHeight: 220,
                }}>
                  {JSON.stringify(detailItem.raw, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
      </Modal>

      {/* ── Modal: Agendar ticket o mantenimiento ── */}
      <Modal
        open={scheduleOpen} onClose={() => setScheduleOpen(false)}
        title={`Agendar ${scheduleForm.kind === 'ticket' ? 'ticket' : 'mantenimiento'}`}
        footer={
          <>
            <button className="btn" onClick={() => setScheduleOpen(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={onSaveSchedule}>Programar</button>
          </>
        }
      >
        <div className="form-grid">
          <div className="form-row">
            <label>Tipo</label>
            <select value={scheduleForm.kind} onChange={(e) => setScheduleForm({ ...scheduleForm, kind: e.target.value })}>
              <option value="ticket">🎫 Ticket de visita</option>
              <option value="mantenimiento">🔧 Mantenimiento programado</option>
            </select>
          </div>
          <div className="form-row">
            <label>Fecha *</label>
            <input type="date" value={scheduleForm.date} onChange={(e) => setScheduleForm({ ...scheduleForm, date: e.target.value })} />
          </div>
          <div className="form-row full">
            <label>Proyecto / Planta *</label>
            <input list="sch-projects" value={scheduleForm.project}
              onChange={(e) => onScheduleProject(e.target.value)}
              placeholder="Empieza a escribir el proyecto..." />
            <datalist id="sch-projects">
              {projectsList.map((p) => <option key={p} value={p} />)}
            </datalist>
          </div>
          <div className="form-row">
            <label>Código (auto)</label>
            <input value={scheduleForm.code} readOnly className="readonly-auto" />
          </div>
          {scheduleForm.kind === 'ticket' ? (
            <>
              <div className="form-row">
                <label>Título</label>
                <input value={scheduleForm.title} onChange={(e) => setScheduleForm({ ...scheduleForm, title: e.target.value })}
                  placeholder={`Visita — ${scheduleForm.project || 'proyecto'}`} />
              </div>
              <div className="form-row">
                <label>Prioridad</label>
                <select value={scheduleForm.priority} onChange={(e) => setScheduleForm({ ...scheduleForm, priority: e.target.value })}>
                  {['Critico', 'Alta', 'Intermedia', 'Baja'].map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
            </>
          ) : (
            <>
              <div className="form-row">
                <label>Tipo de mantto</label>
                <select value={scheduleForm.tipo} onChange={(e) => setScheduleForm({ ...scheduleForm, tipo: e.target.value })}>
                  {['Preventivo', 'Correctivo', 'Predictivo', 'Inspección'].map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-row">
                <label>Cuadrilla</label>
                <input value={scheduleForm.cuadrilla} onChange={(e) => setScheduleForm({ ...scheduleForm, cuadrilla: e.target.value })} />
              </div>
            </>
          )}
          <div className="form-row full">
            <label>Notas / descripción</label>
            <textarea rows="3" value={scheduleForm.notes} onChange={(e) => setScheduleForm({ ...scheduleForm, notes: e.target.value })} />
          </div>
        </div>
      </Modal>
    </div>
  );
}

function MonthView({ cursor, items, canSchedule, onDayClick, onItemClick }) {
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const first = new Date(y, m, 1);
  const startDay = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const today = new Date().toISOString().slice(0, 10);
  const cells = [];
  for (let i = 0; i < startDay; i++) {
    const d = new Date(y, m, -startDay + i + 1);
    cells.push({ day: d.getDate(), iso: null, isCurrentMonth: false, events: [] });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, iso, isCurrentMonth: true, events: items.filter((e) => e.date === iso) });
  }
  while (cells.length % 7 !== 0) cells.push({ day: cells.length, iso: null, isCurrentMonth: false, events: [] });

  return (
    <div className="table-wrap" style={{ padding: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => (
          <div key={d} style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', padding: 6 }}>{d}</div>
        ))}
        {cells.map((cell, i) => (
          <div key={i}
            onClick={() => canSchedule && cell.iso && onDayClick && onDayClick(cell.iso)}
            style={{
              minHeight: 90, padding: 6, borderRadius: 8,
              background: cell.isCurrentMonth ? 'var(--gray-50)' : 'transparent',
              opacity: cell.isCurrentMonth ? 1 : 0.4,
              border: cell.iso === today ? '2px solid var(--sky, #0EA5E9)' : '1px solid var(--gray-100)',
              cursor: canSchedule && cell.iso ? 'pointer' : 'default',
            }}
            title={canSchedule && cell.iso ? `Click para agendar el ${cell.iso}` : ''}
          >
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-600)', marginBottom: 4 }}>{cell.day}</div>
            {cell.events.slice(0, 3).map((e) => (
              <div
                key={e.id}
                title={e.tooltip || e.title}
                onClick={(evt) => { evt.stopPropagation(); onItemClick && onItemClick(e); }}
                style={{
                  background: e.color, color: '#fff', fontSize: 10, padding: '2px 4px', borderRadius: 4,
                  marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  cursor: 'pointer',
                }}
              >
                {e.title}
              </div>
            ))}
            {cell.events.length > 3 && <div style={{ fontSize: 10, color: 'var(--gray-500)' }}>+{cell.events.length - 3} más</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function YearView({ cursor, items, onPick }) {
  const y = cursor.getFullYear();
  const counts = Array(12).fill(0);
  items.forEach((e) => { if (e.date?.startsWith(`${y}-`)) counts[parseInt(e.date.slice(5, 7), 10) - 1]++; });
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
      {MONTHS.map((mo, i) => (
        <div key={mo} onClick={() => onPick(i)}
          style={{ border: '1px solid var(--gray-200, #e5e7eb)', borderRadius: 10, padding: 12, cursor: 'pointer', background: 'var(--card-bg, #fff)' }}>
          <div style={{ fontWeight: 600 }}>{mo}</div>
          <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>{counts[i]} eventos</div>
          <MiniMonth year={y} month={i} items={items} />
        </div>
      ))}
    </div>
  );
}

function MiniMonth({ year, month, items }) {
  const first = new Date(year, month, 1);
  const startDay = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ d, has: items.some((e) => e.date === iso) });
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginTop: 8 }}>
      {cells.map((c, i) => (
        <div key={i} style={{
          height: 14, borderRadius: 3, fontSize: 8, textAlign: 'center', lineHeight: '14px',
          background: c?.has ? 'var(--sky, #0EA5E9)' : c ? 'var(--gray-100, #f3f4f6)' : 'transparent',
          color: c?.has ? '#fff' : 'var(--gray-500)',
        }}>{c?.d || ''}</div>
      ))}
    </div>
  );
}

function DayView({ cursor, items, canSchedule, onSchedule, onItemClick }) {
  const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
  const todays = items.filter((e) => e.date === iso);
  return (
    <div className="table-wrap" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>{cursor.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h3>
        {canSchedule && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-sm btn-primary" onClick={() => onSchedule('ticket')}>+ Ticket</button>
            <button className="btn btn-sm" onClick={() => onSchedule('mantenimiento')}>+ Mantenimiento</button>
          </div>
        )}
      </div>
      {todays.length === 0 ? (
        <div className="empty">Sin eventos para este día (según los filtros activos).</div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {todays.map((e) => (
            <li key={e.id}
              title={e.tooltip || e.title}
              onClick={() => onItemClick && onItemClick(e)}
              style={{
                padding: 10, marginBottom: 6, borderRadius: 8,
                borderLeft: `4px solid ${e.color}`, background: 'var(--gray-50, #f9fafb)',
                cursor: 'pointer',
              }}>
              <div>
                <strong>{e.title}</strong>
                <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--gray-500)' }}>· {e.type}</span>
              </div>
              {e.tooltip && (
                <pre style={{
                  fontSize: 11, color: 'var(--gray-600)', marginTop: 4,
                  fontFamily: 'inherit', whiteSpace: 'pre-wrap', lineHeight: 1.4,
                }}>{e.tooltip}</pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
