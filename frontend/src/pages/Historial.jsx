import { useEffect, useState } from 'react';
import DataTable from '../components/DataTable';
import { historialApi } from '../api/endpoints';
import { fmtDateTime, downloadXLSX } from '../utils/format';

const SECCIONES = ['sistema', 'incidencias', 'tickets', 'polizas', 'garantias', 'usuarios', 'directorio', 'cuadrillas', 'errores', 'importar'];

export default function Historial() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState('');

  useEffect(() => {
    setLoading(true);
    historialApi.list({ section: section || undefined, limit: 500 })
      .then(setItems)
      .finally(() => setLoading(false));
  }, [section]);

  return (
    <div>
      <div className="section-header">
        <h2>Historial</h2>
        <span style={{ color: 'var(--gray-400)', fontSize: 12 }}>{items.length} eventos</span>
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn btn-sm" onClick={() => downloadXLSX(items, 'Historial', `historial_${Date.now()}.xlsx`)}>
            ⬇ Exportar
          </button>
        </div>
      </div>

      <div className="filters-bar">
        <select className="filter-select" value={section} onChange={(e) => setSection(e.target.value)}>
          <option value="">Todas las secciones</option>
          {SECCIONES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? <div className="empty"><span className="spinner" /></div> : (
        <DataTable
          columns={[
            { key: 'timestamp', label: 'Fecha', render: (r) => fmtDateTime(r.timestamp) },
            { key: 'section', label: 'Sección' },
            { key: 'action', label: 'Acción' },
            { key: 'userName', label: 'Usuario' },
            { key: 'detail', label: 'Detalle' },
          ]}
          data={items}
        />
      )}
    </div>
  );
}
