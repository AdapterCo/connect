import api from './api';
export async function enableWebPush(owner: string) {
  if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Push exige HTTPS e navegador compatível.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Permita notificações neste navegador.');
  const response = await api.get<{ publicKey: string }>('/push/key');
  const registration = await navigator.serviceWorker.register('/push-worker.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  let existing = await registration.pushManager.getSubscription();
  if (existing && localStorage.getItem('crm_push_owner') !== owner) { await existing.unsubscribe(); existing = null; }
  const key = response.data.publicKey;
  const bytes = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - key.length % 4) % 4)), char => char.charCodeAt(0));
  const subscription = existing || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
  await api.post('/push/subscriptions', subscription.toJSON());
  localStorage.setItem('crm_push_owner', owner);
}
export async function disableWebPush() {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  const endpoint = subscription?.endpoint;
  await subscription?.unsubscribe();
  localStorage.removeItem('crm_push_owner');
  if (endpoint) await api.delete('/push/subscriptions', { data: { endpoint } });
}
