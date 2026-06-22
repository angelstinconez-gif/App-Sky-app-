import { useRef, useState } from 'react';
import { useToast } from './Toast';

/**
 * Botón de importación de Excel. Pasa por prop una función `uploader(file) → Promise`.
 * Llama a `onDone(count)` al terminar.
 */
export default function ImportButton({ uploader, onDone, label = '📥 Importar Excel' }) {
  const ref = useRef(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const pick = () => ref.current?.click();
  const handle = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const r = await uploader(file);
      const c = r.created ?? 0;
      const u = r.updated ?? 0;
      const i = r.imported ?? (c + u);
      if (c || u) {
        toast(`✅ Importado: +${c} nuevos · ↻${u} actualizados`);
      } else {
        toast(`✅ ${i} registros importados`);
      }
      onDone?.(i);
    } catch (err) {
      toast(err?.response?.data?.message || 'Error al importar', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className="btn btn-sm" onClick={pick} disabled={busy}>
        {busy ? <span className="spinner" /> : label}
      </button>
      <input ref={ref} type="file" accept=".xlsx,.xls,.xlsm" onChange={handle} style={{ display: 'none' }} />
    </>
  );
}
