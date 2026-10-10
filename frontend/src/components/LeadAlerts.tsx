import { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { enableLeadAudio } from '../services/leadAlerts';
import { enableWebPush, disableWebPush } from '../services/webPush';
export default function LeadAlerts() {
  const user = useAuthStore(state => state.user);
  const [enabled, setEnabled] = useState(() => localStorage.getItem(`crm_alerts:${user?.company_id}:${user?.id}`) === 'true');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const enable = async () => {
    if (!user) return;
    const next = !enabled;
    setBusy(true); setFeedback('');
    try {
    if (next) {
      await enableLeadAudio();
      if (['admin', 'supervisor', 'seller'].includes(user.role)) {
        try { await enableWebPush(`${user.company_id}:${user.id}`); }
        catch (error) { setFeedback(`Som ativado. Push indisponível: ${error instanceof Error ? error.message : 'verifique o navegador.'}`); }
      }
      else if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
    }
    else if (['admin', 'supervisor', 'seller'].includes(user.role)) await disableWebPush();
    localStorage.setItem(`crm_alerts:${user.company_id}:${user.id}`, String(next)); setEnabled(next);
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Não foi possível ativar notificações.'); }
    finally { setBusy(false); }
  };
  return <div><button disabled={busy} onClick={enable} className="w-full border-t border-gray-700 px-5 py-3 text-left text-xs text-gray-400 hover:text-gray-100 disabled:opacity-50">{enabled ? 'Desativar alertas' : 'Ativar som e notificações'}</button>{feedback && <p role="status" className="px-5 pb-3 text-xs text-indigo-300">{feedback}</p>}</div>;
}
