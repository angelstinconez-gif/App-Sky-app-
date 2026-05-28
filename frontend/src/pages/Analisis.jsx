import { useEffect, useMemo, useState } from 'react';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { analisisApi } from '../api/endpoints';
import { downloadXLSX } from '../utils/format';

const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MLABEL = (m) => m ? m.charAt(0).toUpperCase() + m.slice(1) : '';

export default function Analisis() {
  const { hasRole } = useAuth();
  const toast = useToast();
  const canWrite = hasRole('admin', 'operator', 'mantenimiento');

  const currentMonth = MONTHS[new Date().getMonth()];
  const [mes, setMes] = useState(currentMonth);
  const [items, setItems] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      analisisApi.list({ mes }),
      analisisApi.kpis(mes).catch(() => null),
    ]).then(([list, k]) => {
      setItems(list);
      setKpis(k);
    }).catch(() => toast('Error al cargar', 'error'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [mes]);

  const filtered = useMemo(() => {
    if (!q.trim()) return items;
    const f = q.toLowerCase();
    return items.filter((p) => (p.project || '').toLowerCase().includes(f)
      || (p.responsable || '').toLowerCase().includes(f)
      || (p.proveedor || '').toLowerCase().includes(f));
  }, [items, q]);

  const fmt = (n) => n != null ? new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 }).format(n) : '—';
  const pctColor = (pct) => pct == null ? 'var(--gray-400)' : pct >= 100 ? '#16a34a' : pct >= 80 ? '#f59e0b' : '#dc2626';

  const onEditGenerated = (row) => {
    setForm({
      id: row.id,
      project: row.project,
      generadoMes: row.generadoMes || {},
      garantizado: row.garantizado || {},
      _mes: mes,
    });
    setOpen(true);
  };

  const onSave = async () => {
    if (!form) return;
    try {
      await analisisApi.update(form.id, {
        generadoMes: form.generadoMes,
        garantizado: form.garantizado,
      });
      toast('Datos actualizados'); setOpen(false); load();
    } catch (e) {
      toast(e?.response?.data?.message || 'Error', 'error');
    }
  };

  const columns = [
    { key: 'project', label: 'Proyecto' },
    { key: 'potenciaKwp', label: 'Potencia kWp', render: (r) => fmt(r.potenciaKwp) },
    { key: 'plataforma', label: 'Plataforma' },
    {
      key: '_garMes', label: `Garantizado ${MLABEL(mes)}`,
      render: (r) => {
        const v = (r.garantizado || {})[mes];
        return <span style={{ fontWeight: 600 }}>{fmt(v)} <small style={{ color: 'var(--gray-400)' }}>kWh</small></span>;
      },
    },
    {
      key: '_genMes', label: `Generado ${MLABEL(mes)}`,
      render: (r) => {
        const v = (r.generadoMes || {})[mes];
        return v != null ? fmt(v) : <span style={{ color: 'var(--gray-400)' }}>sin captura</span>;
      },
    },
    {
      key: '_pctMes', label: '% Cumplim.',
      render: (r) => {
        const g = (r.garantizado || {})[mes];
        const e = (r.generadoMes || {})[mes];
        if (g == null || e == null) return <span style={{ color: 'var(--gray-400)' }}>—</span>;
        const pct = g > 0 ? Math.round((e / g) * 100) : 0;
        return (
          <span style={{
            background: pct >= 100 ? '#dcfce7' : pct >= 80 ? '#fef3c7' : '#fee2e2',
            color: pctColor(pct), padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700,
          }}>{pct}%</span>
        );
      },
    },
    { key: 'fallas', label: 'Fallas en sitio', render: (r) => r.fallas ? <div style={{ maxWidth: 220, fontSize: 11 }} title={r.fallas}>{r.fallas.slice(0, 80)}{r.fallas.length > 80 ? '…' : ''}</div> : '—' },
    { key: 'responsable', label: 'Responsable' },
    {
      key: '_actions', label: 'Acciones', sortable: false,
      render: (r) => canWrite ? (
        <button className="btn btn-sm" title="Capturar generación del mes" onClick={() => onEditGenerated(r)}>📊</button>
      ) : null,
    },
  ];

  return (
    <div>
      <div className="section-header">
        <h2>Análisis de datos (PV vigentes)</h2>
        <span style={{ color: 'var(--gray-400)', fontSize: 12 }}>
          {filtered.length} plantas
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: 'var(--gray-500)' }}>Mes:</label>
          <select className="filter-select" value={mes} onChange={(e) => setMes(e.target.value)}>
            {MONTHS.map((m) => <option key={m} value={m}>{MLABEL(m)}</option>)}
          </select>
          <button className="btn btn-sm" onClick={() => downloadXLSX(items, 'Analisis', `analisis_${mes}_${Date.now()}.xlsx`)}>⬇ Exportar</button>
        </div>
      </div>

      {/* KPIs del mes */}
      {kpis && (
        <div className="kpi-grid" style={{ marginBottom: 16 }}>
          <Kpi label={`Plantas con datos ${MLABEL(mes)}`} value={kpis.totalPlantas} color="sky" />
          <Kpi label={`Garantizado total kWh`} value={fmt(kpis.sumGarantizado)} color="purple" />
          <Kpi label={`Generado total kWh`} value={fmt(kpis.sumGenerado)} color="orange" />
          <Kpi label={`Cumplimiento`} value={`${kpis.porcentaje}%`}
            color={kpis.porcentaje >= 100 ? 'green' : kpis.porcentaje >= 80 ? 'amber' : 'red'} />
        </div>
      )}

      <div className="filters-bar">
        <input className="filter-input search-input"
          placeholder="Buscar proyecto, responsable, proveedor..."
          value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {loading ? <div className="empty"><span className="spinner" /></div> : <DataTable columns={columns} data={filtered} />}

      {/* Modal: capturar generación del mes */}
      <Modal
        open={open} onClose={() => setOpen(false)}
        title={form ? `Capturar generación — ${form.project}` : ''}
        footer={
          <>
            <button className="btn" onClick={() => setOpen(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={onSave}>Guardar</button>
          </>
        }
      >
        {form && (
          <div className="form-grid">
            {MONTHS.map((m) => (
              <div key={m} className="form-row">
                <label style={{ textTransform: 'capitalize' }}>
                  {m} <small style={{ color: 'var(--gray-400)' }}>
                    (gar: {fmt((form.garantizado || {})[m])} kWh)
                  </small>
                </label>
                <input type="number" step="0.1" placeholder="kWh generados"
                  value={(form.generadoMes || {})[m] ?? ''}
                  onChange={(e) => setForm({
                    ...form,
                    generadoMes: { ...form.generadoMes, [m]: e.target.value === '' ? null : parseFloat(e.target.value) },
                  })} />
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

function Kpi({ label, value, color }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-val c-${color}`}>{value}</div>
    </div>
  );
}
