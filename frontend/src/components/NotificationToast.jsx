import { useEffect, useRef, useState } from 'react';
import { Bell, X, AlertTriangle, Info, CheckCircle, Ticket, Wrench, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { notificationsApi } from '../api/endpoints';

const POLL_MS = 30000;            // sondear cada 30 s
const TOAST_TIMEOUT_MS = 8000;    // auto-cierre del toast

const ICON_BY_TYPE = {
  ticket: Ticket,
  incidencia: AlertTriangle,
  mantenimiento: Wrench,
  garantia: FileText,
  aviso: Bell,
  default: Info,
};

const COLOR_BY_TYPE = {
  ticket: '#0EA5E9',
  incidencia: '#dc2626',
  mantenimiento: '#f59e0b',
  garantia: '#8b5cf6',
  aviso: '#0EA5E9',
  default: '#64748b',
};

const ROUTE_BY_TYPE = {
  ticket: '/tickets',
  incidencia: '/incidencias',
  mantenimiento: '/mantenimiento',
  garantia: '/garantias',
};

/**
 * Sondea el inbox del usuario; cuando llegan notificaciones nuevas (no vistas previamente)
 * muestra un toast pequeño en la esquina inferior derecha, y opcionalmente usa la
 * Notification API del navegador (con permiso del usuario).
 */
export default function NotificationToast() {
  const navigate = useNavigate();
  const [toasts, setToasts] = useState([]);
  const seen = useRef(new Set());     // IDs ya mostrados
  const firstLoad = useRef(true);

  // Pedir permiso de notificaciones del navegador una vez
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    }
  }, []);

  // Sondear inbox cada 30s
  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const list = await notificationsApi.inbox({ limit: 20, unread: 1 });
        if (!active) return;
        if (firstLoad.current) {
          // primer fetch: marcar los actuales como "ya vistos" sin disparar toasts
          list.forEach((n) => seen.current.add(n.id));
          firstLoad.current = false;
          return;
        }
        const nuevas = list.filter((n) => !seen.current.has(n.id));
        nuevas.forEach((n) => seen.current.add(n.id));
        if (nuevas.length === 0) return;

        // Mostrar como toast inline
        setToasts((prev) => [...nuevas, ...prev].slice(0, 5));

        // Notificación nativa del sistema operativo (si tiene permiso)
        if (typeof window !== 'undefined' && 'Notification' in window
            && Notification.permission === 'granted') {
          nuevas.forEach((n) => {
            try {
              new Notification(n.title || 'SKY SENSE', {
                body: n.body || '',
                tag: `n-${n.id}`,
                icon: '/sky-sense-logo.svg',
              });
            } catch { /* noop */ }
          });
        }
      } catch {
        // silencio: posible no-auth, no romper UI
      }
    };
    check();
    const t = setInterval(check, POLL_MS);
    return () => { active = false; clearInterval(t); };
  }, []);

  // Auto-cerrar cada toast después de N segundos
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) => setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== t.id));
    }, TOAST_TIMEOUT_MS));
    return () => timers.forEach((id) => clearTimeout(id));
  }, [toasts]);

  const dismiss = (id) => setToasts((prev) => prev.filter((x) => x.id !== id));

  const openItem = async (n) => {
    try { await notificationsApi.markRead(n.id); } catch { /* noop */ }
    dismiss(n.id);
    const route = ROUTE_BY_TYPE[n.relatedType];
    if (route) navigate(route);
  };

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 16,
      right: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      zIndex: 2000,
      maxWidth: 360,
    }}>
      {toasts.map((n) => {
        const Icon = ICON_BY_TYPE[n.relatedType] || ICON_BY_TYPE.default;
        const color = COLOR_BY_TYPE[n.relatedType] || COLOR_BY_TYPE.default;
        return (
          <div key={n.id}
            onClick={() => openItem(n)}
            style={{
              background: 'white',
              border: '1px solid var(--gray-200, #e5e7eb)',
              borderLeft: `4px solid ${color}`,
              borderRadius: 8,
              padding: '12px 14px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
              cursor: 'pointer',
              animation: 'slideIn .3s ease-out',
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
            }}>
            <div style={{
              flexShrink: 0, width: 36, height: 36, borderRadius: 8,
              background: `${color}20`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color,
            }}>
              <Icon size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-800, #1f2937)' }}>
                {n.title}
              </div>
              {n.body && (
                <div style={{
                  fontSize: 12, color: 'var(--gray-600, #4b5563)', marginTop: 2,
                  overflow: 'hidden', textOverflow: 'ellipsis',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}>
                  {n.body}
                </div>
              )}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); dismiss(n.id); }}
              style={{
                background: 'transparent', border: 0, padding: 4, cursor: 'pointer',
                color: 'var(--gray-400, #94a3b8)', borderRadius: 4,
              }}
              title="Cerrar"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(120%); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
