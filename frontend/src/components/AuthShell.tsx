import type { ReactNode } from 'react';
import { Bot, MessagesSquare, Receipt, ShieldCheck, Shuffle, type LucideIcon } from 'lucide-react';
import BrandMark from './BrandMark';

// Prazo de resposta do rodizio: o anel mostra 42 dos 60 segundos restantes.
function ReplyTimer() {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="w-full max-w-sm rounded-lg border border-gray-700 bg-gray-900 p-5 shadow-sm">
      <p className="text-xs text-gray-400">Interesse em compra · atribuído a você</p>
      <div className="mt-4 flex items-center gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-700 text-sm font-semibold text-gray-100">MR</div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-50">Marina Ribeiro</p>
          <p className="truncate text-sm text-gray-400">“Ainda tem a CG 160 vermelha? Aceita entrada?”</p>
        </div>
        <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0" aria-hidden="true">
          <circle cx="32" cy="32" r={radius} fill="none" stroke="var(--color-gray-700)" strokeWidth="5" />
          <circle
            cx="32" cy="32" r={radius} fill="none" stroke="var(--color-signal)" strokeWidth="5" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={circumference * (1 - 42 / 60)} transform="rotate(-90 32 32)"
          />
          <text x="32" y="37" textAnchor="middle" fill="var(--color-gray-50)" fontSize="15" fontWeight="600" style={{ fontVariantNumeric: 'tabular-nums' }}>0:42</text>
        </svg>
      </div>
      <p className="mt-4 border-t border-gray-700 pt-3 text-xs text-gray-400">
        Sem resposta no prazo, a conversa passa para o próximo vendedor disponível.
      </p>
    </div>
  );
}

// O que o sistema faz pela loja, sem numeros de marketing.
const ADVANTAGES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Shuffle, title: 'Rodízio automático de vendedores', text: 'Cada lead vai para quem está disponível e troca de mãos se ficar sem resposta.' },
  { icon: Bot, title: 'Atendimento 24 horas', text: 'IA e fluxos respondem, qualificam o interesse e mostram produtos fora do horário.' },
  { icon: MessagesSquare, title: 'Todos os números em um painel', text: 'Várias linhas de WhatsApp, histórico completo e funil de vendas no mesmo lugar.' },
  { icon: Receipt, title: 'Vendas e comissões em dia', text: 'Registro por vendedor, comissões e relatórios atualizados a cada venda.' },
  { icon: ShieldCheck, title: 'Dados da loja protegidos', text: 'Acesso por perfil, sessão segura e ferramentas para atender a LGPD.' }
];

function Advantages() {
  return (
    <div className="w-full max-w-sm">
      <p className="text-2xl font-semibold leading-snug text-gray-50 [font-stretch:112.5%]">O que a loja ganha</p>
      <ul className="mt-8 space-y-6">
        {ADVANTAGES.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-950 text-indigo-300 ring-1 ring-indigo-800">
              <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <div>
              <p className="font-medium text-gray-50">{title}</p>
              <p className="mt-0.5 text-sm text-gray-400">{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AuthShell({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-gray-900 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1fr)]">
      {/* Telas largas: apresentacao | formulario | vantagens. Celular: so o formulario. */}
      <aside className="hidden flex-col bg-gray-950 px-12 py-8 lg:flex xl:px-16">
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

      <main className="flex flex-col border-gray-700 bg-gray-900 px-6 py-8 sm:px-12 lg:border-l xl:border-r">
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

      <aside className="hidden items-center justify-center bg-gray-950 px-12 py-8 xl:flex xl:px-16">
        <Advantages />
      </aside>
    </div>
  );
}
