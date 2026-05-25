import { useEffect, useMemo, useState } from 'react';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { checklistsApi, ticketsApi, polizasApi } from '../api/endpoints';
import { fmtDate, downloadXLSX } from '../utils/format';

const RESULTADOS = ['En proceso', 'OK', 'Requiere intervención'];
const RES_STYLE = {
  'En proceso':            { bg: '#fef3c7', fg: '#92400e' },
  'OK':                    { bg: '#d1fae5', fg: '#065f46' },
  'Requiere intervención': { bg: '#fee2e2', fg: '#991b1b' },
};

const MPPTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const STRINGS = [1, 2];
const AC_PAIRS = ['L1-L2', 'L1-N', 'L2-N', 'L1-PE', 'L2-PE', 'N-PE', 'L1-L3', 'L2-L3', 'L3-N', 'L3-PE'];

const PAISES = ['México', 'Costa Rica', 'Guatemala', 'Honduras', 'El Salvador', 'Nicaragua', 'Panamá', 'República Dominicana', 'Colombia', 'Perú', 'Chile', 'Otro'];

const emptyMediciones = () => {
  const m = { voc: {}, isc: {}, pePos: {}, peNeg: {} };
  MPPTS.forEach((mppt) => STRINGS.forEach((s) => {
    const k = `mppt${mppt}_s${s}`;
    m.voc[k] = ''; m.isc[k] = ''; m.pePos[k] = ''; m.peNeg[k] = '';
  }));
  return m;
};
const emptyAC = () => Object.fromEntries(AC_PAIRS.map((p) => [p, '']));

const empty = {
  ticketId: '', project: '', code: '',
  cliente: '', distribuidor: '', pais: 'México',
  modelo: '', snInversor: '', snLogger: '', capacidadKw: '',
  datosPanel: '', configPanel: '', alarmas: '', descripcionFalla: '',
  medicionesDc: emptyMediciones(),
  medicionesAc: emptyAC(),
  frecuenciaHz: '',
  continuidadCheck: 'NO', continuidadSerie: '',
  resultado: 'En proceso', observaciones: '', tecnico: '',
  fechaVisita: new Date().toISOString().slice(0, 10),
};

export default function Checklists() {
  const { hasRole, user } = useAuth();
  const toast = useToast();
  const canWrite = hasRole('admin', 'operator', 'mantenimiento');
  const canDelete = hasRole('admin');

  const [items, setItems] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [polizas, setPolizas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resultado, setResultado] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [tab, setTab] = useState('general');  // general | dc | ac | resultado

  const load = () => {
    setLoading(true);
    checklistsApi.list({ resultado, q }).then(setItems)
      .catch(() => toast('Error', 'error'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [resultado, q]);
  useEffect(() => {
    ticketsApi.list().then(setTickets).catch(() => {});
    polizasApi.list().then(setPolizas).catch(() => {});
  }, []);

  const onTicketChange = (id) => {
    const t = tickets.find((x) => String(x.id) === String(id));
    setForm((f) => ({
      ...f,
      ticketId: id,
      project: t?.site || f.project,
      code: t?.projectCode || f.code,
      cliente: t?.client || f.cliente,
      descripcionFalla: t?.description || f.descripcionFalla,
    }));
  };

  const onProjectChange = (val) => {
    setForm((f) => ({ ...f, project: val }));
    const p = polizas.find((x) =>
      x.project?.toLowerCase() === val.toLowerCase() ||
      x.code?.toLowerCase() === val.toLowerCase()
    );
    if (p) setForm((f) => ({ ...f, project: p.project, code: p.code || f.code, cliente: f.cliente || p.grupo }));
  };

  const onNew = () => {
    setForm({ ...empty, tecnico: user?.name || '', fechaVisita: new Date().toISOString().slice(0, 10) });
    setEditingId(null); setTab('general'); setOpen(true);
  };
  const onEdit = (r) => {
    setForm({
      ...empty, ...r,
      medicionesDc: { ...emptyMediciones(), ...(r.medicionesDc || {}) },
      medicionesAc: { ...emptyAC(), ...(r.medicionesAc || {}) },
    });
    setEditingId(r.id); setTab('general'); setOpen(true);
  };
  const onDelete = async (id) => {
    if (!confirm('¿Eliminar este checklist?')) return;
    await checklistsApi.remove(id); toast('Eliminado'); load();
  };
  const onSave = async () => {
    if (!form.project) return toast('Proyecto obligatorio', 'error');
    try {
      if (editingId) await checklistsApi.update(editingId, form);
      else await checklistsApi.create(form);
      toast(editingId ? 'Actualizado' : 'Creado'); setOpen(false); load();
    } catch (e) { toast(e?.response?.data?.message || 'Error', 'error'); }
  };

  const setM = (group, key, value) =>
    setForm((f) => ({ ...f, medicionesDc: { ...f.medicionesDc, [group]: { ...f.medicionesDc[group], [key]: value } } }));
  const setAC = (key, value) =>
    setForm((f) => ({ ...f, medicionesAc: { ...f.medicionesAc, [key]: value } }));

  const columns = useMemo(() => {
    const cols = [
      { key: 'fechaVisita', label: 'Visita', render: (r) => fmtDate(r.fechaVisita) },
      { key: 'project', label: 'Proyecto' },
      { key: 'cliente', label: 'Cliente' },
      { key: 'modelo', label: 'Modelo' },
      { key: 'snInversor', label: 'SN Inversor' },
      { key: 'tecnico', label: 'Técnico' },
      { key: 'ticketId', label: 'Ticket', render: (r) => r.ticketId ? `#${r.ticketId}` : '—' },
      {
        key: 'resultado', label: 'Resultado',
        render: (r) => {
          const s = RES_STYLE[r.resultado] || {};
          return <span style={{ background: s.bg, color: s.fg, padding: '3px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{r.resultado || '—'}</span>;
        },
      },
    ];
    if (canWrite || canDelete) {
      cols.push({
        key: '_actions', label: 'Acciones', sortable: false,
        render: (r) => (
          <div style={{ display: 'flex', gap: 4 }}>
            {canWrite && <button className="btn btn-sm" onClick={() => onEdit(r)}>Ver / Editar</button>}
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
        <h2>Checklists post-venta</h2>
        <span style={{ color: 'var(--gray-400)', fontSize: 12 }}>{items.length} visitas</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn btn-sm" onClick={() => downloadXLSX(items, 'Checklists', `checklists_${Date.now()}.xlsx`)}>⬇ Exportar</button>
          {canWrite && <button className="btn btn-sm btn-primary" onClick={onNew}>+ Nuevo checklist</button>}
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 12 }}>
        Documenta una visita técnica en sitio: información del cliente, mediciones DC (10 MPPT × 2 strings), mediciones AC y resultado.
      </div>

      <div className="filters-bar">
        <input className="filter-input search-input" placeholder="Buscar proyecto, cliente, SN..."
          value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="filter-select" value={resultado} onChange={(e) => setResultado(e.target.value)}>
          <option value="">Todos los resultados</option>
          {RESULTADOS.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      {loading ? <div className="empty"><span className="spinner" /></div> : <DataTable columns={columns} data={items} />}

      <Modal
        open={open} onClose={() => setOpen(false)}
        title={editingId ? `Checklist #${editingId}` : 'Nuevo checklist post-venta'}
        wide
        footer={
          <>
            <button className="btn" onClick={() => setOpen(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={onSave}>Guardar</button>
          </>
        }
      >
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--gray-200, #e5e7eb)', marginBottom: 14 }}>
          {[
            { id: 'general', label: '📝 Info general' },
            { id: 'dc',      label: '⚡ Mediciones DC' },
            { id: 'ac',      label: '🔌 Mediciones AC' },
            { id: 'resultado', label: '✅ Resultado' },
          ].map((t) => (
            <button key={t.id} className="btn btn-sm"
              onClick={() => setTab(t.id)}
              style={{
                borderRadius: 0, border: 'none',
                background: tab === t.id ? 'var(--sky, #0EA5E9)' : 'transparent',
                color: tab === t.id ? '#fff' : 'inherit',
              }}>{t.label}</button>
          ))}
        </div>

        {tab === 'general' && (
          <div className="form-grid">
            <Row label="Ticket asociado">
              <select value={form.ticketId || ''} onChange={(e) => onTicketChange(e.target.value)}>
                <option value="">— Sin ticket —</option>
                {tickets.map((t) => (
                  <option key={t.id} value={t.id}>#{t.id} · {t.title}</option>
                ))}
              </select>
            </Row>
            <Row label="Fecha de visita">
              <input type="date" value={form.fechaVisita?.slice(0, 10) || ''}
                onChange={(e) => setForm({ ...form, fechaVisita: e.target.value })} />
            </Row>
            <Row label="Proyecto *">
              <input list="ck-projects" value={form.project} onChange={(e) => onProjectChange(e.target.value)} />
              <datalist id="ck-projects">
                {polizas.map((p) => <option key={p.id} value={p.project}>{p.code}</option>)}
              </datalist>
            </Row>
            <Row label="Código">
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </Row>
            <Row label="Cliente / Empresa">
              <input value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} />
            </Row>
            <Row label="Distribuidor">
              <input value={form.distribuidor} onChange={(e) => setForm({ ...form, distribuidor: e.target.value })} />
            </Row>
            <Row label="País">
              <select value={form.pais} onChange={(e) => setForm({ ...form, pais: e.target.value })}>
                {PAISES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </Row>
            <Row label="Modelo inversor">
              <input value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} />
            </Row>
            <Row label="SN del inversor">
              <input value={form.snInversor} onChange={(e) => setForm({ ...form, snInversor: e.target.value })} />
            </Row>
            <Row label="SN del logger">
              <input value={form.snLogger} onChange={(e) => setForm({ ...form, snLogger: e.target.value })} />
            </Row>
            <Row label="Capacidad total (kW)">
              <input type="number" step="0.01" value={form.capacidadKw}
                onChange={(e) => setForm({ ...form, capacidadKw: e.target.value })} />
            </Row>
            <Row label="Datos del panel" full>
              <input value={form.datosPanel} onChange={(e) => setForm({ ...form, datosPanel: e.target.value })}
                placeholder="Marca / modelo / Wp" />
            </Row>
            <Row label="Configuración del panel" full>
              <input value={form.configPanel} onChange={(e) => setForm({ ...form, configPanel: e.target.value })}
                placeholder="N° series / strings / orientación" />
            </Row>
            <Row label="Alarmas en el equipo" full>
              <input value={form.alarmas} onChange={(e) => setForm({ ...form, alarmas: e.target.value })} />
            </Row>
            <Row label="Descripción breve de la falla" full>
              <textarea rows="3" value={form.descripcionFalla}
                onChange={(e) => setForm({ ...form, descripcionFalla: e.target.value })} />
            </Row>
          </div>
        )}

        {tab === 'dc' && (
          <div>
            <p style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 12 }}>
              Captura mediciones por cada MPPT (10) y cada string (2). Acompañar con fotografías cargadas como evidencia.
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: 'var(--gray-100)' }}>
                    <th style={{ padding: 6, textAlign: 'left' }}>Medición</th>
                    {MPPTS.map((m) => (
                      <th key={m} colSpan={2} style={{ padding: 6, borderLeft: '1px solid var(--gray-200)' }}>MPPT {m}</th>
                    ))}
                  </tr>
                  <tr style={{ background: 'var(--gray-50)' }}>
                    <th></th>
                    {MPPTS.flatMap((m) => STRINGS.map((s) => (
                      <th key={`${m}-${s}`} style={{ padding: 4, fontWeight: 400, fontSize: 10 }}>S{s}</th>
                    )))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { key: 'voc', label: 'Voc (V)' },
                    { key: 'isc', label: 'Isc (A)' },
                    { key: 'pePos', label: 'String → PE (+)' },
                    { key: 'peNeg', label: 'String → PE (−)' },
                  ].map((row) => (
                    <tr key={row.key}>
                      <td style={{ padding: 4, fontWeight: 600 }}>{row.label}</td>
                      {MPPTS.flatMap((m) => STRINGS.map((s) => {
                        const k = `mppt${m}_s${s}`;
                        return (
                          <td key={`${row.key}-${k}`} style={{ padding: 2, borderLeft: '1px solid var(--gray-100)' }}>
                            <input
                              value={form.medicionesDc[row.key][k] || ''}
                              onChange={(e) => setM(row.key, k, e.target.value)}
                              style={{ width: 50, fontSize: 11, padding: '2px 4px' }}
                            />
                          </td>
                        );
                      }))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="form-grid" style={{ marginTop: 16 }}>
              <Row label="¿Continuidad + a − en cada serie?">
                <select value={form.continuidadCheck}
                  onChange={(e) => setForm({ ...form, continuidadCheck: e.target.value })}>
                  <option>NO</option><option>SI</option>
                </select>
              </Row>
              <Row label="¿En qué serie?">
                <input value={form.continuidadSerie}
                  onChange={(e) => setForm({ ...form, continuidadSerie: e.target.value })} />
              </Row>
            </div>
          </div>
        )}

        {tab === 'ac' && (
          <div className="form-grid">
            {AC_PAIRS.map((pair) => (
              <Row key={pair} label={`${pair} (V)`}>
                <input value={form.medicionesAc[pair] || ''} onChange={(e) => setAC(pair, e.target.value)} />
              </Row>
            ))}
            <Row label="Frecuencia (Hz)">
              <input value={form.frecuenciaHz}
                onChange={(e) => setForm({ ...form, frecuenciaHz: e.target.value })} />
            </Row>
          </div>
        )}

        {tab === 'resultado' && (
          <div className="form-grid">
            <Row label="Técnico">
              <input value={form.tecnico} onChange={(e) => setForm({ ...form, tecnico: e.target.value })} />
            </Row>
            <Row label="Resultado del checklist">
              <select value={form.resultado} onChange={(e) => setForm({ ...form, resultado: e.target.value })}>
                {RESULTADOS.map((r) => <option key={r}>{r}</option>)}
              </select>
            </Row>
            <Row label="Observaciones finales" full>
              <textarea rows="6" value={form.observaciones}
                onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
                placeholder="Resumen de hallazgos, recomendaciones, próximos pasos..." />
            </Row>
          </div>
        )}
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
