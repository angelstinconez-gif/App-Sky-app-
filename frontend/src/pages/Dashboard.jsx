import { useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
} from 'chart.js';
import { Doughnut, Bar, Line } from 'react-chartjs-2';
import { dashboardApi } from '../api/endpoints';

ChartJS.register(
  ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement
);

const PALETTE = ['#0EA5E9', '#F59E0B', '#EF4444', '#22C55E', '#8B5CF6', '#F97316', '#64748B', '#06B6D4'];

export default function Dashboard() {
  const [kpis, setKpis] = useState(null);
  const [charts, setCharts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([dashboardApi.kpis(), dashboardApi.charts()])
      .then(([k, c]) => {
        setKpis(k);
        setCharts(c);
      })
      .catch((e) => setError(e?.response?.data?.message || 'Error al cargar dashboard'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="empty"><span className="spinner" /></div>;
  if (error) return <div className="empty" style={{ color: 'var(--red)' }}>{error}</div>;

  const dough = (obj) => ({
    labels: Object.keys(obj),
    datasets: [{ data: Object.values(obj), backgroundColor: PALETTE, borderWidth: 0 }],
  });

  return (
    <div>
      <div className="kpi-grid">
        <KPI label="Incidencias totales" value={kpis.incidencias.total} color="sky" />
        <KPI label="Abiertas" value={kpis.incidencias.abiertas} color="red" />
        <KPI label="Críticas" value={kpis.incidencias.criticas} color="red" sub="prioridad" />
        <KPI label="Tickets abiertos" value={kpis.tickets.abiertos} color="orange" />
        <KPI label="Pólizas vigentes" value={kpis.polizas.vigentes} color="green" sub={`/ ${kpis.polizas.total}`} />
        <KPI label="Vencen pronto" value={kpis.polizas.vencenPronto} color="amber" sub="≤ 30 días" />
        <KPI label="Garantías abiertas" value={kpis.garantias.abiertas} color="purple" />
      </div>

      <div className="charts-row">
        <ChartCard title="Por prioridad">
          <Doughnut data={dough(charts.byPriority)} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } } }} />
        </ChartCard>
        <ChartCard title="Por plataforma">
          <Doughnut data={dough(charts.byPlatform)} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } } }} />
        </ChartCard>
        <ChartCard title="Por clasificación">
          <Bar
            data={{
              labels: Object.keys(charts.byClassification),
              datasets: [{ data: Object.values(charts.byClassification), backgroundColor: '#0EA5E9' }],
            }}
            options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }}
          />
        </ChartCard>
        <ChartCard title="Incidencias por mes">
          <Line
            data={{
              labels: charts.timeline.labels,
              datasets: [
                {
                  data: charts.timeline.data,
                  borderColor: '#0EA5E9',
                  backgroundColor: 'rgba(14,165,233,.15)',
                  fill: true,
                  tension: 0.35,
                },
              ],
            }}
            options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }}
          />
        </ChartCard>
      </div>
    </div>
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
