import { useEffect, useRef, useState } from 'react';
import { Bell, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { notificationsApi } from '../api/endpoints';

const POLL_MS = 30000; // 30 s
const ROUTE_BY_TYPE = {
  ticket: '/tickets',
  incidencia: '/incidencias',
  directorio: '/directorio',
  poliza: '/polizas',
  garantia: '/garantias',
  mantenimiento: '/mantenimiento',
};

function fmtAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const ref = useRef(null);

  const refresh = async () => {
    try {
      const [list, n] = await Promise.all([
        notificationsApi.inbox({ limit: 30 }),
        notificationsApi.unreadCount(),
      ]);
      setItems(list);
      setCount(n);
    } catch {
      /* silencio: si falla auth, otros componentes lo manejan */
    }
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, []);

  // Cerrar al click fuera
  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const openItem = async (n) => {
    if (n.unread) {
      try { await notificationsApi.markRead(n.id); } catch { /* noop */ }
    }
    setOpen(false);
    const route = ROUTE_BY_TYPE[n.relatedType];
    if (route) navigate(route);
    refresh();
  };

  const onMarkAll = async () => {
    await notificationsApi.markAllRead();
    refresh();
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="btn btn-sm"
        title="Notificaciones"
        onClick={() => { setOpen((v) => !v); if (!open) refresh(); }}
        style={{ position: 'relative', padding: '6px 10px' }}
      >
        <Bell size={16} />
        {count > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            background: '#e11d48', color: '#fff', borderRadius: 10,
            fontSize: 10, fontWeight: 700, padding: '2px 6px', minWidth: 18, textAlign: 'center',
            border: '2px solid var(--card-bg, #fff)',
          }}>
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 6px)',
          width: 360, maxHeight: 480, overflowY: 'auto',
          background: 'var(--card-bg, #fff)',
          color: 'var(--text, #111)',
          border: '1px solid var(--gray-200, #e5e7eb)',
          borderRadius: 12, boxShadow: '0 12px 30px rgba(0,0,0,.18)',
          zIndex: 1000,
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 14px', borderBottom: '1px solid var(--gray-200, #e5e7eb)',
          }}>
            <strong>Notificaciones</strong>
            {count > 0 && (
              <button className="btn btn-sm" onClick={onMarkAll}>
                Marcar todas leídas
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--gray-400)' }}>
              Sin notificaciones por ahora.
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {items.map((n) => (
                <li
                  key={n.id}
                  onClick={() => openItem(n)}
                  style={{
                    padding: '10px 14px',
                    borderBottom: '1px solid var(--gray-100, #f3f4f6)',
                    cursor: 'pointer',
                    background: n.unread ? 'rgba(59,130,246,.08)' : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong style={{ fontSize: 13 }}>{n.title}</strong>
                    <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>{fmtAgo(n.sentAt)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>{n.body}</div>
                </li>
              ))}
            </ul>
          )}

          <div style={{
            padding: '8px 14px', borderTop: '1px solid var(--gray-200, #e5e7eb)',
            textAlign: 'center',
          }}>
            <button
              className="btn btn-sm"
              onClick={() => { setOpen(false); navigate('/notificaciones'); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <Settings size={14} /> Configurar canales
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
