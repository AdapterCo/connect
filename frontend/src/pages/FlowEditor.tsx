import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, addEdge, useEdgesState, useNodesState, useReactFlow,
  type Connection, type Edge, type EdgeChange, type IsValidConnection, type Node, type NodeChange
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import api, { apiErrorMessage } from '../services/api';
import type { FlowDetail, FlowGraphEdge, FlowGraphNode, FlowNodeData, FlowNodeType } from '../types';
import { NODE_META, PALETTE, defaultData, newId } from '../components/flow/flowMeta';
import NodeProperties from '../components/flow/NodeProperties';
import { ConditionNode, EndNode, MenuNode, MessageNode, QuestionNode, StartNode, TransferNode } from '../components/flow/FlowNodes';

type CanvasNode = Node<FlowNodeData>;

const nodeTypes = {
  start: StartNode,
  message: MessageNode,
  menu: MenuNode,
  question: QuestionNode,
  condition: ConditionNode,
  transfer: TransferNode,
  end: EndNode
};

const DRAG_TYPE = 'application/x-flow-node';

function toCanvas(graph: FlowDetail['graph']): { nodes: CanvasNode[]; edges: Edge[] } {
  return {
    nodes: graph.nodes.map(node => ({ id: node.id, type: node.type, position: node.position, data: node.data, deletable: node.type !== 'start' })),
    edges: graph.edges.map(edge => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle ?? undefined }))
  };
}

// Apenas o que o backend guarda: posicoes e conteudo, sem estado do editor.
function toGraph(nodes: CanvasNode[], edges: Edge[]) {
  return {
    nodes: nodes.map((node): FlowGraphNode => ({ id: node.id, type: node.type as FlowNodeType, position: node.position, data: node.data })),
    edges: edges.map((edge): FlowGraphEdge => ({ id: edge.id, source: edge.source, sourceHandle: edge.sourceHandle ?? null, target: edge.target }))
  };
}

function Editor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [name, setName] = useState('');
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    api.get<FlowDetail>(`/flows/${id}`)
      .then(({ data }) => {
        const canvas = toCanvas(data.graph);
        setNodes(canvas.nodes);
        setEdges(canvas.edges);
        setName(data.name);
        setActive(data.is_active);
      })
      .catch(err => setError(apiErrorMessage(err, 'Não foi possível carregar o fluxo.')))
      .finally(() => setLoading(false));
  }, [id, setNodes, setEdges]);

  const selected = nodes.filter(node => node.selected).length === 1 ? nodes.find(node => node.selected) : undefined;

  // Variaveis ja definidas por Perguntas e Menus (sugestoes para Condicao).
  const variables = useMemo(
    () => [...new Set(nodes.map(node => node.data.variable).filter((value): value is string => Boolean(value)))],
    [nodes]
  );

  const handleNodesChange = useCallback((changes: NodeChange<CanvasNode>[]) => {
    onNodesChange(changes);
    if (changes.some(change => change.type !== 'select' && change.type !== 'dimensions')) setDirty(true);
  }, [onNodesChange]);

  const handleEdgesChange = useCallback((changes: EdgeChange<Edge>[]) => {
    onEdgesChange(changes);
    if (changes.some(change => change.type !== 'select')) setDirty(true);
  }, [onEdgesChange]);

  // Cada saida leva a um unico passo: uma nova ligacao substitui a anterior.
  const onConnect = useCallback((connection: Connection) => {
    setEdges(current => addEdge(
      { ...connection, id: newId('e') },
      current.filter(edge => !(edge.source === connection.source && (edge.sourceHandle ?? null) === (connection.sourceHandle ?? null)))
    ));
    setDirty(true);
  }, [setEdges]);

  const isValidConnection = useCallback<IsValidConnection>(
    (connection) => connection.source !== connection.target && nodes.find(node => node.id === connection.target)?.type !== 'start',
    [nodes]
  );

  const addNode = useCallback((type: FlowNodeType, position?: { x: number; y: number }) => {
    let at = position;
    if (!at) {
      const rect = wrapperRef.current?.getBoundingClientRect();
      at = screenToFlowPosition({ x: (rect?.left ?? 0) + (rect?.width ?? 600) / 2, y: (rect?.top ?? 0) + (rect?.height ?? 400) / 3 });
    }
    const node: CanvasNode = { id: newId(type), type, position: at, data: defaultData(type), selected: true };
    setNodes(current => [...current.map(item => ({ ...item, selected: false })), node]);
    setDirty(true);
  }, [screenToFlowPosition, setNodes]);

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event: DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer.getData(DRAG_TYPE) as FlowNodeType;
    if (!PALETTE.includes(type)) return;
    addNode(type, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  }, [addNode, screenToFlowPosition]);

  const updateNodeData = useCallback((nodeId: string, patch: Partial<FlowNodeData>) => {
    setNodes(current => current.map(node => node.id === nodeId ? { ...node, data: { ...node.data, ...patch } } : node));
    setDirty(true);
  }, [setNodes]);

  const removeOption = useCallback((nodeId: string, optionId: string) => {
    setNodes(current => current.map(node => node.id === nodeId
      ? { ...node, data: { ...node.data, options: (node.data.options || []).filter(option => option.id !== optionId) } }
      : node));
    setEdges(current => current.filter(edge => !(edge.source === nodeId && edge.sourceHandle === optionId)));
    setDirty(true);
  }, [setNodes, setEdges]);

  const deleteNode = useCallback((nodeId: string) => {
    setNodes(current => current.filter(node => node.id !== nodeId));
    setEdges(current => current.filter(edge => edge.source !== nodeId && edge.target !== nodeId));
    setDirty(true);
  }, [setNodes, setEdges]);

  const save = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api.put(`/flows/${id}`, { name, graph: toGraph(nodes, edges) });
      setDirty(false);
      setNotice('Fluxo salvo.');
      return true;
    } catch (err) {
      setError(apiErrorMessage(err, 'Não foi possível salvar o fluxo.'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async () => {
    const next = !active;
    if (next && dirty && !(await save())) return;
    setError('');
    try {
      await api.post(`/flows/${id}/active`, { active: next });
      setActive(next);
      setNotice(next ? 'Fluxo ativado: conversas novas passam por ele.' : 'Fluxo desativado.');
    } catch (err) {
      setError(apiErrorMessage(err, 'Não foi possível alterar o status do fluxo.'));
    }
  };

  const goBack = () => {
    if (dirty && !confirm('Há alterações não salvas. Sair mesmo assim?')) return;
    navigate('/fluxos');
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center text-gray-400">Carregando fluxo...</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-gray-700 bg-gray-800 px-4 py-3">
        <button type="button" onClick={goBack} className="text-sm text-gray-300 hover:text-white">← Voltar</button>
        <input
          value={name}
          onChange={(e) => { setName(e.target.value.slice(0, 80)); setDirty(true); }}
          aria-label="Nome do fluxo"
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-lg font-bold text-white hover:border-gray-600 focus:border-indigo-500 focus:outline-none"
        />
        {error && <span className="max-w-md text-sm text-rose-400">{error}</span>}
        {!error && notice && <span className="text-sm text-emerald-400">{notice}</span>}
        {dirty && <span className="text-xs text-amber-300">Alterações não salvas</span>}
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-300">
          <button
            type="button"
            role="switch"
            aria-checked={active}
            onClick={toggleActive}
            className={`relative h-6 w-11 rounded-full transition-colors ${active ? 'bg-emerald-500' : 'bg-gray-600'}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${active ? 'left-5' : 'left-0.5'}`} />
          </button>
          {active ? 'Ativo' : 'Inativo'}
        </label>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-gray-950 hover:bg-indigo-400 disabled:opacity-50"
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-56 shrink-0 space-y-2 overflow-y-auto border-r border-gray-700 bg-gray-900 p-3">
          <h3 className="text-xs font-semibold text-gray-400">Tipos de nó</h3>
          {PALETTE.map(type => {
            const meta = NODE_META[type];
            return (
              <button
                key={type}
                type="button"
                draggable
                onDragStart={(event) => { event.dataTransfer.setData(DRAG_TYPE, type); event.dataTransfer.effectAllowed = 'move'; }}
                onClick={() => addNode(type)}
                className={`w-full rounded-lg border bg-gray-800 px-3 py-2 text-left hover:bg-gray-700 ${meta.accent}`}
                title="Clique ou arraste para o canvas"
              >
                <span className={`flex items-center gap-2 text-sm font-semibold ${meta.title}`}><meta.icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />{meta.label}</span>
                <span className="block text-[11px] text-gray-400">{meta.description}</span>
              </button>
            );
          })}
          <p className="pt-2 text-[11px] text-gray-500">Arraste um tipo para o canvas e ligue as saídas (círculos) às entradas dos próximos passos.</p>
        </aside>

        <div ref={wrapperRef} className="min-w-0 flex-1" onDragOver={onDragOver} onDrop={onDrop}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            colorMode="dark"
            fitView
            fitViewOptions={{ maxZoom: 1 }}
            deleteKeyCode={['Delete']}
          >
            <Background gap={20} />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>

        <aside className="w-80 shrink-0 overflow-y-auto border-l border-gray-700 bg-gray-900 p-4">
          {selected ? (
            <NodeProperties
              key={selected.id}
              type={selected.type as FlowNodeType}
              data={selected.data}
              variables={variables}
              onChange={(patch) => updateNodeData(selected.id, patch)}
              onRemoveOption={(optionId) => removeOption(selected.id, optionId)}
              onDelete={() => deleteNode(selected.id)}
            />
          ) : (
            <p className="mt-10 text-center text-sm text-gray-400">Selecione um nó para editar suas propriedades</p>
          )}
        </aside>
      </div>
    </div>
  );
}

export default function FlowEditor() {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  );
}
