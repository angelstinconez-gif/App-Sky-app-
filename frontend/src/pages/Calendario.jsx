import { useEffect, useMemo, useState } from 'react';
import { eventosApi } from '../api/endpoints';
import { fmtDate } from '../utils/format';

export default function Calendario() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(() => new Date());

  useEffect(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const start = new Date(y, m - 1, 1).toISOString().slice(0, 10);
    const end = new Date(y, m + 2, 0).toISOString().slice(0, 10);
    setLoading(true);
    eventosApi.list({ start, end }).then(setEvents).finally(() => setLoading(false));
  }, [cursor]);

  const grid = useMemo(() => buildMonth(cursor, events), [cursor, events]);

  return (
    <div>
      <div className="section-header">
        <h2>Calendario</h2>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="btn btn-sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>‹</button>
          <strong style={{ minWidth: 160, textAlign: 'center' }}>
            {cursor.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}
          </strong>
          <button className="btn btn-sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>›</button>
          <button className="btn btn-sm" onClick={() => setCursor(new Date())}>Hoy</button>
        </div>
      </div>

      {loading ? <div className="empty"><span className="spinner" /></div> : (
        <div className="table-wrap" style={{ padding: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => (
              <div key={d} style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', padding: 6 }}>{d}</div>
            ))}
            {grid.map((cell, i) => (
              <div key={i} style={{
                minHeight: 90, padding: 6, borderRadius: 8,
                background: cell.isCurrentMonth ? 'var(--gray-50)' : 'transparent',
                opacity: cell.isCurrentMonth ? 1 : 0.4,
                border: cell.isToday ? '2px solid var(--sky)' : '1px solid var(--gray-100)',
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-600)', marginBottom: 4 }}>
                  {cell.day}
                </div>
                {cell.events.slice(0, 3).map((e) => (
                  <div key={e.id} title={e.title} style={{
                    background: e.color || '#0EA5E9', color: '#fff',
                    fontSize: 10, padding: '2px 4px', borderRadius: 4,
                    marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{e.title}</div>
                ))}
                {cell.events.length > 3 && (
                  <div style={{ fontSize: 10, color: 'var(--gray-500)' }}>+{cell.events.length - 3} más</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Próximos eventos</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Fecha</th><th>Tipo</th><th>Título</th></tr>
            </thead>
            <tbody>
              {events
                .filter((e) => new Date(e.eventDate) >= new Date())
                .sort((a, b) => a.eventDate.localeCompare(b.eventDate))
                .slice(0, 15)
                .map((e) => (
                  <tr key={e.id}>
                    <td>{fmtDate(e.eventDate)}</td>
                    <td>{e.eventType}</td>
                    <td>{e.title}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function buildMonth(cursor, events) {
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const first = new Date(y, m, 1);
  const startDay = (first.getDay() + 6) % 7; // lunes = 0
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const cells = [];
  for (let i = 0; i < startDay; i++) {
    const d = new Date(y, m, -startDay + i + 1);
    cells.push({ day: d.getDate(), isCurrentMonth: false, isToday: false, events: [] });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, m, d);
    const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({
      day: d,
      isCurrentMonth: true,
      isToday: date.getTime() === today.getTime(),
      events: events.filter((e) => e.eventDate === iso),
    });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ day: cells.length, isCurrentMonth: false, isToday: false, events: [] });
  }
  return cells;
}
