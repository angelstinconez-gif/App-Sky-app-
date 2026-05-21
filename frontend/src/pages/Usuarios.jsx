import { useEffect, useMemo, useState } from 'react';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { usersApi } from '../api/endpoints';
import { fmtDateTime, downloadXLSX } from '../utils/format';

const ROLES = ['admin', 'operator', 'mantenimiento'];

const empty = { name: '', email: '', role: 'operator', initials: '', active: true, password: '', passwordConfirm: '' };

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
    if (!confirm('¿Eliminar este usuario?')) return;
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
    { key: 'role', label: 'Rol' },
    { key: 'active', label: 'Activo', render: (r) => (r.active ? '✓' : '—') },
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

  return (
    <div>
      <div className="section-header">
        <h2>Usuarios</h2>
        <span style={{ color: 'var(--gray-400)', fontSize: 12 }}>{items.length} registros</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
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
        </div>
      </Modal>
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
