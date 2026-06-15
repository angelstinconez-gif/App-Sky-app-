import { useEffect, useMemo, useState } from 'react';
import { Check, AlertTriangle, WifiOff, FileQuestion, ChevronLeft, ChevronRight, Calendar, Save, LayoutGrid, FileText, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { revsemApi } from '../api/endpoints';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import DataTable from '../components/DataTable';
import { fmtDate, downloadXLSX } from '../utils/format';
import api from '../api/client';

const ESTADOS = [
  { id: 'OK',                label: 'OK',                bg: '#dcfce7', fg: '#166534', icon: Check },
  { id: 'Sin comunicación',  label: 'Sin comunicación',  bg: '#fef3c7', fg: '#92400e', icon: WifiOff },
  { id: 'Falla',             label: 'Falla',             bg: '#fee2e2', fg: '#991b1b', icon: AlertTriangle },
  { id: 'Falta de datos',    label: 'Falta de datos',    bg: '#dbeafe', fg: '#1e40af', icon: FileQuestion },
];

function isoWeekOf(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

function weekStartDate(year, week) {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay();
  const start = new Date(simple);
  if (dow <= 4) start.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 1);
  else start.setUTCDate(simple.getUTCDate() + 8 - simple.getUTCDay());
  return start;
}

export default function RevisionSemanal() {
  const navigate = useNavigate();
  const toast = useToast();
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin', 'operator', 'mantenimiento', 'tecnico');

  const today = new Date();
  const currentISO = isoWeekOf(today);
  const [year, setYear] = useState(currentISO.year);
  const [week, setWeek] = useState(currentISO.week);
  const [data, setData] = useState({ plantas: [], total: 0, revisadas: 0, pendientes: 0 });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [editing, setEditing] = useState(null);   // planta seleccionada
  const [form, setForm] = useState({ estado: 'OK', observaciones: '', generarIncidencia: false });

  // Selección múltiple + bulk save
  const [selected, setSelected] = useState(new Set());
  const [bulkEstado, setBulkEstado] = useState('OK');
  const [savingBulk, setSavingBulk] = useState(false);

  // Heatmap
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [heatmap, setHeatmap] = useState(null);
  const [heatLoading, setHeatLoading] = useState(false);

  const openReporteHTML = async () => {
    try {
      const res = await api.get('/revisiones-semanales/reporte', {
        params: { year, week }, responseType: 'text',
      });
      const blob = new Blob([res.data], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      toast(e?.response?.data?.message || 'Error generando reporte', 'error');
    }
  };

  const loadHeatmap = () => {
    setHeatLoading(true);
    revsemApi.heatmap(8)
      .then(setHeatmap)
      .catch(() => toast('Error al cargar heatmap', 'error'))
      .finally(() => setHeatLoading(false));
  };
  useEffect(() => { if (showHeatmap && !heatmap) loadHeatmap(); /* eslint-disable-next-line */ }, [showHeatmap]);

  const load = () => {
    setLoading(true);
    revsemApi.plantas({ year, week })
      .then(setData)
      .catch(() => toast('Error al cargar', 'error'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); setSelected(new Set()); /* eslint-disable-next-line */ }, [year, week]);

  const navWeek = (delta) => {
    let w = week + delta;
    let y = year;
    if (w < 1) { y--; w = 52; }
    if (w > 53) { y++; w = 1; }
    setWeek(w); setYear(y);
  };
  const goCurrent = () => { setYear(currentISO.year); setWeek(currentISO.week); };

  const onEdit = (p) => {
    setForm({
      estado: p.estado || 'OK',
      observaciones: p.observaciones || '',
      generarIncidencia: false,
    });
    setEditing(p);
  };

  const toggleSel = (polizaId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(polizaId)) next.delete(polizaId);
      else next.add(polizaId);
      return next;
    });
  };
  const toggleAllVisible = () => {
    const visibles = filtered.map((p) => p.polizaId);
    if (visibles.every((id) => selected.has(id))) {
      // si todas las visibles están marcadas, desmarcar
      setSelected((prev) => {
        const next = new Set(prev);
        visibles.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelected((prev) => new Set([...prev, ...visibles]));
    }
  };

  const onBulkSave = async () => {
    if (selected.size === 0) return toast('Selecciona al menos una planta', 'error');
    const noOk = bulkEstado !== 'OK';
    let generar = false;
    if (noOk) {
      generar = confirm(
        `Vas a marcar ${selected.size} planta(s) con estado "${bulkEstado}".\n\n` +
        `¿Generar automáticamente una incidencia para cada una?`
      );
    } else {
      if (!confirm(`Vas a marcar ${selected.size} planta(s) como "OK" para la semana ${week} de ${year}.\n\n¿Continuar?`)) return;
    }
    setSavingBulk(true);
    try {
      const r = await revsemApi.bulk({
        year, week, estado: bulkEstado,
        polizaIds: Array.from(selected),
        generarIncidencias: generar,
      });
      const inc = r.incidenciasGeneradas?.length || 0;
      toast(`✓ ${r.total} revisión(es) guardada(s)${inc > 0 ? ` · ${inc} incidencia(s) creada(s)` : ''}`);
      setSelected(new Set());
      load();
      if (heatmap) loadHeatmap();
    } catch (e) {
      toast(e?.response?.data?.message || 'Error al guardar', 'error');
    } finally {
      setSavingBulk(false);
    }
  };

  const onSave = async () => {
    if (!editing) return;
    const noOk = form.estado !== 'OK';
    let generar = form.generarIncidencia;
    // Si no es OK y no ha confirmado, preguntar
    if (noOk && !generar && !editing.incidenciaId) {
      generar = confirm(
        `El estado seleccionado es "${form.estado}".\n\n¿Deseas generar automáticamente una incidencia para dar seguimiento?`
      );
    }
    try {
      const r = await revsemApi.upsert({
        project: editing.project,
        code: editing.code,
        polizaId: editing.polizaId,
        year, week,
        estado: form.estado,
        observaciones: form.observaciones,
        generarIncidencia: generar,
      });
      if (r.incidenciaCreated) {
        toast(`✓ Revisión guardada · Incidencia #${r.incidenciaCreated} generada`);
      } else {
        toast('Revisión guardada');
      }
      setEditing(null);
      load();
    } catch (e) {
      toast(e?.response?.data?.message || 'Error al guardar', 'error');
    }
  };

  const filtered = useMemo(() => {
    let arr = data.plantas || [];
    if (q.trim()) {
      const f = q.toLowerCase();
      arr = arr.filter((p) =>
        (p.project || '').toLowerCase().includes(f) ||
        (p.code || '').toLowerCase().includes(f) ||
        (p.grupo || '').toLowerCase().includes(f));
    }
    if (filterEstado) {
      arr = arr.filter((p) => (filterEstado === '__pendiente'
        ? !p.estado
        : p.estado === filterEstado));
    }
    return arr;
  }, [data.plantas, q, filterEstado]);

  const wkStart = weekStartDate(year, week);

  const columns = useMemo(() => [
    canEdit && {
      key: '_sel', label: (
        <input type="checkbox"
          checked={filtered.length > 0 && filtered.every((p) => selected.has(p.polizaId))}
          ref={(el) => {
            if (el) {
              const some = filtered.some((p) => selected.has(p.polizaId));
              const all = filtered.length > 0 && filtered.every((p) => selected.has(p.polizaId));
              el.indeterminate = some && !all;
            }
          }}
          onChange={toggleAllVisible}
          title="Seleccionar todas las visibles"
        />
      ), sortable: false,
      render: (r) => (
        <input type="checkbox"
          checked={selected.has(r.polizaId)}
          onChange={() => toggleSel(r.polizaId)}
        />
      ),
    },
    { key: 'project', label: 'Proyecto' },
    {
      key: 'code', label: 'Código',
      render: (r) => r.code
        ? <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 600 }}>{r.code}</span>
        : '—',
    },
    { key: 'grupo', label: 'Cliente' },
    { key: 'platform', label: 'Plataforma' },
    {
      key: 'estado', label: 'Estado',
      render: (r) => {
        if (!r.estado) {
          return <span style={{
            background: '#f3f4f6', color: '#6b7280',
            padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
          }}>Pendiente</span>;
        }
        const s = ESTADOS.find((e) => e.id === r.estado) || ESTADOS[0];
        const Icon = s.icon;
        return (
          <span style={{
            background: s.bg, color: s.fg,
            padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <Icon size={11} /> {s.label}
          </span>
        );
      },
    },
    {
      key: 'incidenciaId', label: 'Incidencia',
      render: (r) => r.incidenciaId
        ? <a href={`/incidencias`} onClick={(e) => { e.preventDefault(); navigate('/incidencias'); }}
            style={{ color: 'var(--sky)', fontWeight: 700, fontSize: 11 }}>
            #{r.incidenciaId}
          </a>
        : <span style={{ color: 'var(--gray-400)' }}>—</span>,
    },
    {
      key: 'revisadoPor', label: 'Revisado por',
      render: (r) => r.revisadoPor
        ? <span style={{ fontSize: 11 }}>👤 {r.revisadoPor}</span>
        : '—',
    },
    { key: 'fechaRevision', label: 'Fecha', render: (r) => fmtDate(r.fechaRevision) },
    {
      key: '_actions', label: '', sortable: false,
      render: (r) => canEdit ? (
        <button className="btn btn-sm" onClick={() => onEdit(r)}>
          {r.estado ? 'Actualizar' : 'Revisar'}
        </button>
      ) : null,
    },
  ].filter(Boolean), [canEdit, selected, filtered]);

  const pctComplete = data.total ? Math.round((data.revisadas / data.total) * 100) : 0;

  return (
    <div>
      <div className="section-header">
        <h2>Revisión semanal SFV</h2>
        <span style={{ color: 'var(--gray-400)', fontSize: 12 }}>
          {data.total} plantas PV vigentes
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="btn btn-sm" onClick={() => navWeek(-1)}><ChevronLeft size={14} /></button>
          <div style={{ minWidth: 200, textAlign: 'center', fontSize: 13, fontWeight: 600 }}>
            Semana {week} · {year}
            <div style={{ fontSize: 10, color: 'var(--gray-500)', fontWeight: 400 }}>
              {fmtDate(wkStart)} – {fmtDate(new Date(wkStart.getTime() + 6 * 86400000))}
            </div>
          </div>
          <button className="btn btn-sm" onClick={() => navWeek(1)}><ChevronRight size={14} /></button>
          <button className="btn btn-sm" onClick={goCurrent}>
            <Calendar size={14} /> Esta semana
          </button>
          <button className="btn btn-sm"
            onClick={() => setShowHeatmap((v) => !v)}
            style={{
              background: showHeatmap ? '#0EA5E9' : '#dbeafe',
              color: showHeatmap ? '#fff' : '#1e40af',
              borderColor: showHeatmap ? '#0EA5E9' : '#bae6fd',
              fontWeight: 600,
            }}>
            <LayoutGrid size={14} /> {showHeatmap ? 'Ocultar heatmap' : 'Ver mini calendario'}
          </button>
          <button className="btn btn-sm btn-primary" onClick={openReporteHTML}
            title="Generar reporte HTML imprimible de esta semana">
            <FileText size={14} /> Reporte semanal
          </button>
          <button className="btn btn-sm" onClick={() => downloadXLSX(filtered, 'RevisionSemanal', `revision_${year}_W${week}.xlsx`)}>
            <Download size={14} /> Excel
          </button>
        </div>
      </div>

      <div style={{
        background: '#f0f9ff', border: '1px solid #bae6fd',
        borderRadius: 8, padding: '10px 14px', marginBottom: 12,
        display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, fontSize: 12, color: 'var(--gray-700)', minWidth: 240 }}>
          Checklist semanal de plantas PV en garantía vigente.
          Selecciona el estado de cada planta. Si marcas algo distinto de "OK", se ofrecerá generar una incidencia.
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn btn-sm"
            onClick={() => setShowHeatmap((v) => !v)}
            style={{
              background: showHeatmap ? '#0EA5E9' : 'white',
              color: showHeatmap ? '#fff' : '#0EA5E9',
              borderColor: '#0EA5E9', fontWeight: 600,
            }}>
            <LayoutGrid size={14} /> {showHeatmap ? 'Ocultar' : 'Mostrar'} mini calendario
          </button>
          <button className="btn btn-sm btn-primary" onClick={openReporteHTML}>
            <FileText size={14} /> Generar reporte semanal
          </button>
        </div>
      </div>

      {/* Mini KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
        <Kpi label="Total plantas" value={data.total} color="#1E3A5F" />
        <Kpi label="Revisadas" value={data.revisadas} color="#0EA5E9" />
        <Kpi label="Pendientes" value={data.pendientes} color="#F59E0B" />
        <Kpi label="Cumplimiento" value={`${pctComplete}%`}
          color={pctComplete === 100 ? '#16A34A' : pctComplete >= 50 ? '#F59E0B' : '#DC2626'} />
      </div>

      {/* Barra de progreso */}
      {data.total > 0 && (
        <div style={{ height: 8, background: 'var(--gray-200)', borderRadius: 4, overflow: 'hidden', marginBottom: 14 }}>
          <div style={{
            height: '100%', width: `${pctComplete}%`,
            background: pctComplete === 100 ? '#16A34A' : pctComplete >= 50 ? '#F59E0B' : '#DC2626',
            transition: 'width .3s',
          }} />
        </div>
      )}

      <div className="filters-bar">
        <input className="filter-input search-input"
          placeholder="Buscar proyecto, código, cliente..."
          value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="filter-select" value={filterEstado}
          onChange={(e) => setFilterEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="__pendiente">⚪ Pendientes de revisar</option>
          {ESTADOS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      {/* Heatmap colapsable */}
      {showHeatmap && (
        <Heatmap data={heatmap} loading={heatLoading} onClickCell={(planta, w) => {
          setYear(w.year); setWeek(w.week);
          setShowHeatmap(false);
        }} />
      )}

      {/* Barra de guardado masivo cuando hay selección */}
      {canEdit && selected.size > 0 && (
        <div style={{
          background: '#0EA5E9', color: 'white', padding: '12px 16px',
          borderRadius: 10, marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            ✓ {selected.size} planta{selected.size !== 1 ? 's' : ''} seleccionada{selected.size !== 1 ? 's' : ''}
          </div>
          <span style={{ opacity: 0.85, fontSize: 12 }}>Marcar como:</span>
          <select value={bulkEstado} onChange={(e) => setBulkEstado(e.target.value)}
            style={{
              padding: '4px 8px', borderRadius: 6, border: 0,
              fontSize: 12, fontWeight: 600,
            }}>
            {ESTADOS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button className="btn btn-sm"
            onClick={onBulkSave}
            disabled={savingBulk}
            style={{
              background: 'white', color: '#0EA5E9', fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
            <Save size={14} /> {savingBulk ? 'Guardando...' : `Guardar semana (${selected.size})`}
          </button>
          <button className="btn btn-sm"
            onClick={() => setSelected(new Set())}
            style={{ background: 'transparent', color: 'white', borderColor: 'rgba(255,255,255,.3)' }}>
            Cancelar selección
          </button>
        </div>
      )}

      {loading ? (
        <div className="empty"><span className="spinner" /></div>
      ) : data.total === 0 ? (
        <div className="empty">
          No hay plantas PV vigentes registradas todavía.<br />
          <small>Agrega pólizas tipo PV / FV en la sección de Pólizas.</small>
        </div>
      ) : (
        <DataTable columns={columns} data={filtered} defaultPageSize={50} />
      )}

      {/* Modal de revisión */}
      <Modal
        open={!!editing} onClose={() => setEditing(null)}
        title={editing ? `Revisión — ${editing.project}` : ''}
        wide
        footer={
          <>
            <button className="btn" onClick={() => setEditing(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={onSave}>Guardar revisión</button>
          </>
        }
      >
        {editing && (
          <div>
            <div style={{
              background: 'var(--gray-50)', padding: 12, borderRadius: 8, marginBottom: 14, fontSize: 12,
              color: 'var(--gray-700)', lineHeight: 1.6,
            }}>
              <div><strong>Proyecto:</strong> {editing.project}</div>
              <div><strong>Código:</strong> {editing.code || '—'} · <strong>Plataforma:</strong> {editing.platform || '—'}</div>
              <div><strong>Cliente:</strong> {editing.grupo || '—'} · <strong>Zona:</strong> {editing.zona || '—'}</div>
              <div><strong>Semana:</strong> {week} de {year} · <strong>Póliza fin:</strong> {fmtDate(editing.polEnd)}</div>
            </div>

            {/* Botones grandes para elegir estado */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--gray-700)' }}>
                Estado de la planta esta semana *
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
                {ESTADOS.map((s) => {
                  const Icon = s.icon;
                  const selected = form.estado === s.id;
                  return (
                    <button key={s.id}
                      type="button"
                      onClick={() => setForm({ ...form, estado: s.id })}
                      style={{
                        padding: 12, borderRadius: 10, cursor: 'pointer',
                        border: `2px solid ${selected ? s.fg : 'var(--gray-200)'}`,
                        background: selected ? s.bg : 'var(--card-bg, white)',
                        color: selected ? s.fg : 'var(--gray-700)',
                        display: 'flex', alignItems: 'center', gap: 8,
                        fontSize: 13, fontWeight: selected ? 700 : 500,
                        transition: 'all .15s',
                      }}>
                      <Icon size={18} />
                      <span>{s.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="form-row full" style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-700)' }}>
                Observaciones
              </label>
              <textarea
                rows="3"
                value={form.observaciones}
                onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
                placeholder="Detalles de la revisión, hallazgos, próximos pasos..."
                style={{ width: '100%' }}
              />
            </div>

            {/* Aviso si no es OK y no hay incidencia */}
            {form.estado !== 'OK' && !editing.incidenciaId && (
              <div style={{
                background: '#fef3c7', border: '1px solid #fde68a',
                borderLeft: '4px solid #f59e0b', padding: 10, borderRadius: 6,
                fontSize: 12, color: '#92400e',
              }}>
                ⚠️ El estado seleccionado es <strong>"{form.estado}"</strong>.
                Al guardar te preguntaremos si deseas generar una incidencia para dar seguimiento.
              </div>
            )}
            {editing.incidenciaId && (
              <div style={{
                background: '#dcfce7', border: '1px solid #86efac',
                borderLeft: '4px solid #16a34a', padding: 10, borderRadius: 6,
                fontSize: 12, color: '#065f46',
              }}>
                ✓ Ya existe una incidencia asociada: <strong>#{editing.incidenciaId}</strong>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

// ── Mini calendario heatmap ──
const HEAT_COLORS = {
  'OK':                '#16a34a',
  'Sin comunicación':  '#f59e0b',
  'Falla':             '#dc2626',
  'Falta de datos':    '#3b82f6',
};

function Heatmap({ data, loading, onClickCell }) {
  if (loading) {
    return <div className="empty" style={{ marginBottom: 14 }}><span className="spinner" /></div>;
  }
  if (!data || !data.plantas?.length) {
    return (
      <div style={{
        background: 'var(--gray-50, #f9fafb)', padding: 24, borderRadius: 10,
        textAlign: 'center', color: 'var(--gray-400)', marginBottom: 14,
      }}>
        Sin datos para el heatmap.
      </div>
    );
  }

  return (
    <div style={{
      background: 'var(--card-bg, white)', border: '1px solid var(--gray-200)',
      borderRadius: 10, padding: 16, marginBottom: 14, overflowX: 'auto',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <strong style={{ fontSize: 14 }}>📅 Heatmap — últimas {data.weeks?.length} semanas</strong>
        <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
          {Object.entries(HEAT_COLORS).map(([k, c]) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 12, height: 12, background: c, borderRadius: 3, display: 'inline-block' }} />
              {k}
            </span>
          ))}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 12, height: 12, background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 3, display: 'inline-block' }} />
            Sin revisar
          </span>
        </div>
      </div>

      <table style={{ borderCollapse: 'separate', borderSpacing: 2, fontSize: 11 }}>
        <thead>
          <tr>
            <th style={{ position: 'sticky', left: 0, background: 'var(--card-bg)', padding: 4, textAlign: 'left', minWidth: 160 }}>
              Planta
            </th>
            {data.weeks?.map((w) => (
              <th key={`${w.year}-${w.week}`} style={{ padding: 2, fontWeight: 600, color: 'var(--gray-500)', minWidth: 36 }}>
                <div style={{ fontSize: 9 }}>W{String(w.week).padStart(2, '0')}</div>
                <div style={{ fontSize: 9, color: 'var(--gray-400)' }}>{w.year}</div>
              </th>
            ))}
            <th style={{ padding: 4, fontWeight: 600, color: 'var(--gray-500)', textAlign: 'center' }}>OK</th>
            <th style={{ padding: 4, fontWeight: 600, color: 'var(--gray-500)', textAlign: 'center' }}>⚠</th>
          </tr>
        </thead>
        <tbody>
          {data.plantas.slice(0, 60).map((p) => (
            <tr key={p.polizaId}>
              <td style={{
                padding: '3px 6px',
                background: 'var(--card-bg)',
                position: 'sticky', left: 0,
                fontWeight: 500, fontSize: 11,
                whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis',
              }} title={`${p.project} · ${p.code || ''}`}>
                {p.project}
              </td>
              {p.celdas.map((c, i) => {
                const color = c.estado ? HEAT_COLORS[c.estado] : null;
                return (
                  <td key={i} style={{ padding: 0, textAlign: 'center' }}>
                    <div
                      title={`${p.project} — W${c.week} ${c.year}: ${c.estado || 'sin revisar'}`}
                      onClick={() => onClickCell && onClickCell(p, c)}
                      style={{
                        width: 24, height: 22, borderRadius: 3, cursor: 'pointer',
                        background: color || '#f3f4f6',
                        border: color ? `1px solid ${color}` : '1px solid #d1d5db',
                        margin: 'auto', position: 'relative',
                      }}>
                      {c.incidenciaId && (
                        <span style={{
                          position: 'absolute', top: -3, right: -3,
                          width: 8, height: 8, background: '#dc2626',
                          borderRadius: '50%', border: '1px solid white',
                        }} title={`Incidencia #${c.incidenciaId}`} />
                      )}
                    </div>
                  </td>
                );
              })}
              <td style={{ padding: '2px 6px', textAlign: 'center', color: '#16a34a', fontWeight: 700 }}>
                {p.okCount}
              </td>
              <td style={{ padding: '2px 6px', textAlign: 'center', color: '#dc2626', fontWeight: 700 }}>
                {p.badCount > 0 ? p.badCount : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {data.plantas.length > 60 && (
        <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 8, textAlign: 'center' }}>
          Mostrando 60 de {data.plantas.length} plantas. Filtra con el buscador para acotar.
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 8 }}>
        💡 Click en una celda para ir a esa semana. El punto rojo indica que hay incidencia generada.
      </div>
    </div>
  );
}

function Kpi({ label, value, color }) {
  return (
    <div style={{
      background: 'var(--card-bg, white)', border: '1px solid var(--gray-200)',
      borderRadius: 8, padding: '10px 14px',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, marginTop: 4 }}>{value}</div>
    </div>
  );
}
