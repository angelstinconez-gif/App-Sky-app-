import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, X, Ticket, AlertTriangle, Wrench, Users, Shield, FileText, Loader,
} from 'lucide-react';
import { searchApi } from '../api/endpoints';

const ICON_BY_SECTION = {
  tickets: Ticket,
  incidencias: AlertTriangle,
  mantenimientos: Wrench,
  directorio: Users,
  garantias: Shield,
  polizas: FileText,
};

const COLOR_BY_SECTION = {
  tickets: '#0EA5E9',
  incidencias: '#dc2626',
  mantenimientos: '#f59e0b',
  directorio: '#10b981',
  garantias: '#8b5cf6',
  polizas: '#64748b',
};

const LABEL_BY_SECTION = {
  tickets: 'Tickets',
  incidencias: 'Incidencias',
  mantenimientos: 'Mantenimientos',
  directorio: 'Directorio',
  garantias: 'Garantías',
  polizas: 'Pólizas',
};

export default function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Debounce: buscar 300ms después del último cambio
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      searchApi.global(q)
        .then((data) => setResults(data))
        .catch(() => setResults({ results: [], total: 0 }))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  // Cerrar al click fuera
  useEffect(() => {
    const onDoc = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Atajo de teclado: "/" para enfocar
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const goTo = (r) => {
    setOpen(false);
    setQ('');
    setResults(null);
    if (r.route) navigate(r.route);
  };

  // Agrupar resultados por sección
  const grouped = (results?.results || []).reduce((acc, r) => {
    (acc[r.section] = acc[r.section] || []).push(r);
    return acc;
  }, {});

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', maxWidth: 560 }}>
      <div style={{ position: 'relative' }}>
        <Search size={15} style={{
          position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--gray-400, #94a3b8)', pointerEvents: 'none',
        }} />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="🔍 Buscar tickets, incidencias, mantto, directorio…  ( / para enfocar )"
          style={{
            width: '100%', padding: '9px 36px 9px 36px',
            border: '1.5px solid var(--gray-200, #e5e7eb)',
            borderRadius: 10, fontSize: 13, background: 'var(--gray-50, #f9fafb)',
            outline: 'none', transition: 'all .15s',
          }}
          onMouseOver={(e) => e.target.style.borderColor = 'var(--sky, #0EA5E9)'}
          onMouseOut={(e) => e.target.style.borderColor = ''}
        />
        {(q || loading) && (
          <button onClick={() => { setQ(''); setResults(null); }} style={{
            position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
            background: 'transparent', border: 0, color: 'var(--gray-400, #94a3b8)',
            cursor: 'pointer', padding: 4, borderRadius: 4,
          }}>
            {loading ? <Loader size={14} className="spin" /> : <X size={14} />}
          </button>
        )}
      </div>

      {/* Dropdown de resultados */}
      {open && q.length >= 2 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6,
          background: 'var(--card-bg, #fff)',
          border: '1px solid var(--gray-200, #e5e7eb)',
          borderRadius: 10, boxShadow: '0 12px 30px rgba(0,0,0,.18)',
          maxHeight: 480, overflowY: 'auto', zIndex: 1000,
        }}>
          {loading ? (
            <div style={{ padding: 18, textAlign: 'center', color: 'var(--gray-500)', fontSize: 12 }}>
              Buscando...
            </div>
          ) : results === null || results.total === 0 ? (
            <div style={{ padding: 18, textAlign: 'center', color: 'var(--gray-500)', fontSize: 12 }}>
              {q.length < 2 ? 'Escribe al menos 2 caracteres' : 'Sin resultados'}
              {results?.role && <div style={{ marginTop: 4, fontSize: 10 }}>
                (Rol actual: <strong>{results.role}</strong>)
              </div>}
            </div>
          ) : (
            <>
              <div style={{
                padding: '8px 14px', borderBottom: '1px solid var(--gray-100)',
                fontSize: 11, color: 'var(--gray-500)',
              }}>
                {results.total} resultado{results.total !== 1 ? 's' : ''}
                {results.role && <span> · rol: <strong>{results.role}</strong></span>}
              </div>

              {Object.entries(grouped).map(([section, items]) => {
                const Icon = ICON_BY_SECTION[section] || Search;
                const color = COLOR_BY_SECTION[section] || '#64748b';
                const label = LABEL_BY_SECTION[section] || section;
                return (
                  <div key={section}>
                    <div style={{
                      padding: '6px 14px', background: 'var(--gray-50, #f9fafb)',
                      fontSize: 10, fontWeight: 700, color: color,
                      textTransform: 'uppercase', letterSpacing: '.06em',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <Icon size={12} /> {label} ({items.length})
                    </div>
                    {items.map((r) => (
                      <div key={`${section}-${r.id}`}
                        onClick={() => goTo(r)}
                        style={{
                          padding: '10px 14px', cursor: 'pointer',
                          borderBottom: '1px solid var(--gray-100, #f3f4f6)',
                          display: 'flex', gap: 10, alignItems: 'flex-start',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--gray-50, #f9fafb)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{
                          width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                          background: `${color}20`, color: color,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Icon size={14} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--gray-800, #1f2937)' }}>
                            {r.title}
                          </div>
                          {r.subtitle && (
                            <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 2 }}>
                              {r.subtitle}
                            </div>
                          )}
                          {r.extra && (
                            <div style={{ fontSize: 10, color: 'var(--gray-400)', marginTop: 2 }}>
                              {r.extra}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
