import { Suspense } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useSocket } from '../hooks/useSocket';
import LeadAlerts from './LeadAlerts';
import Sidebar from './Sidebar';

export default function Layout() {
  const location = useLocation();
  const { isAuthenticated, isLoading, user, sessionError, initialize } = useAuthStore();
  useSocket();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (sessionError) return <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white gap-4"><p role="alert">{sessionError}</p><button onClick={() => initialize()} className="px-4 py-2 bg-indigo-600 rounded">Tentar novamente</button></div>;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.requires_payment && location.pathname !== '/billing') return <Navigate to="/billing" replace />;
  return (
    <div className="flex h-screen bg-gray-900 text-white">
      <div className="flex flex-col bg-gray-800 shrink-0 [&>aside]:flex-1 [&>aside]:min-h-0"><Sidebar /><LeadAlerts /></div>
      <main className="min-w-0 flex-1 overflow-hidden">
        {/* O menu continua visivel enquanto a pagina (carregada sob demanda) chega. */}
        <Suspense fallback={<div className="flex h-full items-center justify-center text-gray-400">Carregando...</div>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
