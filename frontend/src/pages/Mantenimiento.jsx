import { useEffect, useMemo, useState } from 'react';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import ImportButton from '../components/ImportButton';
import { mantenimientoApi, polizasApi, assigneesApi, importarApi, cuadrillasApi, tecnicosApi } from '../api/endpoints';
import { useNavigate } from 'react-router-dom';
import { fmtDate, downloadXLSX } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';

const TIPOS = [
  'Mtto Preventivo 1/2 FV', 'Mtto Preventivo 2/2 FV',
  'Mtto Preventivo 1/3 FV', 'Mtto Preventivo 2/3 FV', 'Mtto Preventivo 3/3 FV',
  'Mtto Preventivo 1/4 FV', 'Mtto Preventivo 2/4 FV', 'Mtto Preventivo 3/4 FV', 'Mtto Preventivo 4/4 FV',
  'Mtto Eléctrico 1/2', 'Mtto Eléctrico 2/2',
  'Mtto Preventivo 1/2 BESS', 'Mtto Preventivo 2/2 BESS',
  'Mantenimiento Correctivo',
  'Visita Técnica',
  'Mtto Preventivo x visita',
  'Capacitación',
  'Movilidad',
  'Compra de materiales',
  'Entrega de vehículo',
];
const ESTADOS = ['Programado', 'En curso', 'Completado', 'Cancelado'];

// Helpers de días entre fechas
function daysBetween(d1, d2) {
  if (!d1 || !d2) return null;
  const a = new Date(d1), b = new Date(d2);
  if (isNaN(a) || isNaN(b)) return null;
  return Math.floor((b - a) / 86400000);
}
function daysFromToday(d) {
  if (!d) return null;
  const t = new Date(); t.setHours(0,0,0,0);
  const target = new Date(d);
  if (isNaN(target)) return null;
  return Math.floor((target - t) / 86400000);
}

const empty = {
  project: '', code: '', tipo: 'Mtto Preventivo 1/2 FV', estado: 'Programado',
  fechaProgramada: '', fechaFinProgramada: '',
  fechaInicioEjecucion: '', fechaFinEjecucion: '',
  fechaEjecutada: '',
  cuadrilla: '', cuadrillaId: '', tecnicosIds: [], responsable: '',
  duracionHoras: '', requiereViaticos: false, viaticoId: null,
  descripcion: '', resultados: '',
};

export default function Mantenimiento() {
  const { hasRole } = useAuth();
  const toast = useToast();
  const canWrite = hasRole('admin', 'mantenimiento');
  const canDelete = hasRole('admin');

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState('');
  const [tipo, setTipo] = useState('');

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);

  const [polizas, setPolizas] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [cuadrillas, setCuadrillas] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    mantenimientoApi.list({ q, estado, tipo })
      .then(setItems)
      .catch(() => toast('Error al cargar', 'error'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [q, estado, tipo]);
  useEffect(() => {
    polizasApi.list().then(setPolizas).catch(() => {});
    assigneesApi.list().then(setAssignees).catch(() => {});
    cuadrillasApi.list().then(setCuadrillas).catch(() => {});
    tecnicosApi.list().then(setTecnicos).catch(() => {});
  }, []);

  // Cuando se elige cuadrilla → pre-llena técnicos miembros
  const onCuadrillaChange = (cid) => {
    setForm((f) => {
      const c = cuadrillas.find((x) => String(x.id) === String(cid));
      const miembros = c?.miembrosIds || [];
      const combined = [...new Set([...(f.tecnicosIds || []), ...miembros])];
      return { ...f, cuadrillaId: cid, cuadrilla: c?.nombre || '', tecnicosIds: combined };
    });
  };

  const toggleTecnico = (id) => {
    const n = Number(id);
    setForm((f) => ({
      ...f,
      tecnicosIds: (f.tecnicosIds || []).includes(n)
        ? f.tecnicosIds.filter((x) => x !== n)
        : [...(f.tecnicosIds || []), n],
    }));
  };

  const onProjectChange = (value) => {
    setForm((f) => ({ ...f, project: value }));
    const p = polizas.find((x) => x.project?.toLowerCase() === value.toLowerCase() || x.code?.toLowerCase() === value.toLowerCase());
    if (p) {
      setForm((f) => ({
        ...f,
        project: p.project,
        code: p.code || f.code,
        cuadrilla: f.cuadrilla || p.cuadrilla || '',
      }));
    }
  };

  const onNew = () => { setForm({ ...empty, fechaProgramada: new Date().toISOString().slice(0, 10) }); setEditingId(null); setOpen(true); };
  const onEdit = (row) => { setForm({ ...empty, ...row }); setEditingId(row.id); setOpen(true); };
  const onSave = async () => {
    if (!form.project) return toast('El proyecto es obligatorio', 'error');
    try {
      const saved = editingId
        ? await mantenimientoApi.update(editingId, form)
        : await mantenimientoApi.create(form);
      const generoViatico = form.requiereViaticos && !form.viaticoId && saved?.viaticoId;
      if (generoViatico) {
        toast(`✓ Mantenimiento guardado · Viático #${saved.viaticoId} pendiente de completar`);
        setOpen(false); load();
        if (await window.skyConfirm(`Se creó el viático #${saved.viaticoId} en estado Solicitado.\n\n¿Ir a completarlo ahora (TAG, placa, monto)?`)) {
          navigate('/viaticos');
        }
      } else {
        toast(editingId ? 'Actualizado' : 'Creado — notificación enviada a suscriptores');
        setOpen(false); load();
      }
    } catch (e) {
      toast(e?.response?.data?.message || 'Error al guardar', 'error');
    }
  };
  const onDelete = async (id) => {
    if (!await window.skyConfirm('¿Eliminar este mantenimiento?')) return;
    await mantenimientoApi.remove(id);
    toast('Eliminado'); load();
  };

  const columns = useMemo(() => {
    const cols = [
      { key: 'project', label: 'Proyecto' },
      { key: 'code', label: 'Código' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'estado', label: 'Estado' },
      {
        key: 'fechaProgramada', label: '📅 Inicio prog.',
        render: (r) => fmtDate(r.fechaProgramada),
      },
      {
        key: 'fechaFinProgramada', label: '🏁 Fin prog.',
        render: (r) => fmtDate(r.fechaFinProgramada),
      },
      {
        key: '_durProg', label: 'Dur. prog.',
        render: (r) => {
          const d = daysBetween(r.fechaProgramada, r.fechaFinProgramada);
          if (d === null) return <span style={{ color: 'var(--gray-400)' }}>—</span>;
          return (
            <span style={{
              background: '#dbeafe', color: '#1e40af',
              padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700,
            }}>
              {d}d
            </span>
          );
        },
      },
      {
        key: 'fechaInicioEjecucion', label: '▶ Inicio ejec.',
        render: (r) => fmtDate(r.fechaInicioEjecucion),
      },
      {
        key: 'fechaFinEjecucion', label: '✓ Fin ejec.',
        render: (r) => fmtDate(r.fechaFinEjecucion || r.fechaEjecutada),
      },
      {
        key: '_diasEnSitio', label: '📍 Días en sitio',
        render: (r) => {
          const ini = r.fechaInicioEjecucion;
          const fin = r.fechaFinEjecucion || r.fechaEjecutada;
          if (!ini) {
            // No ha iniciado todavía: si tiene programación, mostrar countdown
            const dias = daysFromToday(r.fechaProgramada);
            if (dias === null) return <span style={{ color: 'var(--gray-400)' }}>—</span>;
            if (dias > 0) return (
              <span style={{
                background: '#f3f4f6', color: '#6b7280',
                padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700,
              }}>
                Inicia en {dias}d
              </span>
            );
            if (dias === 0) return (
              <span style={{
                background: '#fed7aa', color: '#9a3412',
                padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700,
              }}>
                📅 Inicia hoy
              </span>
            );
            return (
              <span style={{
                background: '#fee2e2', color: '#991b1b',
                padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700,
              }}>
                🔴 Atrasado {-dias}d
              </span>
            );
          }
          if (ini && fin) {
            const d = daysBetween(ini, fin);
            return (
              <span style={{
                background: '#dcfce7', color: '#166534',
                padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700,
              }}>
                ✓ {d}d en sitio
              </span>
            );
          }
          // En curso: días desde inicio hasta hoy
          const d = daysFromToday(ini);
          const lleva = d !== null ? Math.max(0, -d) : 0;
          return (
            <span style={{
              background: '#fef3c7', color: '#92400e',
              padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700,
            }}>
              ⏱ Lleva {lleva}d en sitio
            </span>
          );
        },
      },
      {
        key: '_tiempo', label: 'Estado tiempo',
        render: (r) => {
          // Si está ejecutado, días entre programado y ejecutado
          if (r.fechaEjecutada) {
            const dias = daysBetween(r.fechaProgramada, r.fechaEjecutada);
            if (dias === null) return '—';
            const tarde = dias > 0;
            return (
              <span style={{
                background: tarde ? '#fef3c7' : '#dcfce7',
                color: tarde ? '#92400e' : '#166534',
                padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700,
              }}>
                {dias === 0 ? '✓ A tiempo' :
                 dias > 0 ? `+${dias}d tarde` :
                 `${-dias}d antes`}
              </span>
            );
          }
          // No ejecutado: días faltantes / pasados desde lo programado
          if (r.estado === 'Cancelado') return <span style={{ color: 'var(--gray-400)' }}>Cancelado</span>;
          const dias = daysFromToday(r.fechaProgramada);
          if (dias === null) return '—';
          if (dias > 0) {
            const cerca = dias <= 7;
            return (
              <span style={{
                background: cerca ? '#fef3c7' : '#dbeafe',
                color: cerca ? '#92400e' : '#1e40af',
                padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700,
              }}>
                {cerca && '⏰ '}En {dias}d
              </span>
            );
          }
          if (dias === 0) return <span style={{ background:'#fed7aa', color:'#9a3412', padding:'3px 8px', borderRadius:10, fontSize:11, fontWeight:700 }}>📅 Hoy</span>;
          // dias < 0 → vencido
          return (
            <span style={{
              background: '#fee2e2', color: '#991b1b',
              padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700,
            }}>
              🔴 Vencido {-dias}d
            </span>
          );
        },
      },
      { key: 'cuadrilla', label: 'Cuadrilla' },
      {
        key: 'tecnicosData', label: 'Técnicos',
        render: (r) => {
          const ts = r.tecnicosData || [];
          if (!ts.length) return '—';
          return (
            <span style={{ fontSize: 11 }} title={ts.map((t) => t.nombre).join(', ')}>
              🧑‍🔧 {ts.length} {ts.slice(0, 2).map((t) => t.nombre.split(' ')[0]).join(', ')}
              {ts.length > 2 && ` +${ts.length - 2}`}
            </span>
          );
        },
      },
      { key: 'responsable', label: 'Responsable' },
    ];
    if (canWrite || canDelete) {
      cols.push({
        key: '_actions', label: 'Acciones', sortable: false,
        render: (r) => (
          <div style={{ display: 'flex', gap: 4 }}>
            {canWrite && <button className="btn btn-sm" onClick={() => onEdit(r)}>Editar</button>}
            {canDelete && <button className="btn btn-sm btn-danger" onClick={() => onDelete(r.id)}>×</button>}
          </div>
        ),
      });
    }
    return cols;
  }, [canWrite, canDelete]);

  return (
    <div>
      <div className="section-header">
        <h2>Mantenimiento</h2>
        <span style={{ color: 'var(--gray-400)', fontSize: 12 }}>{items.length} registros</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {hasRole('admin') && (
            <>
              <a className="btn btn-sm" href="/templates/mantenimiento_template.xlsx" download>📄 Plantilla</a>
              <ImportButton uploader={importarApi.mantenimiento} onDone={load} />
              <ImportButton uploader={importarApi.planeacion2026} onDone={load}
                label="📋 Importar Planeación 2026" />
            </>
          )}
          <button className="btn btn-sm" onClick={() => downloadXLSX(items, 'Mantenimiento', `mantenimiento_${Date.now()}.xlsx`)}>⬇ Exportar</button>
          {canWrite && <button className="btn btn-sm btn-primary" onClick={onNew}>+ Nuevo</button>}
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 12 }}>
        🔔 Al crear o cambiar estado se notifica por WhatsApp / Push a usuarios suscritos.
      </div>

      <div className="filters-bar">
        <input className="filter-input search-input" placeholder="Buscar..."
          value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="filter-select" value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {ESTADOS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="filter-select" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          {TIPOS.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>

      {loading ? <div className="empty"><span className="spinner" /></div> : <DataTable columns={columns} data={items} />}

      <Modal
        open={open} onClose={() => setOpen(false)}
        title={editingId ? `Editar mantenimiento #${editingId}` : 'Nuevo mantenimiento'}
        wide
        footer={
          <>
            <button className="btn" onClick={() => setOpen(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={onSave}>Guardar</button>
          </>
        }
      >
        <div className="form-grid">
          <FormRow label="Proyecto *" full>
            <input
              list="mant-projects"
              value={form.project}
              onChange={(e) => onProjectChange(e.target.value)}
              placeholder={polizas.length ? `Empieza a escribir (${polizas.length} proyectos)…` : 'Escribe libre'}
            />
            <datalist id="mant-projects">
              {polizas.map((p) => (
                <option key={p.id} value={p.project}>{p.code} — {p.grupo}</option>
              ))}
            </datalist>
            <div style={{ fontSize: 11, color: 'var(--sky-dark)', marginTop: 4 }}>
              💡 Auto-llena código y cuadrilla al seleccionar del listado.
            </div>
          </FormRow>

          <FormRow label="Código (auto)">
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </FormRow>
          <FormRow label="Tipo">
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              {TIPOS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </FormRow>
          <FormRow label="Estado">
            <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
              {ESTADOS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </FormRow>

          <FormRow label="⏱ Duración estimada (horas)">
            <input type="number" step="0.5" min="0" value={form.duracionHoras}
              onChange={(e) => setForm({ ...form, duracionHoras: e.target.value })}
              placeholder="Ej: 4" />
          </FormRow>

          <FormRow label="💵 ¿Requiere viáticos?">
            <select
              value={form.requiereViaticos ? 'si' : 'no'}
              onChange={(e) => setForm({ ...form, requiereViaticos: e.target.value === 'si' })}
            >
              <option value="no">No</option>
              <option value="si">Sí — se generará un viático automáticamente</option>
            </select>
            {form.requiereViaticos && !form.viaticoId && (
              <div style={{ fontSize: 11, color: '#92400e', background: '#fef3c7', padding: 6, borderRadius: 4, marginTop: 4 }}>
                ⚠️ Al guardar se creará un viático en estado <strong>Solicitado</strong>.
                Deberás completar TAG, placa, monto y comprobante en la sección Viáticos.
              </div>
            )}
            {form.viaticoId && (
              <div style={{ fontSize: 11, color: '#065f46', background: '#dcfce7', padding: 6, borderRadius: 4, marginTop: 4 }}>
                ✓ Viático asociado: <strong>#{form.viaticoId}</strong>{' '}
                <a href="/viaticos" target="_blank" rel="noreferrer">Ir a completar →</a>
              </div>
            )}
          </FormRow>

          <FormRow label="📅 Inicio programado">
            <input type="date" value={form.fechaProgramada?.slice(0, 10) || ''}
              onChange={(e) => setForm({ ...form, fechaProgramada: e.target.value })} />
          </FormRow>
          <FormRow label="🏁 Fin programado">
            <input type="date" value={form.fechaFinProgramada?.slice(0, 10) || ''}
              onChange={(e) => setForm({ ...form, fechaFinProgramada: e.target.value })} />
          </FormRow>

          {/* Indicador en vivo de duración programada */}
          {(form.fechaProgramada && form.fechaFinProgramada) && (
            <FormRow label="" full>
              {(() => {
                const d = daysBetween(form.fechaProgramada, form.fechaFinProgramada);
                if (d === null) return null;
                const cls = d < 0 ? '#dc2626' : '#1e40af';
                const bg = d < 0 ? '#fee2e2' : '#dbeafe';
                return (
                  <div style={{
                    background: bg, color: cls, padding: 8, borderRadius: 6,
                    fontSize: 12, fontWeight: 600,
                  }}>
                    {d < 0 ? '⚠️ Fecha fin antes que inicio — corrige las fechas' :
                     d === 0 ? '📅 Mantenimiento de 1 día (mismo día)' :
                     `📅 Duración programada: ${d}d (entre ${fmtDate(form.fechaProgramada)} y ${fmtDate(form.fechaFinProgramada)})`}
                  </div>
                );
              })()}
            </FormRow>
          )}
          <FormRow label="▶ Inicio de ejecución">
            <input type="date" value={form.fechaInicioEjecucion?.slice(0, 10) || ''}
              onChange={(e) => {
                const val = e.target.value;
                setForm((f) => ({
                  ...f,
                  fechaInicioEjecucion: val,
                  // Si arranca y aún no se ha terminado → estado "En curso"
                  estado: val && !f.fechaFinEjecucion ? 'En curso' : f.estado,
                }));
              }} />
          </FormRow>
          <FormRow label="✓ Fin de ejecución">
            <input type="date" value={form.fechaFinEjecucion?.slice(0, 10) || ''}
              onChange={(e) => {
                const val = e.target.value;
                setForm((f) => ({
                  ...f,
                  fechaFinEjecucion: val,
                  fechaEjecutada: val,                  // compat
                  estado: val ? 'Completado' : f.estado,
                }));
              }} />
          </FormRow>

          {/* Indicador en vivo de duración / días que lleva ejecutándose */}
          {(form.fechaInicioEjecucion || form.fechaFinEjecucion) && (
            <FormRow label="" full>
              {(() => {
                const ini = form.fechaInicioEjecucion;
                const fin = form.fechaFinEjecucion || form.fechaEjecutada;
                if (ini && fin) {
                  const d = daysBetween(ini, fin);
                  return (
                    <div style={{
                      background: '#dcfce7', color: '#166534', padding: 8, borderRadius: 6,
                      fontSize: 12, fontWeight: 600,
                    }}>
                      ✓ Duración total de ejecución: <strong>{d}d</strong>
                    </div>
                  );
                }
                if (ini && !fin) {
                  const d = daysFromToday(ini);
                  const llevando = d !== null ? -d : 0; // d negativo si inicio antes de hoy
                  return (
                    <div style={{
                      background: '#fef3c7', color: '#92400e', padding: 8, borderRadius: 6,
                      fontSize: 12, fontWeight: 600,
                    }}>
                      ⏱ En ejecución — lleva <strong>{Math.max(0, llevando)}d</strong>
                      {' '}desde {fmtDate(ini)}
                    </div>
                  );
                }
                return null;
              })()}
            </FormRow>
          )}

          <FormRow label="Cuadrilla">
            <div style={{ display: 'flex', gap: 4 }}>
              <select value={form.cuadrillaId || ''}
                onChange={(e) => onCuadrillaChange(e.target.value)}
                style={{ flex: 1 }}>
                <option value="">— Sin cuadrilla —</option>
                {cuadrillas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} {c.zona ? `(${c.zona})` : ''}
                    {c.miembrosIds?.length ? ` · ${c.miembrosIds.length} miembros` : ''}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-sm"
                title="Ir a editar cuadrillas en otra pestaña"
                onClick={() => window.open('/cuadrillas', '_blank')}>
                ✏️
              </button>
            </div>
          </FormRow>

          <FormRow label="Responsable (usuario)">
            <select value={form.responsable} onChange={(e) => setForm({ ...form, responsable: e.target.value })}>
              <option value="">—</option>
              {assignees.filter((a) => a.type === 'user').map((a) => (
                <option key={a.id} value={a.value}>{a.label}</option>
              ))}
            </select>
          </FormRow>

          <FormRow label={`Técnicos asignados (${(form.tecnicosIds || []).length})`} full>
            <div style={{
              maxHeight: 180, overflowY: 'auto',
              border: '1px solid var(--gray-200, #e5e7eb)', borderRadius: 8,
              padding: 8, background: 'var(--card-bg, #fff)',
            }}>
              {tecnicos.length === 0 ? (
                <div style={{ color: 'var(--gray-400)', fontSize: 12 }}>
                  No hay técnicos. <a href="/tecnicos" target="_blank">Crear técnico →</a>
                </div>
              ) : tecnicos.map((t) => (
                <label key={t.id} style={{
                  display: 'flex', gap: 8, alignItems: 'center', padding: '3px 4px',
                  fontSize: 12, cursor: 'pointer',
                }}>
                  <input type="checkbox"
                    checked={(form.tecnicosIds || []).includes(t.id)}
                    onChange={() => toggleTecnico(t.id)} />
                  <strong>{t.nombre}</strong>
                  <span style={{ color: 'var(--gray-500)', fontSize: 10 }}>
                    {t.rol || ''} {t.telefono ? `· ${t.telefono}` : ''} {t.zona ? `· ${t.zona}` : ''}
                  </span>
                </label>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 4 }}>
              💡 Al elegir cuadrilla se añaden automáticamente sus miembros.
            </div>
          </FormRow>

          <FormRow label="Descripción" full>
            <textarea rows="2" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
          </FormRow>
          <FormRow label="Resultados" full>
            <textarea rows="2" value={form.resultados} onChange={(e) => setForm({ ...form, resultados: e.target.value })} />
          </FormRow>
        </div>
      </Modal>
    </div>
  );
}

function FormRow({ label, full, children }) {
  return (
    <div className={`form-row ${full ? 'full' : ''}`}>
      <label>{label}</label>
      {children}
    </div>
  );
}
