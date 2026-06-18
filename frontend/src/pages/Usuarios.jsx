import { useEffect, useMemo, useState } from 'react';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { usersApi, notificationsApi } from '../api/endpoints';
import api from '../api/client';
import { fmtDateTime, downloadXLSX } from '../utils/format';
import { isPushSupported, subscribeToPush, unsubscribeFromPush } from '../utils/push';

const ROLES = ['admin', 'operator', 'mantenimiento', 'tecnico', 'viewer'];

const empty = { name: '', email: '', role: 'operator', initials: '', active: true, aiEnabled: false, password: '', passwordConfirm: '' };

export default function Usuarios() {
  const { hasRole } = useAuth();
  const toast = useToast();
  const canWrite = hasRole('admin');

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [showPwd, setShowPwd] = useState(false);

  const load = () => {
    setLoading(true);
    usersApi.list().then(setItems).catch(() => toast('Error al cargar', 'error')).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const onNew = () => { setForm({ ...empty }); setEditingId(null); setOpen(true); };
  const onEdit = (row) => {
    setForm({ ...empty, ...row, password: '', passwordConfirm: '' });
    setEditingId(row.id); setOpen(true);
  };
  const onDelete = async (id) => {
    if (!await window.skyConfirm('¿Eliminar este usuario?')) return;
    await usersApi.remove(id); toast('Eliminado'); load();
  };

  const validate = () => {
    if (!form.name) return 'El nombre es obligatorio';
    if (!form.email) return 'El email es obligatorio';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Email inválido';
    // Para usuario nuevo, contraseña obligatoria. Para edición, opcional.
    if (!editingId || form.password) {
      if ((form.password || '').length < 6) return 'La contraseña debe tener al menos 6 caracteres';
      if (form.password !== form.passwordConfirm) return 'Las contraseñas no coinciden';
    }
    return null;
  };

  const onSave = async () => {
    const err = validate();
    if (err) return toast(err, 'error');
    const payload = { ...form };
    delete payload.passwordConfirm;
    if (!payload.password) delete payload.password; // no sobrescribir si edición sin cambio
    try {
      if (editingId) await usersApi.update(editingId, payload);
      else await usersApi.create(payload);
      toast(editingId ? 'Actualizado' : 'Creado'); setOpen(false); load();
    } catch (e) {
      toast(e?.response?.data?.message || 'Error al guardar', 'error');
    }
  };

  // Indicador visual de coincidencia
  const pwdMatch = !!form.password && form.password === form.passwordConfirm;
  const pwdMismatch = !!form.password && !!form.passwordConfirm && form.password !== form.passwordConfirm;

  const columns = useMemo(() => [
    { key: 'name', label: 'Nombre' },
    { key: 'email', label: 'Email' },
    {
      key: 'role', label: 'Rol',
      render: (r) => canWrite ? (
        <select
          value={r.role || ''}
          onChange={async (e) => {
            const newRole = e.target.value;
            if (!await window.skyConfirm(`¿Cambiar el rol de ${r.name} a "${newRole}"?`)) return;
            try {
              // Sólo envía el rol — NO toca la contraseña
              await usersApi.update(r.id, { role: newRole });
              toast(`Rol cambiado a "${newRole}"`);
              load();
            } catch (err) {
              toast(err?.response?.data?.message || 'Error', 'error');
            }
          }}
          style={{
            padding: '4px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            border: '1px solid var(--gray-200, #e5e7eb)', background: 'var(--card-bg, #fff)',
          }}
        >
          {ROLES.map((rol) => <option key={rol} value={rol}>{rol}</option>)}
        </select>
      ) : (r.role || '—'),
    },
    {
      key: 'active', label: 'Activo',
      render: (r) => canWrite ? (
        <input type="checkbox" checked={r.active !== false}
          title="Activar/desactivar usuario"
          onChange={async (e) => {
            try {
              await usersApi.update(r.id, { active: e.target.checked });
              toast(e.target.checked ? '✓ Activado' : 'Desactivado');
              load();
            } catch (err) { toast('Error', 'error'); }
          }} />
      ) : (r.active ? '✓' : '—'),
    },
    {
      key: 'aiEnabled', label: '🤖 IA',
      render: (r) => {
        const isAdmin = (r.role || '').toLowerCase() === 'admin';
        if (isAdmin) {
          return <span title="Los administradores siempre tienen acceso al asistente IA"
            style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>✓ admin</span>;
        }
        return canWrite ? (
          <input type="checkbox" checked={!!r.aiEnabled}
            title="Permitir a este usuario usar el asistente IA (SkyBot)"
            onChange={async (e) => {
              try {
                await usersApi.update(r.id, { aiEnabled: e.target.checked });
                toast(e.target.checked ? '✓ IA habilitada' : 'IA deshabilitada');
                load();
              } catch (err) { toast('Error', 'error'); }
            }} />
        ) : (r.aiEnabled ? '✓' : '—');
      },
    },
    { key: 'last_login', label: 'Último ingreso', render: (r) => fmtDateTime(r.last_login) },
    {
      key: '_actions', label: 'Acciones', sortable: false,
      render: (r) => canWrite ? (
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn btn-sm" onClick={() => onEdit(r)}>Editar</button>
          <button className="btn btn-sm btn-danger" onClick={() => onDelete(r.id)}>×</button>
        </div>
      ) : null,
    },
  ], [canWrite]);

  const onFixBD = async () => {
    if (!await window.skyConfirm(
      'Va a eliminar el constraint legacy "uq_proj_year_week" de la base de datos. ' +
      'Esto es necesario para poder guardar revisiones diarias.\n\n¿Continuar?'
    )) return;
    try {
      const r = await api.post('/admin-fix/drop-uq-proj-year-week');
      const ok = r.data?.success;
      if (ok) {
        await window.skyAlert(
          '✓ Constraint eliminado correctamente.\n\n' +
          'Ya puedes guardar revisiones diarias sin error.'
        );
      } else {
        await window.skyAlert('⚠️ No se pudo eliminar el constraint o ya no existía.');
      }
    } catch (e) {
      await window.skyAlert('Error: ' + (e?.response?.data?.message || e.message));
    }
  };

  // ── Descargar respaldo JSON ──
  const onBackupDownload = async () => {
    try {
      // 1) Primero pedimos stats para mostrar cuántas filas
      const stats = await api.get('/backup/stats');
      const total = stats.data?.total || 0;
      if (!await window.skyConfirm(
        `Vas a descargar un respaldo JSON con TODAS las tablas.\n\n` +
        `Total de filas a respaldar: ${total}\n\n` +
        `El archivo se guardará en tu carpeta Descargas.\n¿Continuar?`
      )) return;
      // 2) Descargar el binario
      const r = await api.get('/backup/download', { responseType: 'blob' });
      const blob = new Blob([r.data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const fecha = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
      a.download = `skysense_backup_${fecha}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('✓ Respaldo descargado');
    } catch (e) {
      await window.skyAlert('Error al descargar: ' + (e?.response?.data?.message || e.message));
    }
  };

  // ── Restaurar desde archivo JSON ──
  const onBackupRestore = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const wipe = await window.skyConfirm(
        `¿Quieres que se VACÍEN las tablas antes de restaurar?\n\n` +
        `· SÍ (Confirmar) = sobrescribe TODO con el contenido del archivo\n` +
        `· NO (Cancelar) = fusiona (mantiene lo existente y añade/actualiza por ID)`
      );
      try {
        const fd = new FormData();
        fd.append('file', file);
        const r = await api.post(`/backup/restore?wipe=${wipe ? 1 : 0}`,
          fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        const lines = [];
        for (const [tbl, res] of Object.entries(r.data?.resultados || {})) {
          if (typeof res === 'object' && res.insertadas !== undefined) {
            lines.push(`${tbl}: +${res.insertadas} ↻${res.actualizadas}${res.erroneas ? ` ⚠${res.erroneas}` : ''}`);
          } else {
            lines.push(`${tbl}: ${res}`);
          }
        }
        await window.skyAlert(
          `✓ Restauración completa (wipe=${wipe ? 'SÍ' : 'NO'})\n\n${lines.join('\n')}`
        );
        load();
      } catch (e) {
        await window.skyAlert('Error al restaurar: ' + (e?.response?.data?.message || e.message));
      }
    };
    input.click();
  };

  return (
    <div>
      <div className="section-header">
        <h2>Usuarios</h2>
        <span style={{ color: 'var(--gray-400)', fontSize: 12 }}>{items.length} registros</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {canWrite && (
            <>
              <button
                className="btn btn-sm"
                onClick={onBackupDownload}
                title="Descarga un respaldo JSON completo de la BD"
                style={{ background: '#dcfce7', color: '#166534', borderColor: '#86efac', fontWeight: 600 }}
              >
                💾 Respaldar BD
              </button>
              <button
                className="btn btn-sm"
                onClick={onBackupRestore}
                title="Sube un archivo JSON de respaldo para restaurar la BD"
                style={{ background: '#dbeafe', color: '#1e40af', borderColor: '#93c5fd', fontWeight: 600 }}
              >
                📤 Restaurar BD
              </button>
              <button
                className="btn btn-sm"
                onClick={onFixBD}
                title="Elimina el constraint legacy que impedía guardar revisiones diarias"
                style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fde68a', fontWeight: 600 }}
              >
                🔧 Fix BD
              </button>
            </>
          )}
          <button className="btn btn-sm" onClick={() => downloadXLSX(items, 'Usuarios', `usuarios_${Date.now()}.xlsx`)}>⬇ Exportar</button>
          {canWrite && <button className="btn btn-sm btn-primary" onClick={onNew}>+ Nuevo</button>}
        </div>
      </div>

      {loading ? <div className="empty"><span className="spinner" /></div> : <DataTable columns={columns} data={items} />}

      <Modal
        open={open} onClose={() => setOpen(false)}
        title={editingId ? `Editar usuario #${editingId}` : 'Nuevo usuario'}
        wide
        footer={
          <>
            <button className="btn" onClick={() => setOpen(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={onSave}
              disabled={!!form.password && form.password !== form.passwordConfirm}>
              Guardar
            </button>
          </>
        }
      >
        <div className="form-grid">
          <Row label="Nombre *">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Row>
          <Row label="Email *">
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Row>
          <Row label="Rol">
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </Row>
          <Row label="Iniciales (2 letras)">
            <input value={form.initials || ''} maxLength={3}
              onChange={(e) => setForm({ ...form, initials: e.target.value.toUpperCase() })} />
          </Row>

          {/* DOBLE CONTRASEÑA */}
          <Row label={editingId ? 'Contraseña (vacío = sin cambio)' : 'Contraseña *'}>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                type={showPwd ? 'text' : 'password'}
                value={form.password || ''}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Mínimo 6 caracteres"
                style={{ flex: 1 }}
              />
              <button type="button" className="btn btn-sm" onClick={() => setShowPwd((v) => !v)}>
                {showPwd ? '🙈' : '👁'}
              </button>
            </div>
          </Row>
          <Row label={editingId ? 'Confirmar contraseña' : 'Confirmar contraseña *'}>
            <input
              type={showPwd ? 'text' : 'password'}
              value={form.passwordConfirm || ''}
              onChange={(e) => setForm({ ...form, passwordConfirm: e.target.value })}
              placeholder="Repite la contraseña"
              style={{
                borderColor: pwdMismatch ? '#e11d48' : pwdMatch ? '#16a34a' : undefined,
              }}
            />
            {pwdMismatch && <small style={{ color: '#e11d48' }}>❌ Las contraseñas no coinciden</small>}
            {pwdMatch && <small style={{ color: '#16a34a' }}>✓ Coinciden</small>}
          </Row>

          <Row label="Activo">
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={form.active !== false}
                onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              Cuenta activa
            </label>
          </Row>

          <Row label="🤖 Asistente IA">
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox"
                checked={(form.role || '').toLowerCase() === 'admin' || !!form.aiEnabled}
                disabled={(form.role || '').toLowerCase() === 'admin'}
                onChange={(e) => setForm({ ...form, aiEnabled: e.target.checked })} />
              {(form.role || '').toLowerCase() === 'admin'
                ? 'Habilitado automáticamente (rol admin)'
                : 'Permitir usar SkyBot'}
            </label>
            <small style={{ color: 'var(--gray-500)', fontSize: 11 }}>
              Por defecto solo los admin pueden usar el asistente IA. Marca para habilitar este usuario.
            </small>
          </Row>
        </div>
      </Modal>

      {/* ── Sección de Notificaciones (solo admin) ── */}
      {canWrite && <NotificacionesPanel toast={toast} />}
    </div>
  );
}

// ── Panel de configuración de notificaciones (push, WhatsApp, PWA) ──
function NotificacionesPanel({ toast }) {
  const [subs, setSubs] = useState([]);
  const [phone, setPhone] = useState('');
  const [pushSupported, setPushSupported] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = () =>
    notificationsApi.list().then(setSubs).catch(() => {}).finally(() => setLoading(false));

  useEffect(() => {
    isPushSupported().then(setPushSupported);
    load();
  }, []);

  const pushSub = subs.find((s) => s.channel === 'push');
  const waSub  = subs.find((s) => s.channel === 'whatsapp');

  const enablePush = async () => {
    try { await subscribeToPush(); toast('✓ Push activado'); load(); }
    catch (e) { toast(e.message || 'Error al activar push', 'error'); }
  };
  const disablePush = async () => {
    try {
      await unsubscribeFromPush();
      if (pushSub) await notificationsApi.unsubscribe(pushSub.id);
      toast('Push desactivado'); load();
    } catch (e) { toast(e.message || 'Error', 'error'); }
  };
  const saveWhatsapp = async () => {
    if (!phone.trim()) return toast('Ingresa un número', 'error');
    try {
      await notificationsApi.subscribeWhatsapp(phone.trim());
      toast('✓ WhatsApp registrado'); setPhone(''); load();
    } catch (e) { toast(e.response?.data?.message || 'Error', 'error'); }
  };
  const removeWhatsapp = async () => {
    if (waSub) { await notificationsApi.unsubscribe(waSub.id); toast('WhatsApp desactivado'); load(); }
  };
  const testNotif = async () => {
    try { const r = await notificationsApi.test(); toast(`Enviadas: ${r.sent}`); }
    catch { toast('Error en prueba', 'error'); }
  };

  return (
    <div style={{ marginTop: 30, paddingTop: 20, borderTop: '2px solid var(--gray-200)' }}>
      <div className="section-header" style={{ marginBottom: 6 }}>
        <h2 style={{ fontSize: 18 }}>🔔 Configuración de notificaciones</h2>
      </div>
      <p style={{ color: 'var(--gray-500)', marginBottom: 16, fontSize: 13 }}>
        Configura cómo recibir alertas de mantenimientos programados, vencimientos de pólizas e incidencias críticas.
      </p>

      {loading ? <div className="empty"><span className="spinner" /></div> : (
        <div style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
          {/* WEB PUSH */}
          <div style={{ background: 'var(--card-bg, #fff)', border: '1px solid var(--gray-200)', borderRadius: 10, padding: 14 }}>
            <h3 style={{ fontSize: 14, marginBottom: 6 }}>📱 Notificaciones del navegador (PWA)</h3>
            <p style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 10 }}>
              Funciona en Android (Chrome) y iOS 16.4+ instalando la app a la pantalla de inicio. Recibirás notificaciones aunque la app esté cerrada.
            </p>
            {!pushSupported && (
              <div style={{ background: '#fef3c7', padding: 8, borderRadius: 6, fontSize: 12, color: '#92400e' }}>
                ⚠️ Este navegador no soporta Web Push. Usa Chrome (Android) o Safari (iOS 16.4+) desde el celular.
              </div>
            )}
            {pushSupported && pushSub && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ background: '#dcfce7', color: '#166534', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>✓ Activado</span>
                <button className="btn btn-sm btn-danger" onClick={disablePush}>Desactivar</button>
                <button className="btn btn-sm" onClick={testNotif}>🔔 Enviar prueba</button>
              </div>
            )}
            {pushSupported && !pushSub && (
              <button className="btn btn-primary btn-sm" onClick={enablePush}>Activar notificaciones push</button>
            )}
          </div>

          {/* WHATSAPP */}
          <div style={{ background: 'var(--card-bg, #fff)', border: '1px solid var(--gray-200)', borderRadius: 10, padding: 14 }}>
            <h3 style={{ fontSize: 14, marginBottom: 6 }}>💬 WhatsApp</h3>
            <p style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 10 }}>
              Recibe avisos por WhatsApp. Requiere que Twilio esté configurado en el servidor.
            </p>
            {waSub ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ background: '#dcfce7', color: '#166534', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>✓ {waSub.phone}</span>
                <button className="btn btn-sm btn-danger" onClick={removeWhatsapp}>Eliminar</button>
                <button className="btn btn-sm" onClick={testNotif}>🔔 Enviar prueba</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input className="filter-input" placeholder="+52 999 105 5811" value={phone}
                  onChange={(e) => setPhone(e.target.value)} style={{ minWidth: 220 }} />
                <button className="btn btn-primary btn-sm" onClick={saveWhatsapp}>Registrar número</button>
              </div>
            )}
          </div>

          {/* INSTALAR PWA */}
          <div style={{ background: '#f8fafc', border: '1px dashed var(--gray-300)', borderRadius: 10, padding: 14 }}>
            <h3 style={{ fontSize: 14, marginBottom: 6 }}>📥 Instalar app en celular</h3>
            <p style={{ fontSize: 12, color: 'var(--gray-600)', lineHeight: 1.6, margin: 0 }}>
              <strong>Android:</strong> abre esta página en Chrome → menú (⋮) → "Instalar aplicación".<br />
              <strong>iPhone:</strong> abre esta página en Safari → botón compartir → "Añadir a pantalla de inicio".<br />
              Una vez instalada, te aparece como app nativa y recibe notificaciones aunque no la tengas abierta.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="form-row">
      <label>{label}</label>
      {children}
    </div>
  );
}
