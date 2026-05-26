import { useEffect, useMemo, useState } from 'react';

const PAGE_SIZES = [10, 20, 50, 100];

export default function DataTable({ columns, data, emptyMessage = 'Sin registros', defaultPageSize = 20 }) {
  const [sort, setSort] = useState({ key: null, dir: 'asc' });
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    if (!sort.key) return data;
    const k = sort.key;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...data].sort((a, b) => {
      const va = a[k] ?? '';
      const vb = b[k] ?? '';
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [data, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  // Si cambia el dataset y la página actual queda fuera, vuelve a la última
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const start = (page - 1) * pageSize;
  const paginated = pageSize > 0 ? sorted.slice(start, start + pageSize) : sorted;

  const toggleSort = (key) => {
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));
  };

  if (!data.length) return <div className="empty">{emptyMessage}</div>;

  return (
    <div className="table-wrap">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  onClick={c.sortable !== false ? () => toggleSort(c.key) : undefined}
                  style={c.sortable !== false ? { cursor: 'pointer', whiteSpace: 'nowrap' } : { whiteSpace: 'nowrap' }}
                >
                  {c.label}
                  {sort.key === c.key && (sort.dir === 'asc' ? ' ▲' : ' ▼')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.map((row) => (
              <tr key={row.id}>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    title={c.tooltip ? c.tooltip(row) : undefined}
                    style={c.key === '_actions' ? { whiteSpace: 'nowrap' } : undefined}
                  >
                    {c.render ? c.render(row) : row[c.key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Paginador ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 12px', borderTop: '1px solid var(--gray-100, #f3f4f6)',
        flexWrap: 'wrap', gap: 8, fontSize: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ color: 'var(--gray-500)' }}>Mostrar:</label>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setPage(1); }}
            style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid var(--gray-200, #e5e7eb)' }}
          >
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            <option value={sorted.length}>Todos ({sorted.length})</option>
          </select>
          <span style={{ color: 'var(--gray-500)' }}>
            por página · <strong>{sorted.length}</strong> registros
          </span>
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button className="btn btn-sm" disabled={page === 1} onClick={() => setPage(1)}>«</button>
            <button className="btn btn-sm" disabled={page === 1} onClick={() => setPage(page - 1)}>‹</button>
            <span style={{ padding: '0 10px', fontSize: 12, color: 'var(--gray-600)' }}>
              Página <strong>{page}</strong> de <strong>{totalPages}</strong>
            </span>
            <button className="btn btn-sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>›</button>
            <button className="btn btn-sm" disabled={page === totalPages} onClick={() => setPage(totalPages)}>»</button>
          </div>
        )}
      </div>
    </div>
  );
}
