import { useEffect, useMemo, useState } from 'react';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { viaticosApi, ticketsApi, polizasApi, mantenimientoApi, tecnicosApi, assigneesApi } from '../api/endpoints';
import { fmtDate, downloadXLSX } from '../utils/format';

const ESTADOS = ['Solicitado', 'Aprobado', 'Comprobado', 'Rechazado'];
const ESTADO_STYLE = {
  Solicitado:  { bg: '#fef3c7', fg: '#92400e' },
  Aprobado:    { bg: '#dbeafe', fg: '#1e40af' },
  Comprobado:  { bg: '#d1fae5', fg: '#065f46' },
  Rechazado:   { bg: '#fee2e2', fg: '#991b1b' },
};

const TIPOS_VEHICULO = [
  { id: 'coche',          label: 'Coche' },
  { id: 'camioneta_med',  label: 'Camioneta mediana' },
  { id: 'camioneta_gde',  label: 'Camioneta grande' },
];

const empty = {
  ticketId: '', project: '', code: '', responsable: '', responsablesExtra: [],
  tipoPersona: 'tecnico',
  comidas: 0, noches: 0,
  tipoVehiculo: '', cantidadVehiculos: 0,
  tag: '', placa: '',
  monto: '', moneda: 'MXN',
  diasSitio: 0,
  fechaSalida: new Date().toISOString().slice(0, 10),
  fechaRegreso: '',
  estado: 'Solicitado', notas: '',
};

const money = (n, c = 'MXN') => {
  if (n == null || n === '') return '—';
  try { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: c || 'MXN' }).format(n); }
  catch { return `$${n}`; }
};

const MONTH_LABELS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export default function Viaticos() {
  const { hasRole, user } = useAuth();
  const toast = useToast();
  const canWrite = hasRole('admin', 'operator', 'mantenimiento');
  const canDelete = hasRole('admin');
  const isAdmin = hasRole('admin');

  const [items, setItems] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [mants, setMants] = useState([]);
  const [polizas, setPolizas] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [tarifas, setTarifas] = useState(null);
  const [presupuestos, setPresupuestos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [estado, setEstado] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);

  // Modal presupuesto
  const [presOpen, setPresOpen] = useState(false);
  const [presForm, setPresForm] = useState({
    year: new Date().getFullYear(), month: new Date().getMonth() + 1, monto: '', notas: '',
  });

  const load = () => {
    setLoading(true);
    viaticosApi.list({ estado, q }).then(setItems)
      .catch(() => toast('Error', 'error')).finally(() => setLoading(false));
    viaticosApi.presupuesto(new Date().getFullYear()).then(setPresupuestos).catch(() => {});
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [estado, q]);
  useEffect(() => {
    ticketsApi.list().then(setTickets).catch(() => {});
    polizasApi.list().then(setPolizas).catch(() => {});
    mantenimientoApi.list().then(setMants).catch(() => {});
    tecnicosApi.list().then(setTecnicos).catch(() => {});
    assigneesApi.list().then(setAssignees).catch(() => {});
    viaticosApi.tarifas().then(setTarifas).catch(() => {});
  }, []);

  // Cuando elige una orden (ticket o mantenimiento)
  const onOrdenChange = (val) => {
    if (!val) { setForm((f) => ({ ...f, ticketId: '' })); return; }
    const [kind, id] = val.split(':');
    if (kind === 't') {
      const t = tickets.find((x) => String(x.id) === String(id));
      setForm((f) => ({
        ...f, ticketId: id,
        project: t?.site || f.project,
        code: t?.projectCode || f.code,
        responsable: t?.assignedTo || f.responsable,
        notas: t ? `🎫 Ticket #${id} · ${t.title || ''}` : f.notas,
      }));
    } else if (kind === 'm') {
      const m = mants.find((x) => String(x.id) === String(id));
      setForm((f) => ({
        ...f, ticketId: `M${id}`,
        project: m?.project || f.project,
        code: m?.code || f.code,
        responsable: m?.responsable || m?.cuadrilla || f.responsable,
        notas: m ? `🔧 Mantenimiento #${id} · ${m.tipo || ''} — ${m.project || ''}` : f.notas,
      }));
    }
  };
  const ordenValue = (() => {
    if (!form.ticketId) return '';
    if (String(form.ticketId).startsWith('M')) return `m:${String(form.ticketId).slice(1)}`;
    return `t:${form.ticketId}`;
  })();

  const onDateChange = (field, value) => {
    setForm((f) => {
      const next = { ...f, [field]: value };
      if (next.fechaSalida && next.fechaRegreso) {
        const d1 = new Date(next.fechaSalida);
        const d2 = new Date(next.fechaRegreso);
        const days = Math.max(0, Math.floor((d2 - d1) / 86400000) + 1);
        next.diasSitio = days;
        // Si no se asignaron noches manualmente, sugerir = días-1
        if (!next.noches) next.noches = Math.max(0, days - 1);
      }
      return next;
    });
  };

  // Cálculo automático del monto en tiempo real
  const montoCalc = useMemo(() => {
    if (!tarifas) return 0;
    const t = tarifas[form.tipoPersona] || tarifas.tecnico || {};
    let total = 0;
    total += Math.min(Number(form.comidas) || 0, 3) * (t.comida || 0);
    total += (Number(form.noches) || 0) * (t.noche || 0);
    if (form.tipoVehiculo && form.cantidadVehiculos) {
      total += (Number(form.cantidadVehiculos) || 0) * (t[form.tipoVehiculo] || 0);
    }
    return Math.round(total * 100) / 100;
  }, [form, tarifas]);

  const toggleResponsable = (name) => {
    setForm((f) => {
      const arr = f.responsablesExtra || [];
      return {
        ...f,
        responsablesExtra: arr.includes(name) ? arr.filter((x) => x !== name) : [...arr, name],
      };
    });
  };

  const onNew = () => {
    setForm({ ...empty, responsable: user?.name || '' });
    setEditingId(null); setOpen(true);
  };
  const onEdit = (r) => {
    setForm({
      ...empty, ...r,
      responsablesExtra: r.responsablesExtra || [],
    });
    setEditingId(r.id); setOpen(true);
  };
  const onDelete = async (id) => {
    if (!confirm('¿Eliminar este viático?')) return;
    await viaticosApi.remove(id); toast('Eliminado'); load();
  };
  const onSave = async () => {
    try {
      const payload = { ...form };
      if (!payload.monto) payload.monto = montoCalc;
      if (editingId) await viaticosApi.update(editingId, payload);
      else await viaticosApi.create(payload);
      toast(editingId ? 'Actualizado' : 'Creado'); setOpen(false); load();
    } catch (e) { toast(e?.response?.data?.message || 'Error', 'error'); }
  };

  const onSavePresupuesto = async () => {
    if (!presForm.monto) return toast('Indica un monto', 'error');
    try {
      await viaticosApi.setPresupuesto({
        year: Number(presForm.year), month: Number(presForm.month),
        monto: Number(presForm.monto), notas: presForm.notas,
      });
      toast('Presupuesto guardado');
      setPresOpen(false);
      setPresForm({ year: new Date().getFullYear(), month: new Date().getMonth() + 1, monto: '', notas: '' });
      load();
    } catch (e) { toast(e?.response?.data?.message || 'Error', 'error'); }
  };

  const totalMonto = useMemo(
    () => items.reduce((s, v) => s + (Number(v.monto) || 0), 0),
    [items]
  );

  // Presupuesto del mes actual
  const currentBudget = useMemo(() => {
    const now = new Date();
    return presupuestos.find((p) => p.year === now.getFullYear() && p.month === now.getMonth() + 1);
  }, [presupuestos]);

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
      {
        key: 'responsablesExtra', label: 'Involucrados',
        render: (r) => (r.responsablesExtra || []).length > 0
          ? <span style={{ fontSize: 11 }} title={r.responsablesExtra.join(', ')}>👥 {r.responsablesExtra.length}</span>
          : '—',
      },
      {
        key: 'comidas', label: 'Comidas',
        render: (r) => r.comidas > 0 ? `🍽 ${r.comidas}` : '—',
      },
      {
        key: 'noches', label: 'Noches',
        render: (r) => r.noches > 0 ? `🌙 ${r.noches}` : '—',
      },
      {
        key: 'tipoVehiculo', label: 'Vehículo',
        render: (r) => r.tipoVehiculo
          ? `🚗 ${TIPOS_VEHICULO.find((t) => t.id === r.tipoVehiculo)?.label || r.tipoVehiculo} ×${r.cantidadVehiculos || 1}`
          : '—',
      },
      { key: 'tag', label: 'TAG' },
      { key: 'placa', label: 'Placa' },
      { key: 'monto', label: 'Monto', render: (r) => money(r.monto, r.moneda) },
      {
        key: 'estado', label: 'Estado',
        render: (r) => {
          const s = ESTADO_STYLE[r.estado] || {};
          return <span style={{ background: s.bg, color: s.fg, padding: '3px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{r.estado || '—'}</span>;
        },
      },
      { key: 'fechaSalida', label: 'Salida', render: (r) => fmtDate(r.fechaSalida) },
    ];
    if (canWrite || canDelete) {
      cols.push({
        key: '_actions', label: 'Acciones', sortable: false,
        render: (r) => (
          <div style={{ display: 'inline-flex', gap: 4 }}>
            {canWrite && <button className="btn btn-sm" title="Editar" onClick={() => onEdit(r)}>✏️</button>}
            {canDelete && <button className="btn btn-sm btn-danger" title="Eliminar" onClick={() => onDelete(r.id)}>×</button>}
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
          {items.length} reg · Gasto: <strong style={{ color: 'var(--sky)' }}>{money(totalMonto)}</strong>
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {isAdmin && (
            <button className="btn btn-sm" onClick={() => setPresOpen(true)}>
              💰 Presupuesto mensual
            </button>
          )}
          <button className="btn btn-sm" onClick={() => downloadXLSX(items, 'Viaticos', `viaticos_${Date.now()}.xlsx`)}>⬇ Exportar</button>
          {canWrite && <button className="btn btn-sm btn-primary" onClick={onNew}>+ Nuevo viático</button>}
        </div>
      </div>

      {/* Banner presupuesto del mes */}
      {currentBudget && (
        <div style={{
          background: currentBudget.disponible >= 0 ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${currentBudget.disponible >= 0 ? '#86efac' : '#fca5a5'}`,
          borderRadius: 8, padding: '12px 16px', marginBottom: 12,
          display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 24 }}>💰</span>
          <div>
            <div style={{ fontWeight: 700 }}>
              Presupuesto {MONTH_LABELS[currentBudget.month - 1]} {currentBudget.year}: {money(currentBudget.monto)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--gray-600)' }}>
              Gastado: {money(currentBudget.gasto)} ·{' '}
              <strong style={{ color: currentBudget.disponible >= 0 ? '#16a34a' : '#dc2626' }}>
                Disponible: {money(currentBudget.disponible)}
              </strong> · Uso: {currentBudget.porcentaje}%
            </div>
          </div>
          {/* Barra de progreso */}
          <div style={{ flex: 1, minWidth: 200, height: 12, background: 'var(--gray-200)', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.min(currentBudget.porcentaje, 100)}%`,
              background: currentBudget.porcentaje > 100 ? '#dc2626' : currentBudget.porcentaje > 80 ? '#f59e0b' : '#16a34a',
              transition: 'width .3s',
            }} />
          </div>
        </div>
      )}

      <div className="filters-bar">
        <input className="filter-input search-input" placeholder="Buscar proyecto, TAG, placa, responsable..."
          value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="filter-select" value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {ESTADOS.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      {loading ? <div className="empty"><span className="spinner" /></div> : <DataTable columns={columns} data={items} />}

      {/* ── Modal: viático ── */}
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
          <Row label="Orden asociada (ticket o mantto)">
            <select value={ordenValue} onChange={(e) => onOrdenChange(e.target.value)}>
              <option value="">— Sin orden —</option>
              <optgroup label="🎫 Tickets">
                {tickets.map((t) => <option key={`t-${t.id}`} value={`t:${t.id}`}>#{t.id} · {t.title} ({t.site || '—'})</option>)}
              </optgroup>
              <optgroup label="🔧 Mantenimientos">
                {mants.map((m) => <option key={`m-${m.id}`} value={`m:${m.id}`}>M{m.id} · {m.tipo || 'Mant.'} — {m.project || '—'}</option>)}
              </optgroup>
            </select>
          </Row>
          <Row label="Proyecto">
            <input list="vt-projects" value={form.project}
              onChange={(e) => setForm({ ...form, project: e.target.value })} />
            <datalist id="vt-projects">
              {polizas.map((p) => <option key={p.id} value={p.project}>{p.code}</option>)}
            </datalist>
          </Row>
          <Row label="Código (auto)">
            <input value={form.code} readOnly className="readonly-auto" />
          </Row>

          {/* Tipo de persona */}
          <Row label="Tipo de personal">
            <select value={form.tipoPersona} onChange={(e) => setForm({ ...form, tipoPersona: e.target.value })}>
              <option value="tecnico">Técnico</option>
              <option value="administrativo">Administrativo</option>
            </select>
          </Row>

          {/* Responsable principal */}
          <Row label="Responsable principal">
            <input list="vt-resp" value={form.responsable}
              onChange={(e) => setForm({ ...form, responsable: e.target.value })} />
            <datalist id="vt-resp">
              {assignees.map((a) => <option key={a.id} value={a.value}>{a.label}</option>)}
            </datalist>
          </Row>

          {/* Involucrados — multi-select */}
          <Row label={`Personal involucrado (${(form.responsablesExtra || []).length})`} full>
            <div style={{
              maxHeight: 110, overflowY: 'auto',
              border: '1px solid var(--gray-200)', borderRadius: 8, padding: 6,
              background: 'var(--card-bg, #fff)',
            }}>
              {tecnicos.length === 0 ? (
                <div style={{ color: 'var(--gray-400)', fontSize: 12 }}>Sin técnicos registrados.</div>
              ) : tecnicos.map((t) => (
                <label key={t.id} style={{
                  display: 'inline-flex', gap: 4, alignItems: 'center',
                  padding: '3px 6px', fontSize: 11, cursor: 'pointer',
                  background: (form.responsablesExtra || []).includes(t.nombre) ? 'var(--sky-50, #e0f2fe)' : 'transparent',
                  borderRadius: 4, margin: '0 4px 4px 0',
                }}>
                  <input type="checkbox" style={{ margin: 0 }}
                    checked={(form.responsablesExtra || []).includes(t.nombre)}
                    onChange={() => toggleResponsable(t.nombre)} />
                  {t.nombre}
                </label>
              ))}
            </div>
          </Row>

          {/* Comidas y noches */}
          <Row label={`🍽 Comidas (máx 3) — ${tarifas ? money((tarifas[form.tipoPersona] || tarifas.tecnico)?.comida) : '$170'} c/u`}>
            <select value={form.comidas} onChange={(e) => setForm({ ...form, comidas: Number(e.target.value) })}>
              {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Row>
          <Row label={`🌙 Noches — ${tarifas ? money((tarifas[form.tipoPersona] || tarifas.tecnico)?.noche) : '$2,000'} c/u`}>
            <input type="number" min={0} value={form.noches}
              onChange={(e) => setForm({ ...form, noches: Number(e.target.value) })} />
          </Row>

          {/* Vehículo */}
          <Row label="Tipo de vehículo">
            <select value={form.tipoVehiculo} onChange={(e) => setForm({ ...form, tipoVehiculo: e.target.value })}>
              <option value="">— Sin vehículo —</option>
              {TIPOS_VEHICULO.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label} {tarifas ? `(${money(tarifas[form.tipoPersona]?.[v.id])} c/u)` : ''}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Cantidad de vehículos">
            <input type="number" min={0} value={form.cantidadVehiculos}
              disabled={!form.tipoVehiculo}
              onChange={(e) => setForm({ ...form, cantidadVehiculos: Number(e.target.value) })} />
          </Row>
          <Row label="TAG (telepeaje)">
            <input value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })}
              placeholder="Ej: TAG-007" />
          </Row>
          <Row label="Placa del vehículo">
            <input value={form.placa} onChange={(e) => setForm({ ...form, placa: e.target.value })}
              placeholder="Ej: ABC-123-D" />
          </Row>

          {/* Fechas */}
          <Row label="Fecha salida">
            <input type="date" value={form.fechaSalida?.slice(0, 10) || ''}
              onChange={(e) => onDateChange('fechaSalida', e.target.value)} />
          </Row>
          <Row label="Fecha regreso">
            <input type="date" value={form.fechaRegreso?.slice(0, 10) || ''}
              onChange={(e) => onDateChange('fechaRegreso', e.target.value)} />
          </Row>
          <Row label="Días en sitio (auto)">
            <input type="number" value={form.diasSitio} readOnly className="readonly-auto" />
          </Row>

          {/* Monto */}
          <Row label="Monto calculado">
            <input value={money(montoCalc, form.moneda)} readOnly className="readonly-auto"
              style={{ fontWeight: 700, color: '#0EA5E9' }} />
          </Row>
          <Row label="Monto manual (opcional)">
            <input type="number" step="0.01" value={form.monto}
              onChange={(e) => setForm({ ...form, monto: e.target.value })}
              placeholder={`Default: ${montoCalc}`} />
          </Row>

          <Row label="Estado">
            <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
              {ESTADOS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Row>

          <Row label="Notas / justificación" full>
            <textarea rows="2" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </Row>
        </div>
      </Modal>

      {/* ── Modal: presupuesto mensual (sólo admin) ── */}
      <Modal
        open={presOpen} onClose={() => setPresOpen(false)}
        title="💰 Presupuesto mensual de viáticos"
        footer={
          <>
            <button className="btn" onClick={() => setPresOpen(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={onSavePresupuesto}>Guardar</button>
          </>
        }
      >
        <div className="form-grid">
          <Row label="Año">
            <input type="number" value={presForm.year}
              onChange={(e) => setPresForm({ ...presForm, year: e.target.value })} />
          </Row>
          <Row label="Mes">
            <select value={presForm.month}
              onChange={(e) => setPresForm({ ...presForm, month: Number(e.target.value) })}>
              {MONTH_LABELS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </Row>
          <Row label="Monto asignado (MXN)" full>
            <input type="number" step="0.01" value={presForm.monto}
              onChange={(e) => setPresForm({ ...presForm, monto: e.target.value })}
              placeholder="Ej: 50000" />
          </Row>
          <Row label="Notas" full>
            <textarea rows="2" value={presForm.notas}
              onChange={(e) => setPresForm({ ...presForm, notas: e.target.value })} />
          </Row>
        </div>

        {/* Historial de presupuestos del año */}
        <div style={{ marginTop: 16 }}>
          <strong style={{ fontSize: 13 }}>Presupuestos {new Date().getFullYear()}:</strong>
          <div style={{ marginTop: 8, fontSize: 12 }}>
            {presupuestos.length === 0 ? (
              <div style={{ color: 'var(--gray-400)' }}>Aún no hay presupuestos.</div>
            ) : presupuestos.map((p) => (
              <div key={p.id} style={{
                display: 'flex', justifyContent: 'space-between', padding: '6px 8px',
                borderBottom: '1px solid var(--gray-100)',
              }}>
                <span>{MONTH_LABELS[p.month - 1]} {p.year}</span>
                <span>{money(p.monto)} · gastado {money(p.gasto)} · <strong style={{ color: p.disponible >= 0 ? '#16a34a' : '#dc2626' }}>{money(p.disponible)} disp.</strong></span>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Row({ label, full, children }) {
  return (
    <div className={`form-row ${full ? 'full' : ''}`}>
      <label>{label}</label>
      {children}
    </div>
  );
}
