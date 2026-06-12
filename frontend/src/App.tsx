import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './stores/authStore';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Chats from './pages/Chats';
import Kanban from './pages/Kanban';
import WhatsApp from './pages/WhatsApp';
import SettingsAI from './pages/SettingsAI';
import SettingsMP from './pages/SettingsMP';
import Team from './pages/Team';
import Reports from './pages/Reports';
import Logs from './pages/Logs';
import SuperAdmin from './pages/SuperAdmin';
import Billing from './pages/Billing';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';

function App() {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/chats" element={<Chats />} />
          <Route path="/kanban" element={<Kanban />} />
          <Route path="/whatsapp" element={<WhatsApp />} />
          <Route path="/settings/ai" element={<SettingsAI />} />
          <Route path="/settings/mp" element={<SettingsMP />} />
          <Route path="/team" element={<Team />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/billing" element={<Billing />} />
          <Route path="/superadmin" element={<SuperAdmin />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
