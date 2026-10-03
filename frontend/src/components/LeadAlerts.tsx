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
  return <div><button disabled={busy} onClick={enable} className="text-xs text-indigo-300 px-4 py-2">{enabled ? 'Desativar alertas' : 'Ativar som e notificações'}</button>{feedback && <p role="status" className="text-xs text-amber-300 px-4 pb-2">{feedback}</p>}</div>;
}
