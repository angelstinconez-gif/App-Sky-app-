import { AlertCircle, Link2, ExternalLink } from 'lucide-react';

/**
 * Banner que muestra tickets/incidencias relacionados encontrados
 * para que el usuario decida si crear o no uno nuevo.
 *
 * Props:
 *   items: array de elementos relacionados (con tieneRelacion, razones, id, title/site/problem...)
 *   kind: 'ticket' | 'incidencia'
 *   onNavigate: (route) => void
 */
export default function RelatedAlert({ items, kind = 'ticket', onNavigate }) {
  if (!items || items.length === 0) return null;

  const related = items.filter((i) => i.tieneRelacion);
  const otros = items.filter((i) => !i.tieneRelacion);
  const total = related.length + otros.length;

  if (total === 0) return null;

  const tipoLabel = kind === 'incidencia' ? 'incidencia' : 'ticket';
  const tipoLabelP = kind === 'incidencia' ? 'incidencias' : 'tickets';
  const route = kind === 'incidencia' ? '/incidencias' : '/tickets';

  // Color del banner según severidad
  const hasOpen = items.some((i) =>
    (i.estaAbierto === true) ||
    ((i.status || '').toLowerCase() === 'abierta')
  );
  const bg = hasOpen ? '#fef3c7' : '#dbeafe';
  const fg = hasOpen ? '#92400e' : '#1e40af';
  const border = hasOpen ? '#f59e0b' : '#3b82f6';

  return (
    <div style={{
      background: bg, border: `1px solid ${border}40`,
      borderLeft: `4px solid ${border}`, borderRadius: 8,
      padding: '12px 14px', marginBottom: 14, fontSize: 12, color: fg,
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
        <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: 1 }}>
          <strong style={{ fontSize: 13 }}>
            ⚠️ Ya existen {total} {total === 1 ? tipoLabel : tipoLabelP} para este proyecto
          </strong>
          <div style={{ fontSize: 11, marginTop: 2, opacity: 0.85 }}>
            {related.length > 0 && (
              <>
                <Link2 size={10} style={{ verticalAlign: 'middle' }} />{' '}
                <strong>{related.length}</strong> con relación directa
                {otros.length > 0 ? ` · ${otros.length} más en el mismo proyecto` : ''}
              </>
            )}
            {related.length === 0 && otros.length > 0 && (
              <>{otros.length} en el mismo proyecto (sin relación directa)</>
            )}
          </div>
        </div>
        {onNavigate && (
          <button
            onClick={() => onNavigate(route)}
            style={{
              background: 'transparent', border: `1px solid ${border}80`,
              color: fg, padding: '4px 10px', borderRadius: 6, fontSize: 11,
              cursor: 'pointer', fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
            Ver lista <ExternalLink size={11} />
          </button>
        )}
      </div>

      {/* Lista compacta */}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 11 }}>
        {items.slice(0, 5).map((i) => (
          <li key={i.id} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '4px 6px', borderRadius: 4,
            background: i.tieneRelacion ? 'rgba(255,255,255,.55)' : 'transparent',
            marginBottom: 2,
          }}>
            <span>
              <strong>#{i.id}</strong> · {i.title || i.site || i.problem || '—'}
              {i.tieneRelacion && i.razones?.length > 0 && (
                <span style={{
                  marginLeft: 6, fontSize: 10, padding: '1px 6px',
                  background: border, color: 'white', borderRadius: 8, fontWeight: 700,
                }}>
                  {i.razones.join(' · ')}
                </span>
              )}
            </span>
            <span style={{ fontSize: 10, opacity: 0.75 }}>
              {i.status || '—'}
            </span>
          </li>
        ))}
        {items.length > 5 && (
          <li style={{ fontSize: 10, opacity: 0.75, padding: '3px 6px' }}>
            ... y {items.length - 5} más
          </li>
        )}
      </ul>

      <div style={{ fontSize: 10, marginTop: 6, opacity: 0.8 }}>
        💡 Puedes continuar y crear uno nuevo, o cerrar este formulario para revisar los existentes.
      </div>
    </div>
  );
}
