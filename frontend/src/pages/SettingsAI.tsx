import { useEffect, useState } from 'react';
import { useAppStore } from '../stores/appStore';
import api from '../services/api';

const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';

const VALID_OPENAI_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1-mini', 'o1'];
const VALID_GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'];
const VALID_GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'];

function safeModel(value: string | undefined, validList: string[], fallback: string): string {
  if (!value) return fallback;
  const clean = value.trim();
  return validList.includes(clean) ? clean : fallback;
}

export default function SettingsAI() {
  const { settings, fetchSettings } = useAppStore();
  const [formData, setFormData] = useState({
    ai_enabled: false,
    ai_provider: 'mock',
    gemini_key: '',
    openai_key: '',
    groq_key: '',
    gemini_model: 'gemini-2.5-flash',
    openai_model: 'gpt-4o-mini',
    groq_model: DEFAULT_GROQ_MODEL,
    system_prompt: ''
  });
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [testingKey, setTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const updateFormData = (data: Partial<typeof formData>) => {
    setSaveStatus(null);
    setTestResult(null);
    setFormData({ ...formData, ...data });
  };

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (settings) {
      setFormData({
        ai_enabled: settings.ai_enabled,
        ai_provider: settings.ai_provider === 'grok' ? 'groq' : settings.ai_provider,
        gemini_key: settings.gemini_key || '',
        openai_key: settings.openai_key || '',
        groq_key: settings.groq_key || settings.grok_key || '',
        gemini_model: safeModel(settings.gemini_model, VALID_GEMINI_MODELS, 'gemini-2.5-flash'),
        openai_model: safeModel(settings.openai_model, VALID_OPENAI_MODELS, 'gpt-4o-mini'),
        groq_model: safeModel(settings.groq_model || settings.grok_model, VALID_GROQ_MODELS, DEFAULT_GROQ_MODEL),
        system_prompt: settings.system_prompt || ''
      });
    }
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus(null);
    setTestResult(null);

    try {
      await api.post('/settings', {
        ...formData,
        grok_key: formData.groq_key,
        grok_model: formData.groq_model
      });
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

  const handleTestKey = async () => {
    const provider = formData.ai_provider;
    const keyMap: Record<string, string> = {
      openai: formData.openai_key,
      gemini: formData.gemini_key,
      groq: formData.groq_key
    };
    const modelMap: Record<string, string> = {
      openai: formData.openai_model,
      gemini: formData.gemini_model,
      groq: formData.groq_model
    };
    const key = keyMap[provider] || '';
    if (!key) {
      setTestResult({ ok: false, message: 'Informe a chave de API antes de testar.' });
      return;
    }
    setTestingKey(true);
    setTestResult(null);
    try {
      const res = await api.post('/settings/test-key', {
        provider,
        key,
        model: modelMap[provider]
      });
      if (res.data.ok) {
        setTestResult({ ok: true, message: `✅ Chave válida! Modelo: ${res.data.model}` });
      } else {
        setTestResult({ ok: false, message: `❌ Erro da API: ${res.data.error}` });
      }
    } catch (err: any) {
      setTestResult({
        ok: false,
        message: `❌ ${err.response?.data?.error || err.message || 'Erro ao testar chave.'}`
      });
    } finally {
      setTestingKey(false);
    }
  };

  const showTestButton = ['openai', 'gemini', 'groq'].includes(formData.ai_provider);

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
              <option value="groq">Groq</option>
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
                <select
                  value={formData.gemini_model}
                  onChange={(e) => updateFormData({ gemini_model: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="gemini-2.5-flash">gemini-2.5-flash (recomendado)</option>
                  <option value="gemini-2.5-pro">gemini-2.5-pro</option>
                  <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                  <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                  <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                </select>
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
                  placeholder="sk-proj-..."
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Modelo</label>
                <select
                  value={formData.openai_model}
                  onChange={(e) => updateFormData({ openai_model: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="gpt-4o-mini">gpt-4o-mini (recomendado — rápido e barato)</option>
                  <option value="gpt-4o">gpt-4o (mais inteligente)</option>
                  <option value="gpt-4-turbo">gpt-4-turbo</option>
                  <option value="gpt-3.5-turbo">gpt-3.5-turbo (mais barato)</option>
                  <option value="o1-mini">o1-mini</option>
                  <option value="o1">o1</option>
                </select>
              </div>
            </>
          )}

          {formData.ai_provider === 'groq' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Groq API Key</label>
                <input
                  type="password"
                  value={formData.groq_key}
                  onChange={(e) => updateFormData({ groq_key: e.target.value })}
                  placeholder="gsk_..."
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Modelo</label>
                <select
                  value={formData.groq_model}
                  onChange={(e) => updateFormData({ groq_model: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile (recomendado)</option>
                  <option value="llama-3.1-70b-versatile">llama-3.1-70b-versatile</option>
                  <option value="llama-3.1-8b-instant">llama-3.1-8b-instant (mais rápido)</option>
                  <option value="mixtral-8x7b-32768">mixtral-8x7b-32768</option>
                  <option value="gemma2-9b-it">gemma2-9b-it</option>
                </select>
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

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Salvar Configurações'}
            </button>

            {showTestButton && (
              <button
                onClick={handleTestKey}
                disabled={testingKey || saving}
                className="px-5 bg-gray-700 text-white py-3 rounded-lg font-medium hover:bg-gray-600 disabled:opacity-50 border border-gray-600 whitespace-nowrap"
                title="Testa a chave com uma chamada real à API do provedor selecionado"
              >
                {testingKey ? 'Testando...' : '🔌 Testar Chave'}
              </button>
            )}
          </div>

          {testResult && (
            <div
              role="status"
              className={`rounded-lg border px-4 py-3 text-sm font-mono break-all ${
                testResult.ok
                  ? 'border-green-500/40 bg-green-500/10 text-green-300'
                  : 'border-red-500/40 bg-red-500/10 text-red-300'
              }`}
            >
              {testResult.message}
            </div>
          )}

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
