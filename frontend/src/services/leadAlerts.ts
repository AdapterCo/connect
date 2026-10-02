import { useAuthStore } from '../stores/authStore';
let audio: AudioContext | null = null;
export function notifyLead(title: string) {
  const user = useAuthStore.getState().user;
  if (!user || localStorage.getItem(`crm_alerts:${user.company_id}:${user.id}`) !== 'true') return;
  if (audio?.state === 'running') {
    const oscillator = audio.createOscillator(); const gain = audio.createGain();
    oscillator.frequency.value = 660; gain.gain.value = 0.08;
    oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + 0.15);
  }
  if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification(title, { body: 'Abra o Adapter Connect para atender.', tag: 'crm-lead' });
}
export async function enableLeadAudio() {
  audio ||= new AudioContext();
  await audio.resume();
}
