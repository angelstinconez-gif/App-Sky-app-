import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send, Bot, User, Trash2, History, Loader2, Plus } from 'lucide-react';
import { asistenteApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';

/**
 * Botón flotante (esquina inferior derecha) que abre un panel
 * lateral con el chat del asistente IA.
 */
export default function AIAssistant() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [status, setStatus] = useState(null);
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState([]);
  const bottomRef = useRef(null);

  // ⚠️ TODOS los hooks deben ir ANTES de cualquier return condicional
  // (Regla de Hooks de React: el mismo número de hooks en cada render)

  // Check status al montar (solo si hay usuario)
  useEffect(() => {
    if (!user) return;
    asistenteApi.status()
      .then(setStatus)
      .catch(() => setStatus({ available: false, allowed: false }));
  }, [user]);

  // Auto-scroll al final
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  // Cargar historial cuando se abre el menú
  useEffect(() => {
    if (showHistory) {
      asistenteApi.listarConversaciones().then(setHistory).catch(() => setHistory([]));
    }
  }, [showHistory]);

  // Returns condicionales DESPUÉS de todos los hooks ✓
  if (!user) return null;
  if (status && status.allowed === false) return null;

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: text, ts: Date.now() }]);
    setSending(true);
    try {
      const r = await asistenteApi.chat(text, conversationId);
      setConversationId(r.conversationId);
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: r.reply,
          toolCalls: r.toolCalls,
          ts: Date.now(),
        },
      ]);
    } catch (e) {
      const msg = e?.response?.data?.message || 'Error al contactar el asistente';
      setMessages((m) => [...m, { role: 'assistant', content: `⚠️ ${msg}`, ts: Date.now() }]);
    } finally {
      setSending(false);
    }
  };

  const startNew = () => {
    setMessages([]);
    setConversationId(null);
    setInput('');
    setShowHistory(false);
  };

  const loadConversation = async (id) => {
    try {
      const c = await asistenteApi.obtenerConversacion(id);
      setConversationId(c.id);
      // Sólo mostramos los pares user/assistant con content; las llamadas a tools van anidadas
      const visible = (c.messages || [])
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content)
        .map((m, i) => ({ ...m, ts: Date.now() + i }));
      setMessages(visible);
      setShowHistory(false);
    } catch {
      await window.skyAlert('No se pudo cargar la conversación');
    }
  };

  const deleteConversation = async (id, e) => {
    e.stopPropagation();
    if (!await window.skyConfirm('¿Eliminar esta conversación?')) return;
    try {
      await asistenteApi.eliminarConversacion(id);
      setHistory((h) => h.filter((c) => c.id !== id));
      if (id === conversationId) startNew();
    } catch {
      await window.skyAlert('No se pudo eliminar');
    }
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Asistente IA (SkyBot)"
        aria-label="Abrir asistente IA"
        style={{
          position: 'fixed',
          right: 22,
          bottom: 22,
          width: 60,
          height: 60,
          borderRadius: '50%',
          background: open
            ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
            : 'linear-gradient(135deg, #0033A0 0%, #001F66 100%)',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 10px 30px rgba(0,51,160,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9998,
          transition: 'all 0.2s ease',
        }}
      >
        {open ? <X size={26} /> : <MessageCircle size={26} />}
      </button>

      {/* Panel lateral */}
      {open && (
        <div
          role="dialog"
          aria-label="Asistente IA"
          style={{
            position: 'fixed',
            right: 22,
            bottom: 96,
            width: 'min(420px, calc(100vw - 44px))',
            height: 'min(620px, calc(100vh - 130px))',
            background: '#fff',
            borderRadius: 18,
            boxShadow: '0 25px 60px rgba(0,0,0,0.25)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 9997,
            border: '1px solid var(--gray-200)',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '14px 16px',
              background: 'linear-gradient(135deg, #0033A0 0%, #001F66 100%)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Bot size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>SkyBot</div>
              <div style={{ fontSize: 11, opacity: 0.85 }}>
                {status?.available
                  ? `Listo · ${status.toolsCount} herramientas`
                  : 'No configurado'}
              </div>
            </div>
            <button
              onClick={() => setShowHistory((s) => !s)}
              title="Historial"
              style={iconBtn}
            >
              <History size={16} />
            </button>
            <button onClick={startNew} title="Nueva conversación" style={iconBtn}>
              <Plus size={16} />
            </button>
            <button onClick={() => setOpen(false)} title="Cerrar" style={iconBtn}>
              <X size={16} />
            </button>
          </div>

          {/* Historial */}
          {showHistory && (
            <div
              style={{
                padding: 10,
                background: '#f9fafb',
                borderBottom: '1px solid var(--gray-200)',
                maxHeight: 200,
                overflowY: 'auto',
              }}
            >
              {history.length === 0 ? (
                <div style={{ color: 'var(--gray-500)', fontSize: 12, textAlign: 'center', padding: 8 }}>
                  Sin conversaciones aún
                </div>
              ) : (
                history.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => loadConversation(c.id)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      background: c.id === conversationId ? '#eef2ff' : 'transparent',
                      marginBottom: 4,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, fontSize: 12 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: 'var(--gray-800)',
                        }}
                      >
                        {c.title || `Conversación #${c.id}`}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--gray-500)' }}>
                        {c.updatedAt ? new Date(c.updatedAt).toLocaleString('es-MX') : ''}
                      </div>
                    </div>
                    <button
                      onClick={(e) => deleteConversation(c.id, e)}
                      title="Eliminar"
                      style={{ ...iconBtn, color: '#ef4444' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Mensajes */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 16,
              background: '#f9fafb',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {messages.length === 0 && (
              <div
                style={{
                  textAlign: 'center',
                  color: 'var(--gray-500)',
                  fontSize: 13,
                  padding: '24px 12px',
                }}
              >
                <Bot size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
                <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--gray-700)' }}>
                  ¡Hola {user.name?.split(' ')[0]}!
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                  Pregúntame lo que sea sobre tus pólizas, tickets, incidencias o garantías.
                  <br />
                  También puedo crear o cerrar registros si me lo pides.
                </div>
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    '¿Cómo van mis incidencias?',
                    '¿Qué tickets están abiertos?',
                    'Revisiones de hoy',
                  ].map((s) => (
                    <button
                      key={s}
                      onClick={() => setInput(s)}
                      style={{
                        background: '#fff',
                        border: '1px solid var(--gray-200)',
                        borderRadius: 16,
                        padding: '6px 12px',
                        fontSize: 12,
                        cursor: 'pointer',
                        color: 'var(--gray-700)',
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <MessageBubble key={i} m={m} />
            ))}
            {sending && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--gray-500)', fontSize: 12 }}>
                <Loader2 size={14} className="spin" /> SkyBot está pensando…
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div
            style={{
              padding: 10,
              borderTop: '1px solid var(--gray-200)',
              background: '#fff',
              display: 'flex',
              gap: 8,
              alignItems: 'flex-end',
            }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder={
                status?.available
                  ? 'Escribe tu pregunta…'
                  : 'Asistente no disponible. Falta configurar AI_API_KEY.'
              }
              disabled={!status?.available || sending}
              rows={1}
              style={{
                flex: 1,
                resize: 'none',
                border: '1px solid var(--gray-200)',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 13,
                fontFamily: 'inherit',
                outline: 'none',
                maxHeight: 100,
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sending || !status?.available}
              title="Enviar"
              style={{
                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                width: 40,
                height: 40,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: input.trim() && !sending ? 'pointer' : 'not-allowed',
                opacity: input.trim() && !sending ? 1 : 0.5,
              }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}

const iconBtn = {
  background: 'rgba(255,255,255,0.18)',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  width: 28,
  height: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};

function MessageBubble({ m }) {
  const isUser = m.role === 'user';
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        flexDirection: isUser ? 'row-reverse' : 'row',
        alignItems: 'flex-start',
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: isUser ? '#e0e7ff' : 'linear-gradient(135deg, #6366f1, #7c3aed)',
          color: isUser ? '#4338ca' : '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>
      <div
        style={{
          maxWidth: '80%',
          background: isUser ? '#4f46e5' : '#fff',
          color: isUser ? '#fff' : 'var(--gray-800)',
          padding: '10px 12px',
          borderRadius: 14,
          fontSize: 13,
          lineHeight: 1.45,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          border: isUser ? 'none' : '1px solid var(--gray-200)',
          boxShadow: isUser ? 'none' : '0 1px 2px rgba(0,0,0,0.04)',
        }}
      >
        {m.content}
        {!isUser && m.toolCalls?.length > 0 && (
          <div
            style={{
              marginTop: 8,
              paddingTop: 8,
              borderTop: '1px dashed var(--gray-200)',
              fontSize: 11,
              color: 'var(--gray-500)',
            }}
          >
            ⚙️ Usó: {m.toolCalls.map((t) => t.name).join(', ')}
          </div>
        )}
      </div>
    </div>
  );
}
