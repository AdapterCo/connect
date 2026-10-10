import { Suspense, useEffect, useState, type MouseEvent } from 'react';
import { Menu, X } from 'lucide-react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useSocket } from '../hooks/useSocket';
import LeadAlerts from './LeadAlerts';
import Sidebar from './Sidebar';
import BrandMark from './BrandMark';

export default function Layout() {
  const location = useLocation();
  const { isAuthenticated, isLoading, user, sessionError, initialize } = useAuthStore();
  useSocket();
  // Telas pequenas: o menu lateral vira uma gaveta aberta pelo botao da barra superior.
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setNavOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  // Escolher um destino no menu fecha a gaveta.
  const closeOnNavigate = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('a')) setNavOpen(false);
  };

  if (isLoading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-gray-900" role="status">
        <BrandMark className="h-10 w-10" />
        <p className="text-sm text-gray-400">Abrindo o painel...</p>
      </div>
    );
  }

  if (sessionError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-gray-900 px-6 text-center">
        <BrandMark className="h-10 w-10" />
        <p role="alert" className="max-w-sm text-gray-200">{sessionError}</p>
        <button onClick={() => initialize()} className="btn btn-primary">Tentar novamente</button>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.requires_payment && location.pathname !== '/billing') return <Navigate to="/billing" replace />;
  return (
    <div className="flex h-screen flex-col bg-gray-900 text-gray-100 lg:flex-row">
      <header className="flex items-center gap-3 border-b border-gray-700 bg-gray-800 px-4 py-3 lg:hidden">
        <button type="button" onClick={() => setNavOpen(true)} className="rounded-md p-1.5 text-gray-300 hover:bg-gray-700" aria-label="Abrir menu" aria-expanded={navOpen}>
          <Menu className="h-5 w-5" strokeWidth={1.75} />
        </button>
        <BrandMark className="h-7 w-7" />
        <span className="font-semibold text-gray-50 [font-stretch:112.5%]">Adapter Connect</span>
      </header>

      {navOpen && <div className="fixed inset-0 z-30 bg-gray-950/70 lg:hidden" onClick={() => setNavOpen(false)} aria-hidden="true" />}

      <div
        onClick={closeOnNavigate}
        className={`fixed inset-y-0 left-0 z-40 flex shrink-0 flex-col border-r border-gray-700 bg-gray-800 transition-transform duration-200 lg:static lg:translate-x-0 [&>aside]:min-h-0 [&>aside]:flex-1 [&>aside]:border-r-0 ${navOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <button type="button" onClick={() => setNavOpen(false)} className="absolute right-3 top-5 rounded-md p-1.5 text-gray-400 hover:bg-gray-700 lg:hidden" aria-label="Fechar menu">
          <X className="h-5 w-5" strokeWidth={1.75} />
        </button>
        <Sidebar />
        <LeadAlerts />
      </div>

      <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {/* O menu continua visivel enquanto a pagina (carregada sob demanda) chega. */}
        <Suspense fallback={<div className="flex h-full items-center justify-center text-gray-400">Carregando...</div>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
