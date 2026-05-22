import { useEffect, useState } from 'react';
import { incidenciasApi, ticketsApi, polizasApi, garantiasApi } from '../api/endpoints';
import { downloadXLSX } from '../utils/format';
import { useToast } from '../components/Toast';
import api from '../api/client';

const SECCIONES = [
  { key: 'incidencias', label: 'Incidencias', api: incidenciasApi },
  { key: 'tickets', label: 'Tickets', api: ticketsApi },
  { key: 'polizas', label: 'Pólizas', api: polizasApi },
  { key: 'garantias', label: 'Garantías', api: garantiasApi },
];

export default function Reportes() {
  const toast = useToast();
  const [counts, setCounts] = useState({});
  const [loadingReport, setLoadingReport] = useState(false);

  useEffect(() => {
    Promise.all(SECCIONES.map((s) => s.api.list().then((d) => [s.key, d.length]).catch(() => [s.key, 0])))
      .then((arr) => setCounts(Object.fromEntries(arr)));
  }, []);

  const exportSection = async (sec) => {
    const data = await sec.api.list();
    if (!data.length) return toast('Sin datos para exportar', 'error');
    await downloadXLSX(data, sec.label, `${sec.key}_${Date.now()}.xlsx`);
    toast(`${data.length} registros exportados`);
  };

  // Abre el reporte HTML en una pestaña nueva — incluye token de autorización
  const openReporteHTML = async () => {
    setLoadingReport(true);
    try {
      const res = await api.get('/reportes/general', { responseType: 'text' });
      const blob = new Blob([res.data], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      // Liberar el URL un rato después
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      toast(e?.response?.data?.message || 'Error generando reporte', 'error');
    } finally {
      setLoadingReport(false);
    }
  };

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
    </div>
  );
}
