import { useEffect, useState } from 'react';
import { incidenciasApi, ticketsApi, polizasApi, garantiasApi } from '../api/endpoints';
import { downloadXLSX } from '../utils/format';
import { useToast } from '../components/Toast';

const SECCIONES = [
  { key: 'incidencias', label: 'Incidencias', api: incidenciasApi },
  { key: 'tickets', label: 'Tickets', api: ticketsApi },
  { key: 'polizas', label: 'Pólizas', api: polizasApi },
  { key: 'garantias', label: 'Garantías', api: garantiasApi },
];

export default function Reportes() {
  const toast = useToast();
  const [counts, setCounts] = useState({});

  useEffect(() => {
    Promise.all(SECCIONES.map((s) => s.api.list().then((d) => [s.key, d.length])))
      .then((arr) => setCounts(Object.fromEntries(arr)));
  }, []);

  const exportSection = async (sec) => {
    const data = await sec.api.list();
    if (!data.length) return toast('Sin datos para exportar', 'error');
    await downloadXLSX(data, sec.label, `${sec.key}_${Date.now()}.xlsx`);
    toast(`${data.length} registros exportados`);
  };

  return (
    <div>
      <div className="section-header"><h2>Reportes y exportaciones</h2></div>

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
