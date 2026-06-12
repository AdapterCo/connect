import { useEffect, useState } from 'react';
import { useAppStore } from '../stores/appStore';
import api from '../services/api';

export default function SettingsMP() {
  const { settings, fetchSettings } = useAppStore();
  const [formData, setFormData] = useState({
    mp_enabled: false,
    mp_access_token: '',
    mp_public_key: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (settings) {
      setFormData({
        mp_enabled: settings.mp_enabled,
        mp_access_token: settings.mp_access_token || '',
        mp_public_key: settings.mp_public_key || ''
      });
    }
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    await api.put('/settings', formData);
    await fetchSettings();
    setSaving(false);
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <h2 className="text-2xl font-bold mb-6">Integração Mercado Pago</h2>

      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 max-w-3xl">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-700">
          <div>
            <h3 className="font-bold text-white">Ativar Recebimento Automático</h3>
            <p className="text-sm text-gray-400">Permite gerar links de pagamento nas conversas.</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={formData.mp_enabled}
              onChange={(e) => setFormData({ ...formData, mp_enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
          </label>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Access Token</label>
            <input
              type="password"
              value={formData.mp_access_token}
              onChange={(e) => setFormData({ ...formData, mp_access_token: e.target.value })}
              placeholder="APP_USR-..."
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Public Key</label>
            <input
              type="text"
              value={formData.mp_public_key}
              onChange={(e) => setFormData({ ...formData, mp_public_key: e.target.value })}
              placeholder="APP_USR-..."
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Webhook URL</label>
            <input
              type="text"
              readOnly
              value={`${window.location.origin}/api/webhook/mercadopago`}
              className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-4 py-2 text-gray-400 cursor-not-allowed"
            />
            <p className="text-xs text-gray-500 mt-1">Configure esta URL no painel do Mercado Pago.</p>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Salvar Configurações'}
          </button>
        </div>
      </div>
    </div>
  );
}
