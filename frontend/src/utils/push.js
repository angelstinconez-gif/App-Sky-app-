// Helpers para Web Push: registra el service worker, pide permiso y suscribe.

import { notificationsApi } from '../api/endpoints';

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function isPushSupported() {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) throw new Error('Service Worker no soportado');
  return navigator.serviceWorker.register('/sw.js');
}

export async function subscribeToPush() {
  if (!(await isPushSupported())) {
    throw new Error('Tu navegador no soporta notificaciones push');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Permiso denegado. Actívalo en ajustes del navegador.');
  }
  const reg = await registerServiceWorker();
  await navigator.serviceWorker.ready;

  const publicKey = await notificationsApi.vapidKey();
  if (!publicKey) {
    throw new Error('El servidor no tiene configurada la clave VAPID. Avisa al administrador.');
  }

  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  await notificationsApi.subscribePush(subscription.toJSON());
  return subscription;
}

export async function unsubscribeFromPush() {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (sub) await sub.unsubscribe();
}
