import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { useAuthStore } from './stores/authStore';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Login from './pages/Login';

// Cada pagina interna vira um arquivo JS separado, baixado so quando acessada.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Chats = lazy(() => import('./pages/Chats'));
const Kanban = lazy(() => import('./pages/Kanban'));
const WhatsApp = lazy(() => import('./pages/WhatsApp'));
const SettingsAI = lazy(() => import('./pages/SettingsAI'));
const Team = lazy(() => import('./pages/Team'));
const Reports = lazy(() => import('./pages/Reports'));
const StoreProducts = lazy(() => import('./pages/StoreProducts'));
const Commercial = lazy(() => import('./pages/Commercial'));
const Logs = lazy(() => import('./pages/Logs'));
const Flows = lazy(() => import('./pages/Flows'));
const FlowEditor = lazy(() => import('./pages/FlowEditor'));
const SuperAdmin = lazy(() => import('./pages/SuperAdmin'));
const Billing = lazy(() => import('./pages/Billing'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));

const MANAGERS = ['admin', 'supervisor'];

function ProtectedLanding() {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <Landing />;
}

// Espelha as permissoes do backend: sem o perfil, a pagina nem e carregada.
function RequireRole({ roles, children }: { roles: string[]; children: ReactNode }) {
  const role = useAuthStore((state) => state.user?.role);
  return role && roles.includes(role) ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

function PageLoading() {
  return <div className="flex items-center justify-center h-full min-h-screen bg-gray-900 text-gray-400">Carregando...</div>;
}

function App() {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/" element={<ProtectedLanding />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route element={<Layout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/chats" element={<Chats />} />
            <Route path="/kanban" element={<Kanban />} />
            <Route path="/catalog" element={<RequireRole roles={[...MANAGERS, 'seller']}><StoreProducts /></RequireRole>} />
            <Route path="/commercial" element={<RequireRole roles={[...MANAGERS, 'seller']}><Commercial /></RequireRole>} />
            <Route path="/orders" element={<Navigate to="/catalog" replace />} />
            <Route path="/fluxos" element={<RequireRole roles={MANAGERS}><Flows /></RequireRole>} />
            <Route path="/fluxos/:id" element={<RequireRole roles={MANAGERS}><FlowEditor /></RequireRole>} />
            <Route path="/whatsapp" element={<RequireRole roles={MANAGERS}><WhatsApp /></RequireRole>} />
            <Route path="/settings/ai" element={<RequireRole roles={['admin']}><SettingsAI /></RequireRole>} />
            <Route path="/settings/mp" element={<Navigate to="/catalog" replace />} />
            <Route path="/team" element={<RequireRole roles={MANAGERS}><Team /></RequireRole>} />
            <Route path="/reports" element={<RequireRole roles={MANAGERS}><Reports /></RequireRole>} />
            <Route path="/logs" element={<RequireRole roles={['admin']}><Logs /></RequireRole>} />
            <Route path="/billing" element={<RequireRole roles={['admin']}><Billing /></RequireRole>} />
            <Route path="/superadmin" element={<RequireRole roles={['superadmin']}><SuperAdmin /></RequireRole>} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
