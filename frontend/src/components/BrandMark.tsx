// Marca do Adapter Connect: um mostrador de painel com o ponteiro na faixa ambar.
export default function BrandMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="Adapter Connect">
      <rect width="32" height="32" rx="7" fill="#26343f" />
      <path d="M7.5 21.5a9 9 0 0 1 17 0" fill="none" stroke="#627586" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M19.7 13.9a9 9 0 0 1 4.8 7.6" fill="none" stroke="#f5a524" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M16 21.5 21.6 15.2" stroke="#e4ecf1" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="21.5" r="2" fill="#e4ecf1" />
    </svg>
  );
}
