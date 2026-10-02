import { useState } from 'react';
import api, { apiErrorMessage } from '../services/api';
import { downloadFile } from '../services/download';
import { useAuthStore } from '../stores/authStore';
import { useAppStore } from '../stores/appStore';

export default function ChatTools({ chatId, text, onText }: { chatId: string; text: string; onText: (value: string) => void }) {
  const user = useAuthStore(state => state.user);
  const key = `crm_replies:${user?.company_id}:${user?.id}`;
  const [replies, setReplies] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } });
  const [time, setTime] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [schedules, setSchedules] = useState<{ id: string; status: string; scheduledTime: string; text: string; last_error?: string }[] | null>(null);
  const refreshSchedules = async () => { const response = await api.get('/chats/' + chatId + '/schedule'); setSchedules(response.data); };
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (err) { setError(apiErrorMessage(err, 'Nao foi possivel concluir.')); } finally { setBusy(false); }
  };
  const save = () => {
    if (!text.trim()) return;
    const next = [...new Set([...replies, text.trim()])].slice(-30);
    localStorage.setItem(key, JSON.stringify(next)); setReplies(next); setNotice('Resposta salva neste navegador.');
  };
  return <div className="flex flex-wrap gap-2 text-xs mb-2">
    <select aria-label="Respostas prontas" value="" onChange={event => onText(event.target.value)} className="bg-gray-700 p-2 rounded">
      <option value="">{text.startsWith("/") ? "Selecione uma resposta (/)" : "Respostas prontas"}</option>{replies.filter(reply => !text.startsWith("/") || reply.toLowerCase().includes(text.slice(1).toLowerCase())).map(reply => <option key={reply} value={reply}>{reply.slice(0, 70)}</option>)}
    </select>
    <button disabled={busy} onClick={save}>Salvar resposta</button>
    <button onClick={() => { localStorage.removeItem(key); setReplies([]); }}>Limpar respostas</button>
    <label>Agendar <input type="datetime-local" aria-label="Data do agendamento" value={time} onChange={event => setTime(event.target.value)} className="bg-gray-700 p-2 rounded" /></label>
    <button disabled={busy || !text.trim() || !time} onClick={() => run(async () => {
      await api.post(`/chats/${chatId}/schedule`, { text, scheduledTime: new Date(time).toISOString() }); setNotice('Mensagem agendada.'); await refreshSchedules();
    })}>Agendar mensagem</button>
    <button disabled={busy} onClick={() => run(refreshSchedules)}>Atualizar agendamentos</button>
    {schedules && <ul className="w-full space-y-2">{schedules.map(schedule => <li key={schedule.id} className="bg-gray-800 p-2 rounded">{new Date(schedule.scheduledTime).toLocaleString()} ? {schedule.status}: {schedule.text?.slice(0, 80)} {schedule.last_error && <span className="text-amber-300">{schedule.last_error}</span>} {['pending', 'failed'].includes(schedule.status) && <button disabled={busy} className="ml-2 text-red-300" onClick={() => run(async () => { await api.delete('/chats/schedule/' + schedule.id); await refreshSchedules(); })}>Cancelar</button>}</li>)}</ul>}
    {user?.role === 'admin' && <>
      <button disabled={busy} onClick={() => run(async () => { const response = await api.get(`/privacy/clients/${chatId}/export`); downloadFile('cliente.json', JSON.stringify(response.data, null, 2), 'application/json'); })}>Exportar dados</button>
      <button disabled={busy} onClick={() => { if (window.confirm('Anonimizar este cliente? Esta acao remove seus dados pessoais.')) run(async () => { await api.post(`/privacy/clients/${chatId}/anonymize`); await useAppStore.getState().fetchChats(); setNotice('Cliente anonimizado.'); }); }}>Anonimizar</button>
      <button disabled={busy} className="text-red-300" onClick={() => { if (window.confirm('Excluir permanentemente os dados deste cliente?')) run(async () => { await api.delete('/privacy/clients/' + chatId); useAppStore.getState().removeChat(chatId); }); }}>Excluir dados do cliente</button>
    </>}
    {error && <p role="alert" className="w-full text-red-300">{error}</p>}{notice && <p role="status" className="w-full text-green-300">{notice}</p>}
  </div>;
}
