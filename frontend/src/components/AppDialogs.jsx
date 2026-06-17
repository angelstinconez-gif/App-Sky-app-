/**
 * AppDialogs — Reemplaza window.alert, window.confirm y window.prompt
 * por modales propios de la app (no se ven feos del navegador).
 *
 * Se monta una sola vez en App.jsx y se encarga de todo.
 * Las llamadas a alert(), confirm(), prompt() en cualquier parte del código
 * se interceptan y muestran un modal estilizado con la marca SkySense.
 */
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Info, HelpCircle, X } from 'lucide-react';

export default function AppDialogs() {
  const [dialog, setDialog] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const resolverRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    // Exponer helpers Promise-based en window (NO sobrescribimos los nativos
    // porque eso rompería el código sync con `if (confirm())`).
    // Para usarlos: await window.skyConfirm('...') / await window.skyAlert('...') etc.

    window.skyAlert = (message, title = 'Aviso') => new Promise((resolve) => {
      resolverRef.current = () => resolve();
      setDialog({ type: 'alert', message: String(message ?? ''), title });
    });

    window.skyConfirm = (message, title = '¿Confirmar acción?') => new Promise((resolve) => {
      resolverRef.current = (val) => resolve(!!val);
      setDialog({ type: 'confirm', message: String(message ?? ''), title });
    });

    window.skyPrompt = (message, defaultValue = '', title = 'Información requerida') =>
      new Promise((resolve) => {
        resolverRef.current = (val) => resolve(val);
        setInputValue(defaultValue || '');
        setDialog({ type: 'prompt', message: String(message ?? ''), title });
      });

    return () => {
      delete window.skyAlert;
      delete window.skyConfirm;
      delete window.skyPrompt;
    };
  }, []);

  useEffect(() => {
    if (dialog?.type === 'prompt' && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [dialog]);

  const close = (value) => {
    const r = resolverRef.current;
    setDialog(null);
    setInputValue('');
    setTimeout(() => r?.(value), 0);
  };

  if (!dialog) return null;

  const icon = dialog.type === 'confirm'
    ? <HelpCircle size={22} />
    : dialog.type === 'prompt'
      ? <Info size={22} />
      : <AlertTriangle size={22} />;

  const accentColor = dialog.type === 'confirm' ? '#0033A0' : '#0033A0';

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && dialog.type === 'alert') close();
      }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(11, 23, 54, 0.55)',
        backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 99999, padding: 16,
        animation: 'appdlg-fade 0.15s ease',
      }}
    >
      <div style={{
        background: '#fff',
        borderRadius: 14,
        boxShadow: '0 25px 70px rgba(0,0,0,0.35)',
        width: 'min(440px, 100%)',
        overflow: 'hidden',
        animation: 'appdlg-pop 0.2s ease',
        borderTop: `4px solid ${accentColor}`,
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px 12px',
          display: 'flex', alignItems: 'center', gap: 10,
          borderBottom: '1px solid #f1f5f9',
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `${accentColor}15`, color: accentColor,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            {icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 13, fontWeight: 700, color: '#0B1736',
              letterSpacing: '-0.01em',
            }}>{dialog.title}</div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
              SkySense · Centro de Incidencias
            </div>
          </div>
          {dialog.type === 'alert' && (
            <button
              onClick={() => close()}
              style={{
                background: 'transparent', border: 0, cursor: 'pointer',
                color: '#94a3b8', padding: 4, borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Body */}
        <div style={{
          padding: '18px 20px',
          fontSize: 13.5, color: '#334155',
          lineHeight: 1.55, whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxHeight: '60vh', overflowY: 'auto',
        }}>
          {dialog.message}

          {dialog.type === 'prompt' && (
            <div style={{ marginTop: 14 }}>
              <input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') close(inputValue);
                  if (e.key === 'Escape') close(null);
                }}
                style={{
                  width: '100%', padding: '10px 12px',
                  border: '1.5px solid #cbd5e1', borderRadius: 8,
                  fontSize: 13, fontFamily: 'inherit', outline: 'none',
                  background: '#f8fafc',
                }}
                onFocus={(e) => { e.target.style.borderColor = accentColor; e.target.style.background = '#fff'; }}
                onBlur={(e) => { e.target.style.borderColor = '#cbd5e1'; e.target.style.background = '#f8fafc'; }}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px 16px',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          background: '#fafbfc', borderTop: '1px solid #f1f5f9',
        }}>
          {(dialog.type === 'confirm' || dialog.type === 'prompt') && (
            <button
              onClick={() => close(dialog.type === 'prompt' ? null : false)}
              style={{
                padding: '8px 16px', border: '1px solid #e2e8f0',
                background: '#fff', color: '#475569',
                borderRadius: 8, fontSize: 13, fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
          )}
          <button
            onClick={() => close(dialog.type === 'prompt' ? inputValue : true)}
            autoFocus
            style={{
              padding: '8px 18px', border: 'none',
              background: `linear-gradient(135deg, ${accentColor} 0%, #001F66 100%)`,
              color: '#fff',
              borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
              boxShadow: `0 4px 12px ${accentColor}40`,
            }}
          >
            {dialog.type === 'alert' ? 'Entendido' : 'Confirmar'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes appdlg-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes appdlg-pop {
          from { transform: scale(0.95) translateY(8px); opacity: 0 }
          to { transform: scale(1) translateY(0); opacity: 1 }
        }
      `}</style>
    </div>
  );
}
