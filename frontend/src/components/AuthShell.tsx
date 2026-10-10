import type { ReactNode } from 'react';
import BrandMark from './BrandMark';

// Prazo de resposta do rodizio: o anel mostra 42 dos 60 segundos restantes.
function ReplyTimer() {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="w-full max-w-sm rounded-lg border border-gray-700 bg-gray-800 p-5">
      <p className="text-xs text-gray-400">Interesse em compra · atribuído a você</p>
      <div className="mt-4 flex items-center gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-700 text-sm font-semibold text-gray-100">MR</div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-50">Marina Ribeiro</p>
          <p className="truncate text-sm text-gray-400">“Ainda tem a CG 160 vermelha? Aceita entrada?”</p>
        </div>
        <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0" aria-hidden="true">
          <circle cx="32" cy="32" r={radius} fill="none" stroke="#26343f" strokeWidth="5" />
          <circle
            cx="32" cy="32" r={radius} fill="none" stroke="#f5a524" strokeWidth="5" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={circumference * (1 - 42 / 60)} transform="rotate(-90 32 32)"
          />
          <text x="32" y="37" textAnchor="middle" fill="#f1f5f8" fontSize="15" fontWeight="600" style={{ fontVariantNumeric: 'tabular-nums' }}>0:42</text>
        </svg>
      </div>
      <p className="mt-4 border-t border-gray-700 pt-3 text-xs text-gray-400">
        Sem resposta no prazo, a conversa passa para o próximo vendedor disponível.
      </p>
    </div>
  );
}

export default function AuthShell({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-gray-900 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* Apresentacao a esquerda (telas largas); formulario a direita. */}
      <aside className="hidden flex-col border-r border-gray-800 bg-gray-950 px-16 py-8 lg:flex">
        <div className="flex items-center gap-3">
          <BrandMark className="h-8 w-8" />
          <span className="font-semibold text-gray-50 [font-stretch:112.5%]">Adapter Connect</span>
        </div>
        <div className="flex flex-1 flex-col justify-center gap-10">
          <div className="max-w-md">
            <p className="text-4xl font-semibold leading-tight text-gray-50 [font-stretch:118%]">
              Nenhum cliente esperando sem resposta.
            </p>
            <p className="mt-4 text-gray-400">
              Conversas do WhatsApp, funil de vendas e rodízio de vendedores no mesmo painel da loja.
            </p>
          </div>
          <ReplyTimer />
        </div>
      </aside>

      <main className="flex flex-col px-6 py-8 sm:px-12">
        {/* No celular o painel da esquerda some: a marca fica acima do formulario. */}
        <div className="flex items-center gap-3 lg:hidden">
          <BrandMark className="h-8 w-8" />
          <span className="font-semibold text-gray-50 [font-stretch:112.5%]">Adapter Connect</span>
        </div>
        <div className="flex flex-1 items-center">
          <div className="mx-auto w-full max-w-sm py-12">
            <h1 className="text-3xl font-semibold text-gray-50">{title}</h1>
            {description && <p className="mt-2 text-sm text-gray-400">{description}</p>}
            <div className="mt-8">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
