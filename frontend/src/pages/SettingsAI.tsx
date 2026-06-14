import { useEffect, useState } from 'react';
import { useAppStore } from '../stores/appStore';
import api from '../services/api';

export default function SettingsAI() {
  const { settings, fetchSettings } = useAppStore();
  const [formData, setFormData] = useState({
    ai_enabled: false,
    ai_provider: 'mock',
    gemini_key: '',
    openai_key: '',
    grok_key: '',
    gemini_model: 'gemini-2.5-flash',
    openai_model: 'gpt-4o-mini',
    grok_model: 'grok-4.3',
    system_prompt: ''
  });
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const updateFormData = (data: Partial<typeof formData>) => {
    setSaveStatus(null);
    setFormData({ ...formData, ...data });
  };

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (settings) {
      setFormData({
        ai_enabled: settings.ai_enabled,
        ai_provider: settings.ai_provider,
        gemini_key: settings.gemini_key || '',
        openai_key: settings.openai_key || '',
        grok_key: settings.grok_key || '',
        gemini_model: settings.gemini_model || 'gemini-2.5-flash',
        openai_model: settings.openai_model || 'gpt-4o-mini',
        grok_model: settings.grok_model || 'grok-4.3',
        system_prompt: settings.system_prompt || ''
      });
    }
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus(null);

    try {
      await api.post('/settings', formData);
      await fetchSettings();
      setSaveStatus({ type: 'success', message: 'Configurações de IA salvas com sucesso.' });
    } catch (err: any) {
      setSaveStatus({
        type: 'error',
        message: err.response?.data?.error || 'Erro ao salvar configurações de IA.'
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <h2 className="text-2xl font-bold mb-6">Configurações de IA</h2>

      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 max-w-3xl">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-700">
          <div>
            <h3 className="font-bold text-white">Ativar Atendente Virtual (IA)</h3>
            <p className="text-sm text-gray-400">Permite que a IA responda aos clientes automaticamente.</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={formData.ai_enabled}
              onChange={(e) => updateFormData({ ai_enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
          </label>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Provedor de IA</label>
            <select
              value={formData.ai_provider}
              onChange={(e) => updateFormData({ ai_provider: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="mock">Modo Demonstrativo (Mock)</option>
              <option value="gemini">Google Gemini</option>
              <option value="openai">OpenAI ChatGPT</option>
              <option value="grok">xAI Grok</option>
            </select>
          </div>

          {formData.ai_provider === 'gemini' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Gemini API Key</label>
                <input
                  type="password"
                  value={formData.gemini_key}
                  onChange={(e) => updateFormData({ gemini_key: e.target.value })}
                  placeholder="AIzaSy..."
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Modelo</label>
                <input
                  type="text"
                  value={formData.gemini_model}
                  onChange={(e) => updateFormData({ gemini_model: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </>
          )}

          {formData.ai_provider === 'openai' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">OpenAI API Key</label>
                <input
                  type="password"
                  value={formData.openai_key}
                  onChange={(e) => updateFormData({ openai_key: e.target.value })}
                  placeholder="sk-..."
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Modelo</label>
                <input
                  type="text"
                  value={formData.openai_model}
                  onChange={(e) => updateFormData({ openai_model: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </>
          )}

          {formData.ai_provider === 'grok' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Grok API Key</label>
                <input
                  type="password"
                  value={formData.grok_key}
                  onChange={(e) => updateFormData({ grok_key: e.target.value })}
                  placeholder="xai-..."
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Modelo</label>
                <input
                  type="text"
                  value={formData.grok_model}
                  onChange={(e) => updateFormData({ grok_model: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Prompt de Sistema</label>
            <textarea
              value={formData.system_prompt}
              onChange={(e) => updateFormData({ system_prompt: e.target.value })}
              rows={10}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white font-mono text-sm focus:outline-none focus:border-indigo-500"
            />
            <p className="text-xs text-gray-500 mt-1">Defina as regras de negócio e como o bot deve conduzir a conversa.</p>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Salvar Configurações'}
          </button>

          {saveStatus && (
            <div
              role="status"
              className={`rounded-lg border px-4 py-3 text-sm ${
                saveStatus.type === 'success'
                  ? 'border-green-500/40 bg-green-500/10 text-green-300'
                  : 'border-red-500/40 bg-red-500/10 text-red-300'
              }`}
            >
              {saveStatus.message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
