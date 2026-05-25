export function fmtDate(d) {
  if (!d) return '—';
  try {
    // Si viene como "YYYY-MM-DD" tratarlo como fecha local (no UTC) para evitar
    // el shift de día por zona horaria.
    const s = String(d).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, day] = s.split('-').map((n) => parseInt(n, 10));
      const dt = new Date(y, m - 1, day);
      return dt.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' });
    }
    return new Date(d).toLocaleDateString('es-MX', {
      day: '2-digit', month: '2-digit', year: '2-digit',
    });
  } catch {
    return d;
  }
}

export function fmtDateTime(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('es-MX', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return d;
  }
}

export function fmtDays(n) {
  if (n === null || n === undefined) return '—';
  return `${n}d`;
}

export function priorityClass(p) {
  if (!p) return 'p-none';
  const map = { Critico: 'p-critico', Alta: 'p-alta', Intermedia: 'p-intermedia', Baja: 'p-baja' };
  return map[p] || 'p-none';
}

export function statusClass(s) {
  if (!s) return 'p-none';
  const k = String(s).toLowerCase().replace(/\s+/g, '-');
  if (k.includes('abiert')) return 's-abierta';
  if (k.includes('cerrad')) return 's-cerrada';
  if (k.includes('vigente')) return 's-vigente';
  if (k.includes('vencid')) return 's-vencida';
  if (k.includes('proceso') || k.includes('curso')) return 's-en-proceso';
  return 'p-none';
}

export function downloadXLSX(rows, sheetName, filename) {
  // Lazy-load xlsx para no inflar el bundle inicial
  return import('xlsx').then((XLSX) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename);
  });
}
