import { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { enableLeadAudio } from '../services/leadAlerts';
export default function LeadAlerts() {
  const user = useAuthStore(state => state.user);
  const [enabled, setEnabled] = useState(false);
  const enable = async () => {
    if (!user) return;
    const next = !enabled;
    if (next) {
      await enableLeadAudio();
      if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
    }
    localStorage.setItem(`crm_alerts:${user.company_id}:${user.id}`, String(next)); setEnabled(next);
  };
  return <button onClick={enable} className="text-xs text-indigo-300 px-4 py-2">{enabled ? 'Desativar alertas' : 'Ativar som e notificacoes'}</button>;
}
