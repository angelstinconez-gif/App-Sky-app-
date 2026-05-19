import { useMemo, useState } from 'react';

export default function DataTable({ columns, data, emptyMessage = 'Sin registros' }) {
  const [sort, setSort] = useState({ key: null, dir: 'asc' });

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
                  style={c.sortable !== false ? { cursor: 'pointer' } : {}}
                >
                  {c.label}
                  {sort.key === c.key && (sort.dir === 'asc' ? ' ▲' : ' ▼')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.id}>
                {columns.map((c) => (
                  <td key={c.key} title={c.tooltip ? c.tooltip(row) : undefined}>
                    {c.render ? c.render(row) : row[c.key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
