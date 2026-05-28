import { useEffect, useMemo, useState } from 'react';
import { incidenciasApi, ticketsApi, polizasApi, garantiasApi } from '../api/endpoints';
import { downloadXLSX, fmtDate } from '../utils/format';
import { useToast } from '../components/Toast';
import { useNavigate } from 'react-router-dom';
import DataTable from '../components/DataTable';
import api from '../api/client';

const SECCIONES = [
  { key: 'incidencias', label: 'Incidencias', api: incidenciasApi },
  { key: 'tickets', label: 'Tickets', api: ticketsApi },
  { key: 'polizas', label: 'Pólizas', api: polizasApi },
  { key: 'garantias', label: 'Garantías', api: garantiasApi },
];

export default function Reportes() {
  const toast = useToast();
  const navigate = useNavigate();
  const [counts, setCounts] = useState({});
  const [loadingReport, setLoadingReport] = useState(false);
  const [ticketStats, setTicketStats] = useState([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [statsQ, setStatsQ] = useState('');

  useEffect(() => {
    Promise.all(SECCIONES.map((s) => s.api.list().then((d) => [s.key, d.length]).catch(() => [s.key, 0])))
      .then((arr) => setCounts(Object.fromEntries(arr)));
    api.get('/reportes/tickets-por-proyecto')
      .then((r) => setTicketStats(r.data || []))
      .catch(() => toast('Error cargando stats de tickets', 'error'))
      .finally(() => setLoadingStats(false));
  }, []);

  const filteredStats = useMemo(() => {
    if (!statsQ.trim()) return ticketStats;
    const f = statsQ.toLowerCase();
    return ticketStats.filter((t) =>
      (t.project || '').toLowerCase().includes(f) ||
      (t.code || '').toLowerCase().includes(f) ||
      (t.client || '').toLowerCase().includes(f));
  }, [ticketStats, statsQ]);

  const totals = useMemo(() => {
    return ticketStats.reduce((acc, t) => ({
      total: acc.total + (t.total || 0),
      abiertos: acc.abiertos + (t.abiertos || 0) + (t.en_proceso || 0),
      cerrados: acc.cerrados + (t.cerrados || 0),
      vencidos: acc.vencidos + (t.vencidos || 0),
      proyectos: acc.proyectos + 1,
    }), { total: 0, abiertos: 0, cerrados: 0, vencidos: 0, proyectos: 0 });
  }, [ticketStats]);

  const exportSection = async (sec) => {
    const data = await sec.api.list();
    if (!data.length) return toast('Sin datos para exportar', 'error');
    await downloadXLSX(data, sec.label, `${sec.key}_${Date.now()}.xlsx`);
    toast(`${data.length} registros exportados`);
  };

  const exportStats = () => {
    if (!ticketStats.length) return toast('Sin datos', 'error');
    downloadXLSX(ticketStats, 'TicketsPorProyecto', `tickets_por_proyecto_${Date.now()}.xlsx`);
  };

  const openReporteHTML = async () => {
    setLoadingReport(true);
    try {
      const res = await api.get('/reportes/general', { responseType: 'text' });
      const blob = new Blob([res.data], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      toast(e?.response?.data?.message || 'Error generando reporte', 'error');
    } finally {
      setLoadingReport(false);
    }
  };

  const ticketCols = [
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
    {
      key: 'ultimaFecha', label: 'Último',
      render: (r) => fmtDate(r.ultimaFecha),
    },
    {
      key: '_actions', label: '', sortable: false,
      render: (r) => (
        <button className="btn btn-sm" title="Ver tickets de este proyecto"
          onClick={() => navigate(`/tickets?q=${encodeURIComponent(r.project)}`)}>
          🔍
        </button>
      ),
    },
  ];

  return (
    <div>
      <div className="section-header">
        <h2>Reportes y exportaciones</h2>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn btn-primary" onClick={openReporteHTML} disabled={loadingReport}>
            {loadingReport ? <span className="spinner" /> : '📄 Generar reporte profesional (HTML)'}
          </button>
        </div>
      </div>

      <div style={{
        background: 'linear-gradient(135deg,#1E3A5F 0%,#0EA5E9 100%)',
        color: 'white', padding: 20, borderRadius: 10, marginBottom: 20,
      }}>
        <h3 style={{ marginBottom: 6 }}>☀ Reporte Ejecutivo SKY PV</h3>
        <p style={{ opacity: 0.9, fontSize: 13 }}>
          Documento HTML profesional con KPIs, alertas, incidencias por cliente, tickets activos,
          garantías y pólizas próximas a vencer. Se abre en pestaña nueva y se puede imprimir como PDF.
        </p>
      </div>

      <div className="charts-row">
        {SECCIONES.map((sec) => (
          <div className="chart-card" key={sec.key}>
            <h3>{sec.label}</h3>
            <div style={{ fontSize: 32, fontWeight: 600, color: 'var(--sky)' }}>
              {counts[sec.key] ?? '—'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 12 }}>registros</div>
            <button className="btn btn-sm btn-primary" onClick={() => exportSection(sec)}>
              ⬇ Exportar Excel
            </button>
          </div>
        ))}
      </div>

      {/* ── TICKETS POR PROYECTO ── */}
      <div style={{ marginTop: 28 }}>
        <div className="section-header">
          <h2 style={{ fontSize: 16 }}>📊 Tickets por proyecto</h2>
          <span style={{ color: 'var(--gray-400)', fontSize: 12 }}>
            {ticketStats.length} proyectos · <strong>{totals.total}</strong> tickets totales
          </span>
          <div style={{ marginLeft: 'auto' }}>
            <button className="btn btn-sm" onClick={exportStats}>⬇ Exportar Excel</button>
          </div>
        </div>

        {/* Mini-KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
          <MiniKpi label="Proyectos con tickets" value={totals.proyectos} color="#0EA5E9" />
          <MiniKpi label="Tickets totales" value={totals.total} color="#1E3A5F" />
          <MiniKpi label="Activos (abiertos+proceso)" value={totals.abiertos} color="#F59E0B" />
          <MiniKpi label="Cerrados" value={totals.cerrados} color="#16A34A" />
          <MiniKpi label="Vencidos (SLA)" value={totals.vencidos} color="#DC2626" />
        </div>

        <div className="filters-bar">
          <input className="filter-input search-input"
            placeholder="Buscar proyecto, código o cliente..."
            value={statsQ} onChange={(e) => setStatsQ(e.target.value)} />
        </div>

        {loadingStats ? (
          <div className="empty"><span className="spinner" /></div>
        ) : ticketStats.length === 0 ? (
          <div className="empty">Aún no hay tickets registrados.</div>
        ) : (
          <DataTable columns={ticketCols} data={filteredStats} defaultPageSize={20} />
        )}
      </div>
    </div>
  );
}

function MiniKpi({ label, value, color }) {
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
