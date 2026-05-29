import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DataTable from '../components/DataTable';
import { useToast } from '../components/Toast';
import { downloadXLSX, fmtDate } from '../utils/format';
import api from '../api/client';

export default function TicketsPorProyecto() {
  const toast = useToast();
  const navigate = useNavigate();
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    api.get('/reportes/tickets-por-proyecto')
      .then((r) => setStats(r.data || []))
      .catch(() => toast('Error cargando stats', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!q.trim()) return stats;
    const f = q.toLowerCase();
    return stats.filter((t) =>
      (t.project || '').toLowerCase().includes(f) ||
      (t.code || '').toLowerCase().includes(f) ||
      (t.client || '').toLowerCase().includes(f));
  }, [stats, q]);

  const totals = useMemo(() => stats.reduce((a, t) => ({
    total: a.total + (t.total || 0),
    activos: a.activos + (t.abiertos || 0) + (t.en_proceso || 0),
    cerrados: a.cerrados + (t.cerrados || 0),
    vencidos: a.vencidos + (t.vencidos || 0),
    criticos: a.criticos + (t.criticos || 0),
  }), { total: 0, activos: 0, cerrados: 0, vencidos: 0, criticos: 0 }), [stats]);

  const columns = [
    { key: 'project', label: 'Proyecto' },
    {
      key: 'code', label: 'Código',
      render: (r) => r.code
        ? <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 600 }}>{r.code}</span>
        : '—',
    },
    { key: 'client', label: 'Cliente' },
    {
      key: 'total', label: 'Total',
      render: (r) => <strong style={{ fontSize: 14, color: 'var(--gray-700)' }}>{r.total}</strong>,
    },
    {
      key: 'abiertos', label: 'Abiertos',
      render: (r) => r.abiertos > 0
        ? <span style={{ background: '#fee2e2', color: '#991b1b', padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>🔴 {r.abiertos}</span>
        : <span style={{ color: 'var(--gray-400)' }}>0</span>,
    },
    {
      key: 'en_proceso', label: 'En proceso',
      render: (r) => r.en_proceso > 0
        ? <span style={{ background: '#fef3c7', color: '#92400e', padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>🟡 {r.en_proceso}</span>
        : <span style={{ color: 'var(--gray-400)' }}>0</span>,
    },
    {
      key: 'cerrados', label: 'Cerrados',
      render: (r) => r.cerrados > 0
        ? <span style={{ background: '#dcfce7', color: '#166534', padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>✓ {r.cerrados}</span>
        : <span style={{ color: 'var(--gray-400)' }}>0</span>,
    },
    {
      key: 'vencidos', label: 'Vencidos',
      render: (r) => r.vencidos > 0
        ? <span style={{ color: '#dc2626', fontWeight: 700 }}>⚠️ {r.vencidos}</span>
        : <span style={{ color: 'var(--gray-400)' }}>—</span>,
    },
    {
      key: 'criticos', label: 'Críticos',
      render: (r) => r.criticos > 0
        ? <span style={{ color: '#dc2626', fontWeight: 700 }}>{r.criticos}</span>
        : <span style={{ color: 'var(--gray-400)' }}>—</span>,
    },
    { key: 'ultimaFecha', label: 'Último', render: (r) => fmtDate(r.ultimaFecha) },
    {
      key: '_actions', label: '', sortable: false,
      render: (r) => (
        <button className="btn btn-sm" title="Ver tickets del proyecto"
          onClick={() => navigate(`/tickets?q=${encodeURIComponent(r.project)}`)}>
          🔍
        </button>
      ),
    },
  ];

  return (
    <div>
      <div className="section-header">
        <h2>Tickets por proyecto</h2>
        <span style={{ color: 'var(--gray-400)', fontSize: 12 }}>
          {stats.length} proyectos · <strong>{totals.total}</strong> tickets totales
        </span>
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn btn-sm" onClick={() => downloadXLSX(stats, 'TicketsPorProyecto', `tickets_proyecto_${Date.now()}.xlsx`)}>
            ⬇ Exportar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
        <Kpi label="Proyectos con tickets" value={stats.length} color="#0EA5E9" />
        <Kpi label="Tickets totales" value={totals.total} color="#1E3A5F" />
        <Kpi label="Activos" value={totals.activos} color="#F59E0B" />
        <Kpi label="Cerrados" value={totals.cerrados} color="#16A34A" />
        <Kpi label="Vencidos SLA" value={totals.vencidos} color="#DC2626" />
        <Kpi label="Críticos" value={totals.criticos} color="#DC2626" />
      </div>

      <div className="filters-bar">
        <input className="filter-input search-input"
          placeholder="Buscar proyecto, código, cliente..."
          value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {loading ? (
        <div className="empty"><span className="spinner" /></div>
      ) : stats.length === 0 ? (
        <div className="empty">Aún no hay tickets registrados.</div>
      ) : (
        <DataTable columns={columns} data={filtered} defaultPageSize={20} />
      )}
    </div>
  );
}

function Kpi({ label, value, color }) {
  return (
    <div style={{
      background: 'var(--card-bg, white)', border: '1px solid var(--gray-200, #e5e7eb)',
      borderRadius: 8, padding: '10px 14px',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, marginTop: 4 }}>{value}</div>
    </div>
  );
}
