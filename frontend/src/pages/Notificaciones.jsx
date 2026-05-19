import { useEffect, useState } from 'react';
import { notificationsApi } from '../api/endpoints';
import { isPushSupported, subscribeToPush, unsubscribeFromPush } from '../utils/push';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';

export default function Notificaciones() {
  const { user } = useAuth();
  const toast = useToast();
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
  const waSub = subs.find((s) => s.channel === 'whatsapp');

  const enablePush = async () => {
    try {
      await subscribeToPush();
      toast('✅ Notificaciones push activadas');
      load();
    } catch (e) {
      toast(e.message || 'Error al activar push', 'error');
    }
  };

  const disablePush = async () => {
    try {
      await unsubscribeFromPush();
      if (pushSub) await notificationsApi.unsubscribe(pushSub.id);
      toast('Push desactivado');
      load();
    } catch (e) {
      toast(e.message || 'Error', 'error');
    }
  };

  const saveWhatsapp = async () => {
    if (!phone.trim()) return toast('Ingresa un número', 'error');
    try {
      await notificationsApi.subscribeWhatsapp(phone.trim());
      toast('✅ WhatsApp registrado');
      setPhone('');
      load();
    } catch (e) {
      toast(e.response?.data?.message || 'Error', 'error');
    }
  };

  const removeWhatsapp = async () => {
    if (waSub) {
      await notificationsApi.unsubscribe(waSub.id);
      toast('WhatsApp desactivado');
      load();
    }
  };

  const testNotif = async () => {
    try {
      const r = await notificationsApi.test();
      toast(`Enviadas: ${r.sent}`);
    } catch (e) {
      toast('Error en prueba', 'error');
    }
  };

  if (loading) return <div className="empty"><span className="spinner" /></div>;

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="section-header">
        <h2>Notificaciones</h2>
      </div>
      <p style={{ color: 'var(--gray-500)', marginBottom: 20, fontSize: 13 }}>
        Configura cómo quieres recibir alertas de mantenimientos programados, vencimientos de pólizas e incidencias críticas en tu celular.
      </p>

      {/* WEB PUSH */}
      <div className="chart-card" style={{ marginBottom: 16 }}>
        <h3>📱 Notificaciones del navegador (PWA)</h3>
        <p style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 12 }}>
          Funciona en Android (Chrome) y iOS 16.4+ instalando la app a la pantalla de inicio. Recibirás notificaciones aunque la app esté cerrada.
        </p>
        {!pushSupported && (
          <div style={{ background: 'var(--amber-light)', padding: 10, borderRadius: 8, fontSize: 12 }}>
            ⚠️ Este navegador no soporta Web Push. Usa Chrome (Android) o Safari (iOS 16.4+) desde el celular.
          </div>
        )}
        {pushSupported && pushSub && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="badge s-vigente">✓ Activado</span>
            <button className="btn btn-sm btn-danger" onClick={disablePush}>Desactivar</button>
            <button className="btn btn-sm" onClick={testNotif}>🔔 Enviar prueba</button>
          </div>
        )}
        {pushSupported && !pushSub && (
          <button className="btn btn-primary" onClick={enablePush}>
            Activar notificaciones push
          </button>
        )}
      </div>

      {/* WHATSAPP */}
      <div className="chart-card" style={{ marginBottom: 16 }}>
        <h3>💬 WhatsApp</h3>
        <p style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 12 }}>
          Recibe avisos por WhatsApp. Requiere que el admin haya configurado Twilio en el servidor.
        </p>
        {waSub ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="badge s-vigente">✓ {waSub.phone}</span>
            <button className="btn btn-sm btn-danger" onClick={removeWhatsapp}>Eliminar</button>
            <button className="btn btn-sm" onClick={testNotif}>🔔 Enviar prueba</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              className="filter-input"
              placeholder="+52 999 105 5811"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={{ minWidth: 220 }}
            />
            <button className="btn btn-primary" onClick={saveWhatsapp}>Registrar número</button>
          </div>
        )}
      </div>

      {/* INSTALAR PWA */}
      <div className="chart-card">
        <h3>📥 Instalar app en tu celular</h3>
        <p style={{ fontSize: 12, color: 'var(--gray-500)', lineHeight: 1.6 }}>
          <strong>Android:</strong> abre esta página en Chrome → menú (⋮) → "Instalar aplicación" o "Añadir a pantalla principal".
          <br />
          <strong>iPhone:</strong> abre esta página en Safari → botón compartir (□↑) → "Añadir a pantalla de inicio".
          <br /><br />
          Una vez instalada, te aparece como una app nativa más, y recibe notificaciones aunque no la tengas abierta.
        </p>
      </div>
    </div>
  );
}
