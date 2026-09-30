import type { FlowNodeData, FlowNodeType } from '../../types';

export interface NodeMeta {
  label: string;
  description: string;
  icon: string;
  // Classes Tailwind: borda do cartao e cor do titulo.
  accent: string;
  title: string;
}

export const NODE_META: Record<FlowNodeType, NodeMeta> = {
  start: { label: 'Início', description: 'Ponto de entrada do fluxo', icon: '▶', accent: 'border-emerald-500/60', title: 'text-emerald-300' },
  message: { label: 'Mensagem', description: 'Envia uma mensagem de texto', icon: '💬', accent: 'border-sky-500/60', title: 'text-sky-300' },
  menu: { label: 'Menu', description: 'Apresenta opções numeradas', icon: '☰', accent: 'border-violet-500/60', title: 'text-violet-300' },
  question: { label: 'Pergunta', description: 'Faz uma pergunta e guarda a resposta', icon: '?', accent: 'border-orange-500/60', title: 'text-orange-300' },
  condition: { label: 'Condição', description: 'Verifica uma resposta e bifurca', icon: '⑂', accent: 'border-yellow-500/60', title: 'text-yellow-300' },
  transfer: { label: 'Transferência', description: 'Transfere para um atendente humano', icon: '👤', accent: 'border-rose-500/60', title: 'text-rose-300' },
  end: { label: 'Encerramento', description: 'Encerra o fluxo (a IA assume)', icon: '⏹', accent: 'border-gray-500/60', title: 'text-gray-300' }
};

// Tipos disponiveis na paleta (o Inicio e unico e ja vem no fluxo).
export const PALETTE: FlowNodeType[] = ['message', 'menu', 'question', 'condition', 'transfer', 'end'];

export const INPUT_LABELS = { text: 'Texto livre', number: 'Número', email: 'E-mail', phone: 'Telefone' } as const;

export const OPERATOR_LABELS = {
  equals: 'é igual a',
  not_equals: 'é diferente de',
  contains: 'contém',
  is_empty: 'está vazia',
  not_empty: 'foi respondida',
  greater: 'é maior que',
  less: 'é menor que'
} as const;

export function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

// Conteudo inicial de cada no ao ser adicionado no canvas.
export function defaultData(type: FlowNodeType): FlowNodeData {
  switch (type) {
    case 'message': return { text: '' };
    case 'menu': return { text: '', variable: '', invalid_text: '', options: [{ id: newId('opt'), label: 'Opção 1' }, { id: newId('opt'), label: 'Opção 2' }] };
    case 'question': return { text: '', variable: '', input: 'text', invalid_text: '' };
    case 'condition': return { variable: '', operator: 'equals', value: '' };
    case 'transfer': return { text: '', to_sales: false };
    case 'end': return { text: '' };
    default: return {};
  }
}
