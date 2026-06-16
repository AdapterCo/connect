import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './stores/authStore';
import Layout from './components/Layout';
import Landing from './pages/Landing';
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
import Catalog from './pages/Catalog';
import Orders from './pages/Orders';
import Cardapio from './pages/Cardapio';

function ProtectedLanding() {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <Landing />;
}

function App() {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ProtectedLanding />} />
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/cardapio/:slug" element={<Cardapio />} />
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/chats" element={<Chats />} />
          <Route path="/kanban" element={<Kanban />} />
          <Route path="/catalog" element={<Catalog />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/whatsapp" element={<WhatsApp />} />
          <Route path="/settings/ai" element={<SettingsAI />} />
          <Route path="/settings/mp" element={<SettingsMP />} />
          <Route path="/team" element={<Team />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/billing" element={<Billing />} />
          <Route path="/superadmin" element={<SuperAdmin />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
