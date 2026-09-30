import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { ReactNode } from 'react';
import type { FlowNodeData, FlowNodeType } from '../../types';
import { INPUT_LABELS, NODE_META, OPERATOR_LABELS } from './flowMeta';

type FlowCanvasNode = Node<FlowNodeData>;

const handleClass = '!h-3 !w-3 !border-2 !border-gray-900 !bg-gray-300';

function Card({ type, selected, children, target = true }: { type: FlowNodeType; selected: boolean; children: ReactNode; target?: boolean }) {
  const meta = NODE_META[type];
  return (
    <div className={`w-60 rounded-lg border bg-gray-800 text-left shadow-lg ${meta.accent} ${selected ? 'ring-2 ring-indigo-400' : ''}`}>
      {target && <Handle type="target" position={Position.Top} className={handleClass} />}
      <div className={`flex items-center gap-2 border-b border-gray-700 px-3 py-2 text-sm font-semibold ${meta.title}`}>
        <span aria-hidden="true">{meta.icon}</span>
        {meta.label}
      </div>
      <div className="px-3 py-2 text-xs text-gray-300">{children}</div>
    </div>
  );
}

function Preview({ text, empty }: { text?: string; empty: string }) {
  return text ? <p className="line-clamp-3 whitespace-pre-wrap break-words">{text}</p> : <p className="italic text-gray-500">{empty}</p>;
}

export function StartNode({ selected }: NodeProps<FlowCanvasNode>) {
  return (
    <Card type="start" selected={selected} target={false}>
      Ponto de entrada do fluxo
      <Handle type="source" position={Position.Bottom} className={handleClass} />
    </Card>
  );
}

export function MessageNode({ data, selected }: NodeProps<FlowCanvasNode>) {
  return (
    <Card type="message" selected={selected}>
      <Preview text={data.text} empty="Escreva a mensagem" />
      <Handle type="source" position={Position.Bottom} className={handleClass} />
    </Card>
  );
}

export function QuestionNode({ data, selected }: NodeProps<FlowCanvasNode>) {
  return (
    <Card type="question" selected={selected}>
      <Preview text={data.text} empty="Escreva a pergunta" />
      <p className="mt-1 text-[11px] text-gray-400">
        {data.variable ? <>Salva em <span className="font-mono text-orange-300">{data.variable}</span></> : 'Defina a variável'}
        {' · '}{INPUT_LABELS[data.input || 'text']}
      </p>
      <Handle type="source" position={Position.Bottom} className={handleClass} />
    </Card>
  );
}

// Cada opcao do menu tem a propria saida, ao lado do texto da opcao.
export function MenuNode({ data, selected }: NodeProps<FlowCanvasNode>) {
  return (
    <Card type="menu" selected={selected}>
      <Preview text={data.text} empty="Escreva a pergunta do menu" />
      <ul className="mt-2 space-y-1">
        {(data.options || []).map((option, index) => (
          <li key={option.id} className="relative rounded bg-gray-700/60 px-2 py-1 pr-4">
            {index + 1}. {option.label}
            <Handle type="source" id={option.id} position={Position.Right} className={handleClass} style={{ top: '50%', right: -18 }} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function ConditionNode({ data, selected }: NodeProps<FlowCanvasNode>) {
  const operator = OPERATOR_LABELS[data.operator || 'equals'];
  const hasValue = !['is_empty', 'not_empty'].includes(data.operator || 'equals');
  return (
    <Card type="condition" selected={selected}>
      {data.variable
        ? <p>Se <span className="font-mono text-yellow-300">{data.variable}</span> {operator}{hasValue ? <> “{data.value}”</> : null}</p>
        : <p className="italic text-gray-500">Configure a condição</p>}
      <div className="mt-2 flex justify-between text-[11px] font-semibold">
        <span className="text-emerald-400">Sim</span>
        <span className="text-rose-400">Não</span>
      </div>
      <Handle type="source" id="true" position={Position.Bottom} className={handleClass} style={{ left: '20%' }} />
      <Handle type="source" id="false" position={Position.Bottom} className={handleClass} style={{ left: '80%' }} />
    </Card>
  );
}

export function TransferNode({ data, selected }: NodeProps<FlowCanvasNode>) {
  return (
    <Card type="transfer" selected={selected}>
      <Preview text={data.text} empty="Sem mensagem (opcional)" />
      <p className="mt-1 text-[11px] text-gray-400">{data.to_sales ? 'Entra no rodízio de vendedores' : 'Fila de atendimento humano'}</p>
    </Card>
  );
}

export function EndNode({ data, selected }: NodeProps<FlowCanvasNode>) {
  return (
    <Card type="end" selected={selected}>
      <Preview text={data.text} empty="Sem mensagem (opcional)" />
      <p className="mt-1 text-[11px] text-gray-400">Depois do fluxo, a IA assume (se ativa).</p>
    </Card>
  );
}
