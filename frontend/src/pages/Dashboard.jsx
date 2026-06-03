import { useEffect, useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  ArcElement, Tooltip, Legend, CategoryScale, LinearScale,
  BarElement, PointElement, LineElement,
} from 'chart.js';
import { Doughnut, Bar, Line } from 'react-chartjs-2';
import { useNavigate } from 'react-router-dom';
import {
  dashboardApi, ticketsApi, garantiasApi, mantenimientoApi, avisosApi,
} from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import { fmtDate } from '../utils/format';

ChartJS.register(
  ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement
);

const PALETTE = ['#0EA5E9', '#F59E0B', '#EF4444', '#22C55E', '#8B5CF6', '#F97316', '#64748B', '#06B6D4'];

const LEVEL_STYLE = {
  info:    { bg: '#dbeafe', border: '#3b82f6', icon: 'ℹ️' },
  warning: { bg: '#fef3c7', border: '#f59e0b', icon: '⚠️' },
  danger:  { bg: '#fee2e2', border: '#dc2626', icon: '🔴' },
};

function thisMonthRange() {
  const now = new Date();
  const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const end = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
  return { start, end };
}

function pickDate(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v) return String(v).slice(0, 10);
  }
  return '';
}

export default function Dashboard() {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const canSeeMonthly = hasRole('admin', 'mantenimiento');
  const isAdmin = hasRole('admin');

  const [kpis, setKpis] = useState(null);
  const [charts, setCharts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Actividad del mes
  const [tickets, setTickets] = useState([]);
  const [garantias, setGarantias] = useState([]);
  const [mants, setMants] = useState([]);
  const [openItem, setOpenItem] = useState(null);  // { type, data }

  // Avisos
  const [avisos, setAvisos] = useState([]);
  const [avisoOpen, setAvisoOpen] = useState(false);
  const [avisoForm, setAvisoForm] = useState({ title: '', body: '', level: 'info', validUntil: '', pinned: false });

  useEffect(() => {
    Promise.all([dashboardApi.kpis(), dashboardApi.charts()])
      .then(([k, c]) => { setKpis(k); setCharts(c); })
      .catch((e) => setError(e?.response?.data?.message || 'Error al cargar dashboard'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    avisosApi.list().then(setAvisos).catch(() => {});
    if (canSeeMonthly) {
      Promise.all([
        ticketsApi.list().catch(() => []),
        garantiasApi.list().catch(() => []),
        mantenimientoApi.list().catch(() => []),
      ]).then(([t, g, m]) => { setTickets(t); setGarantias(g); setMants(m); });
    }
  }, [canSeeMonthly]);

  const range = useMemo(() => thisMonthRange(), []);
  const inThisMonth = (d) => d && d >= range.start && d <= range.end;

  const monthlyTickets = useMemo(() =>
    tickets.filter((t) => inThisMonth(pickDate(t, ['openDate', 'open_date'])))
      .sort((a, b) => pickDate(b, ['openDate', 'open_date']).localeCompare(pickDate(a, ['openDate', 'open_date']))),
  [tickets, range]);

  // Garantías: TODAS las abiertas (no solo del mes) — se quedan visibles hasta cerrarse
  const monthlyGarantias = useMemo(() => {
    const cerrados = new Set(['cerrada', 'rechazada', 'aprobada']);
    return garantias
      .filter((g) => {
        const st = (g.status || '').toLowerCase();
        return !cerrados.has(st);   // mostrar todas las que NO están cerradas
      })
      .sort((a, b) => pickDate(b, ['uploadDate', 'upload_date']).localeCompare(pickDate(a, ['uploadDate', 'upload_date'])));
  }, [garantias]);

  const monthlyMants = useMemo(() =>
    mants.filter((m) => inThisMonth(pickDate(m, ['fechaProgramada', 'fecha_programada'])))
      .sort((a, b) => pickDate(a, ['fechaProgramada', 'fecha_programada']).localeCompare(pickDate(b, ['fechaProgramada', 'fecha_programada']))),
  [mants, range]);

  if (loading) return <div className="empty"><span className="spinner" /></div>;
  if (error) return <div className="empty" style={{ color: 'var(--red)' }}>{error}</div>;

  const dough = (obj) => ({
    labels: Object.keys(obj),
    datasets: [{ data: Object.values(obj), backgroundColor: PALETTE, borderWidth: 0 }],
  });

  const onSaveAviso = async () => {
    if (!avisoForm.title) return toast('Título obligatorio', 'error');
    try {
      await avisosApi.create(avisoForm);
      toast('Aviso publicado ✓');
      setAvisoOpen(false);
      setAvisoForm({ title: '', body: '', level: 'info', validUntil: '', pinned: false });
      avisosApi.list().then(setAvisos);
    } catch (e) {
      toast(e?.response?.data?.message || 'Error al publicar', 'error');
    }
  };

  const onDeleteAviso = async (id) => {
    if (!confirm('¿Eliminar este aviso?')) return;
    await avisosApi.remove(id);
    setAvisos((arr) => arr.filter((a) => a.id !== id));
  };

  return (
    <div>
      {/* ───── AVISOS DEL DÍA ───── */}
      <AvisosSection
        avisos={avisos}
        isAdmin={isAdmin}
        onNew={() => setAvisoOpen(true)}
        onDelete={onDeleteAviso}
      />

      {/* ───── KPIs ───── */}
      <div className="kpi-grid">
        <KPI label="Incidencias totales" value={kpis.incidencias.total} color="sky" />
        <KPI label="Abiertas" value={kpis.incidencias.abiertas} color="red" />
        <KPI label="Críticas" value={kpis.incidencias.criticas} color="red" sub="prioridad" />
        <KPI label="Tickets abiertos" value={kpis.tickets.abiertos} color="orange" />
        <KPI label="Pólizas vigentes" value={kpis.polizas.vigentes} color="green" sub={`/ ${kpis.polizas.total}`} />
        <KPI label="Vencen pronto" value={kpis.polizas.vencenPronto} color="amber" sub="≤ 30 días" />
        <KPI label="Garantías abiertas" value={kpis.garantias.abiertas} color="purple" />
      </div>

      {/* ───── ACTIVIDAD DEL MES (admin + mantenimiento) ───── */}
      {canSeeMonthly && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--gray-700)' }}>
            📆 Actividad de {new Date().toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}
          </h3>
          <div className="charts-row">
            <MonthlyList
              title="🎫 Tickets"
              icon="🎫"
              items={monthlyTickets}
              renderItem={(t) => `#${t.id} · ${t.title || '—'}`}
              renderSub={(t) => `${t.site || ''} · ${fmtDate(t.openDate)} · ${t.status || ''}`}
              onClick={(t) => setOpenItem({ type: 'ticket', data: t })}
              empty="Sin tickets este mes"
            />
            <MonthlyList
              title="🛡️ Garantías abiertas"
              icon="🛡️"
              items={monthlyGarantias}
              renderItem={(g) => `${g.brand || ''} ${g.model || ''}`}
              renderSub={(g) => `${g.project || ''} · ${fmtDate(g.uploadDate)} · ${g.status || ''}${g.days != null ? ` · ${g.days}d` : ''}`}
              onClick={(g) => setOpenItem({ type: 'garantia', data: g })}
              empty="Sin garantías abiertas ✓"
            />
            <MonthlyList
              title="🔧 Mantenimientos"
              icon="🔧"
              items={monthlyMants}
              renderItem={(m) => `${m.tipo || 'Mant.'} · ${m.project || m.proyecto || ''}`}
              renderSub={(m) => `${fmtDate(m.fechaProgramada || m.fecha_programada)} · ${m.estado || ''} · ${m.cuadrilla || ''}`}
              onClick={(m) => setOpenItem({ type: 'mantenimiento', data: m })}
              empty="Sin mantenimientos este mes"
            />
          </div>
        </div>
      )}

      {/* ───── GRÁFICAS ───── */}
      <div className="charts-row" style={{ marginTop: 20 }}>
        <ChartCard title="Por prioridad">
          <Doughnut data={dough(charts.byPriority)} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } } }} />
        </ChartCard>
        <ChartCard title="Por plataforma">
          <Doughnut data={dough(charts.byPlatform)} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } } }} />
        </ChartCard>
        <ChartCard title="Por clasificación">
          <Bar data={{
            labels: Object.keys(charts.byClassification),
            datasets: [{ data: Object.values(charts.byClassification), backgroundColor: '#0EA5E9' }],
          }} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} />
        </ChartCard>
        <ChartCard title="Incidencias por mes">
          <Line data={{
            labels: charts.timeline.labels,
            datasets: [{
              data: charts.timeline.data,
              borderColor: '#0EA5E9', backgroundColor: 'rgba(14,165,233,.15)',
              fill: true, tension: 0.35,
            }],
          }} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} />
        </ChartCard>
      </div>

      {/* ── Modal de detalle / editar ── */}
      <DetailModal
        open={!!openItem}
        onClose={() => setOpenItem(null)}
        item={openItem}
        onEdit={(type) => {
          setOpenItem(null);
          if (type === 'ticket') navigate('/tickets');
          else if (type === 'garantia') navigate('/garantias');
          else if (type === 'mantenimiento') navigate('/mantenimiento');
        }}
      />

      {/* ── Modal nuevo aviso ── */}
      <Modal
        open={avisoOpen} onClose={() => setAvisoOpen(false)}
        title="📢 Publicar aviso del día"
        footer={
          <>
            <button className="btn" onClick={() => setAvisoOpen(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={onSaveAviso}>Publicar</button>
          </>
        }
      >
        <div className="form-grid">
          <div className="form-row full">
            <label>Título *</label>
            <input value={avisoForm.title} onChange={(e) => setAvisoForm({ ...avisoForm, title: e.target.value })} />
          </div>
          <div className="form-row full">
            <label>Mensaje</label>
            <textarea rows="3" value={avisoForm.body} onChange={(e) => setAvisoForm({ ...avisoForm, body: e.target.value })} />
          </div>
          <div className="form-row">
            <label>Nivel</label>
            <select value={avisoForm.level} onChange={(e) => setAvisoForm({ ...avisoForm, level: e.target.value })}>
              <option value="info">ℹ️ Informativo</option>
              <option value="warning">⚠️ Importante</option>
              <option value="danger">🔴 Urgente</option>
            </select>
          </div>
          <div className="form-row">
            <label>Vigente hasta</label>
            <input type="date" value={avisoForm.validUntil} onChange={(e) => setAvisoForm({ ...avisoForm, validUntil: e.target.value })} />
          </div>
          <div className="form-row">
            <label>Fijado</label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={avisoForm.pinned}
                onChange={(e) => setAvisoForm({ ...avisoForm, pinned: e.target.checked })} />
              Mantener arriba
            </label>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Sección de Avisos del día ─────────────────────────
function AvisosSection({ avisos, isAdmin, onNew, onDelete }) {
  if (!avisos.length && !isAdmin) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>📢 Avisos del día</h3>
        {isAdmin && (
          <button className="btn btn-sm btn-primary" onClick={onNew} style={{ marginLeft: 'auto' }}>
            + Nuevo aviso
          </button>
        )}
      </div>
      {avisos.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>Sin avisos activos.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {avisos.map((a) => {
            const s = LEVEL_STYLE[a.level] || LEVEL_STYLE.info;
            return (
              <div key={a.id} style={{
                background: s.bg, borderLeft: `4px solid ${s.border}`,
                padding: '10px 14px', borderRadius: 8,
                display: 'flex', alignItems: 'flex-start', gap: 10,
              }}>
                <span style={{ fontSize: 18 }}>{a.pinned ? '📌' : s.icon}</span>
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: 13 }}>{a.title}</strong>
                  {a.body && <div style={{ fontSize: 12, color: 'var(--gray-700)', marginTop: 2 }}>{a.body}</div>}
                  <div style={{ fontSize: 10, color: 'var(--gray-500)', marginTop: 4 }}>
                    Por {a.postedBy || 'admin'} · {fmtDate(a.createdAt)}
                    {a.validUntil && ` · vence ${fmtDate(a.validUntil)}`}
                  </div>
                </div>
                {isAdmin && (
                  <button className="btn btn-sm btn-danger" onClick={() => onDelete(a.id)}>×</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Tarjeta con lista del mes ─────────────────────────
function MonthlyList({ title, icon, items, renderItem, renderSub, onClick, empty }) {
  return (
    <div className="chart-card" style={{ minHeight: 200 }}>
      <h3>{title} <span style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 400 }}>({items.length})</span></h3>
      {items.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--gray-400)', fontSize: 12 }}>{empty}</div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 240, overflowY: 'auto' }}>
          {items.slice(0, 10).map((it) => (
            <li key={it.id}
              onClick={() => onClick(it)}
              style={{
                padding: '8px 6px', borderBottom: '1px solid var(--gray-100, #f3f4f6)',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--gray-50, #f9fafb)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ fontSize: 12, fontWeight: 500 }}>{renderItem(it)}</div>
              <div style={{ fontSize: 10, color: 'var(--gray-500)' }}>{renderSub(it)}</div>
            </li>
          ))}
          {items.length > 10 && (
            <li style={{ padding: 8, textAlign: 'center', fontSize: 11, color: 'var(--gray-400)' }}>
              + {items.length - 10} más
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

// ── Modal de detalle (clickable) ─────────────────────
function DetailModal({ open, onClose, item, onEdit }) {
  if (!item) return null;
  const { type, data } = item;
  const title = type === 'ticket' ? `Ticket #${data.id}` :
                type === 'garantia' ? `Garantía — ${data.project || ''}` :
                `Mantenimiento — ${data.project || data.proyecto || ''}`;
  return (
    <Modal
      open={open} onClose={onClose} title={title}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cerrar</button>
          <button className="btn btn-primary" onClick={() => onEdit(type)}>
            Ir a {type === 'ticket' ? 'Tickets' : type === 'garantia' ? 'Garantías' : 'Mantenimiento'}
          </button>
        </>
      }
    >
      <div style={{ fontSize: 13, lineHeight: 1.6 }}>
        {Object.entries(data).filter(([k, v]) => v && !k.startsWith('_') && typeof v !== 'object').map(([k, v]) => (
          <div key={k} style={{ display: 'flex', borderBottom: '1px solid var(--gray-100, #f3f4f6)', padding: '4px 0' }}>
            <strong style={{ minWidth: 130, color: 'var(--gray-600)' }}>{k}:</strong>
            <span>{String(v)}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function KPI({ label, value, sub, color }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-val c-${color}`}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="chart-card">
      <h3>{title}</h3>
      <div className="chart-wrap">{children}</div>
    </div>
  );
}
