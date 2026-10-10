import type { ReactNode } from 'react';
import type { FlowInputType, FlowNodeData, FlowNodeType, FlowOperator } from '../../types';
import { INPUT_LABELS, NODE_META, OPERATOR_LABELS, newId } from './flowMeta';

const inputClass = 'w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none';
const MAX_OPTIONS = 10;

interface Props {
  type: FlowNodeType;
  data: FlowNodeData;
  variables: string[];
  onChange: (patch: Partial<FlowNodeData>) => void;
  onRemoveOption: (optionId: string) => void;
  onDelete: () => void;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-gray-400">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-gray-500">{hint}</span>}
    </label>
  );
}

const TEXT_HINT = 'Use {{cliente}} para o nome do contato e {{variavel}} para respostas anteriores.';
const VARIABLE_HINT = 'Nome curto, sem espaços (ex.: nome, cidade, email). Aparece nas respostas da conversa.';

function MessageText({ data, onChange, label = 'Mensagem', required = true }: { data: FlowNodeData; onChange: Props['onChange']; label?: string; required?: boolean }) {
  return (
    <Field label={label} hint={TEXT_HINT}>
      <textarea
        value={data.text || ''}
        onChange={(e) => onChange({ text: e.target.value })}
        rows={4}
        maxLength={4096}
        placeholder={required ? 'Digite o texto enviado ao cliente' : 'Opcional'}
        className={inputClass}
      />
    </Field>
  );
}

function VariableInput({ data, onChange, required }: { data: FlowNodeData; onChange: Props['onChange']; required: boolean }) {
  return (
    <Field label={required ? 'Salvar resposta em' : 'Salvar escolha em (opcional)'} hint={VARIABLE_HINT}>
      <input
        value={data.variable || ''}
        onChange={(e) => onChange({ variable: e.target.value.replace(/[^A-Za-z0-9_]/g, '').slice(0, 40) })}
        placeholder="ex.: nome"
        className={`${inputClass} font-mono`}
      />
    </Field>
  );
}

function InvalidText({ data, onChange }: { data: FlowNodeData; onChange: Props['onChange'] }) {
  return (
    <Field label="Mensagem para resposta inválida" hint="Após 3 respostas inválidas, a conversa vai para um atendente.">
      <input
        value={data.invalid_text || ''}
        onChange={(e) => onChange({ invalid_text: e.target.value })}
        maxLength={4096}
        placeholder="Não entendi sua resposta. Por favor, tente novamente."
        className={inputClass}
      />
    </Field>
  );
}

export default function NodeProperties({ type, data, variables, onChange, onRemoveOption, onDelete }: Props) {
  const meta = NODE_META[type];
  const options = data.options || [];

  return (
    <div className="space-y-4">
      <div>
        <h3 className={`flex items-center gap-2 text-sm font-bold ${meta.title}`}><meta.icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />{meta.label}</h3>
        <p className="text-xs text-gray-400">{meta.description}</p>
      </div>

      {type === 'start' && <p className="text-sm text-gray-300">Toda conversa nova começa aqui. Ligue a saída ao primeiro passo do fluxo.</p>}

      {type === 'message' && <MessageText data={data} onChange={onChange} />}

      {type === 'menu' && (
        <>
          <MessageText data={data} onChange={onChange} label="Pergunta do menu" />
          <div className="space-y-2">
            <span className="text-xs font-semibold text-gray-400">Opções</span>
            {options.map((option, index) => (
              <div key={option.id} className="flex items-center gap-2">
                <span className="w-5 text-sm text-gray-400">{index + 1}.</span>
                <input
                  value={option.label}
                  onChange={(e) => onChange({ options: options.map(o => o.id === option.id ? { ...o, label: e.target.value.slice(0, 100) } : o) })}
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => onRemoveOption(option.id)}
                  disabled={options.length <= 1}
                  className="rounded px-2 py-1 text-gray-400 hover:bg-gray-700 hover:text-rose-400 disabled:opacity-30"
                  aria-label={`Remover opção ${index + 1}`}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => onChange({ options: [...options, { id: newId('opt'), label: `Opção ${options.length + 1}` }] })}
              disabled={options.length >= MAX_OPTIONS}
              className="w-full rounded-lg border border-dashed border-gray-600 py-2 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-40"
            >
              + Adicionar opção
            </button>
            <p className="text-[11px] text-gray-500">O cliente responde com o número ou o texto da opção. Ligue cada opção ao próximo passo.</p>
          </div>
          <VariableInput data={data} onChange={onChange} required={false} />
          <InvalidText data={data} onChange={onChange} />
        </>
      )}

      {type === 'question' && (
        <>
          <MessageText data={data} onChange={onChange} label="Pergunta" />
          <VariableInput data={data} onChange={onChange} required />
          <Field label="Tipo de resposta" hint="Respostas fora do formato são pedidas novamente.">
            <select value={data.input || 'text'} onChange={(e) => onChange({ input: e.target.value as FlowInputType })} className={inputClass}>
              {Object.entries(INPUT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <InvalidText data={data} onChange={onChange} />
        </>
      )}

      {type === 'condition' && (
        <>
          <Field label="Resposta verificada" hint="Variável salva por uma Pergunta ou Menu anterior.">
            <input
              list="flow-variables"
              value={data.variable || ''}
              onChange={(e) => onChange({ variable: e.target.value.replace(/[^A-Za-z0-9_]/g, '').slice(0, 40) })}
              placeholder="ex.: interesse"
              className={`${inputClass} font-mono`}
            />
            <datalist id="flow-variables">
              {variables.map(variable => <option key={variable} value={variable} />)}
            </datalist>
          </Field>
          <Field label="Condição">
            <select value={data.operator || 'equals'} onChange={(e) => onChange({ operator: e.target.value as FlowOperator })} className={inputClass}>
              {Object.entries(OPERATOR_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          {!['is_empty', 'not_empty'].includes(data.operator || 'equals') && (
            <Field label="Valor" hint="Comparação sem diferenciar maiúsculas e acentos.">
              <input value={data.value || ''} onChange={(e) => onChange({ value: e.target.value.slice(0, 200) })} className={inputClass} />
            </Field>
          )}
          <p className="text-[11px] text-gray-500">Ligue a saída “Sim” e a saída “Não” aos próximos passos.</p>
        </>
      )}

      {type === 'transfer' && (
        <>
          <MessageText data={data} onChange={onChange} label="Mensagem antes de transferir" required={false} />
          <label className="flex items-start gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={data.to_sales === true} onChange={(e) => onChange({ to_sales: e.target.checked })} className="mt-1" />
            <span>Enviar para o rodízio de vendedores (etapa “Interesse em Compra”)</span>
          </label>
          <p className="text-[11px] text-gray-500">A IA é desligada nesta conversa e um atendente humano assume.</p>
        </>
      )}

      {type === 'end' && (
        <>
          <MessageText data={data} onChange={onChange} label="Mensagem de encerramento" required={false} />
          <p className="text-[11px] text-gray-500">Depois do encerramento, a IA responde as próximas mensagens (se estiver ativa).</p>
        </>
      )}

      {type !== 'start' && (
        <button type="button" onClick={onDelete} className="w-full rounded-lg border border-rose-500/40 py-2 text-sm text-rose-300 hover:bg-rose-500/10">
          Excluir este nó
        </button>
      )}
    </div>
  );
}
