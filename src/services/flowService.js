const { prisma } = require('../config/database');

// ---------------------------------------------------------------------------
// Desenho do fluxo (mesmo formato do editor React Flow):
//   { nodes: [{ id, type, position: { x, y }, data }], edges: [{ id, source, sourceHandle, target }] }
// ---------------------------------------------------------------------------

const NODE_TYPES = ['start', 'message', 'menu', 'question', 'condition', 'transfer', 'end'];
const INPUT_TYPES = ['text', 'number', 'email', 'phone'];
const OPERATORS = ['equals', 'not_equals', 'contains', 'is_empty', 'not_empty', 'greater', 'less'];

const LIMITS = { nodes: 200, edges: 400, text: 4096, options: 10, label: 100, value: 200, name: 80 };
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const VARIABLE_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;

const MAX_RETRIES = 3;
const MAX_STEPS = 30;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

class FlowValidationError extends Error {}

function fail(message) {
  throw new FlowValidationError(message);
}

function text(value, label, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) fail(`${label}: o texto é obrigatório.`);
    return '';
  }
  if (typeof value !== 'string') fail(`${label}: texto inválido.`);
  if (value.length > LIMITS.text) fail(`${label}: texto acima de ${LIMITS.text} caracteres.`);
  return value;
}

function variable(value, label, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) fail(`${label}: informe o nome da variável que guarda a resposta.`);
    return null;
  }
  if (typeof value !== 'string' || !VARIABLE_PATTERN.test(value)) {
    fail(`${label}: variável deve começar com letra e ter só letras, números ou _ (até 40).`);
  }
  return value;
}

// Valores aceitos para cada tipo de no; campos desconhecidos sao descartados.
function normalizeData(node, label) {
  const data = node.data && typeof node.data === 'object' ? node.data : {};
  switch (node.type) {
    case 'start':
      return {};
    case 'message':
      return { text: text(data.text, label, { required: true }) };
    case 'menu': {
      if (!Array.isArray(data.options) || data.options.length === 0) fail(`${label}: adicione ao menos uma opção.`);
      if (data.options.length > LIMITS.options) fail(`${label}: no máximo ${LIMITS.options} opções.`);
      const seen = new Set();
      const options = data.options.map((option, index) => {
        if (!option || typeof option.id !== 'string' || !ID_PATTERN.test(option.id) || seen.has(option.id)) {
          fail(`${label}: opção ${index + 1} inválida.`);
        }
        seen.add(option.id);
        if (typeof option.label !== 'string' || !option.label.trim() || option.label.length > LIMITS.label) {
          fail(`${label}: a opção ${index + 1} precisa de um texto de até ${LIMITS.label} caracteres.`);
        }
        return { id: option.id, label: option.label.trim() };
      });
      return {
        text: text(data.text, label, { required: true }),
        options,
        variable: variable(data.variable, label),
        invalid_text: text(data.invalid_text, label)
      };
    }
    case 'question':
      if (data.input !== undefined && !INPUT_TYPES.includes(data.input)) fail(`${label}: tipo de resposta inválido.`);
      return {
        text: text(data.text, label, { required: true }),
        variable: variable(data.variable, label, { required: true }),
        input: data.input || 'text',
        invalid_text: text(data.invalid_text, label)
      };
    case 'condition':
      if (!OPERATORS.includes(data.operator)) fail(`${label}: escolha como comparar.`);
      if (data.value !== undefined && data.value !== null && (typeof data.value !== 'string' || data.value.length > LIMITS.value)) {
        fail(`${label}: valor de comparação inválido.`);
      }
      return { variable: variable(data.variable, label, { required: true }), operator: data.operator, value: data.value || '' };
    case 'transfer':
      return { text: text(data.text, label), to_sales: data.to_sales === true };
    case 'end':
      return { text: text(data.text, label) };
    default:
      return fail(`${label}: tipo de nó desconhecido.`);
  }
}

// Saidas validas de cada no: menu uma por opcao, condicao 'true'/'false',
// transferencia e encerramento nenhuma, os demais uma saida padrao (null).
function outputHandles(node) {
  if (node.type === 'menu') return node.data.options.map(option => option.id);
  if (node.type === 'condition') return ['true', 'false'];
  if (node.type === 'transfer' || node.type === 'end') return [];
  return [null];
}

function validateGraph(graph) {
  if (!graph || typeof graph !== 'object' || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    fail('Fluxo inválido.');
  }
  if (graph.nodes.length > LIMITS.nodes) fail(`O fluxo pode ter no máximo ${LIMITS.nodes} nós.`);
  if (graph.edges.length > LIMITS.edges) fail(`O fluxo pode ter no máximo ${LIMITS.edges} ligações.`);

  const nodes = [];
  const byId = new Map();
  for (const [index, raw] of graph.nodes.entries()) {
    const label = `Nó ${index + 1}`;
    if (!raw || typeof raw.id !== 'string' || !ID_PATTERN.test(raw.id) || byId.has(raw.id)) fail(`${label}: identificador inválido.`);
    if (!NODE_TYPES.includes(raw.type)) fail(`${label}: tipo de nó desconhecido.`);
    const x = Number(raw.position?.x);
    const y = Number(raw.position?.y);
    const node = {
      id: raw.id,
      type: raw.type,
      position: { x: Number.isFinite(x) ? Math.round(x) : 0, y: Number.isFinite(y) ? Math.round(y) : 0 },
      data: normalizeData(raw, label)
    };
    nodes.push(node);
    byId.set(node.id, node);
  }

  if (nodes.filter(node => node.type === 'start').length !== 1) fail('O fluxo precisa de exatamente um nó de Início.');

  const edges = [];
  const usedOutputs = new Set();
  for (const [index, raw] of graph.edges.entries()) {
    const label = `Ligação ${index + 1}`;
    const source = byId.get(raw?.source);
    const target = byId.get(raw?.target);
    if (!source || !target) fail(`${label}: liga nós inexistentes.`);
    if (target.type === 'start') fail(`${label}: nada pode apontar para o Início.`);
    if (source.id === target.id) fail(`${label}: um nó não pode ligar a si mesmo.`);
    const handle = raw.sourceHandle === undefined || raw.sourceHandle === '' ? null : raw.sourceHandle;
    if (!outputHandles(source).includes(handle)) fail(`${label}: saída inválida para este tipo de nó.`);
    const key = `${source.id}:${handle}`;
    if (usedOutputs.has(key)) fail(`${label}: cada saída pode ter apenas uma ligação.`);
    usedOutputs.add(key);
    const id = typeof raw.id === 'string' && raw.id.length <= 128 ? raw.id : `e-${source.id}-${handle || 'out'}`;
    edges.push({ id, source: source.id, sourceHandle: handle, target: target.id });
  }

  return { nodes, edges };
}

// Exigencias extras para ativar: o Inicio precisa levar a algum lugar.
function assertActivatable(graph) {
  const start = graph.nodes.find(node => node.type === 'start');
  if (!graph.edges.some(edge => edge.source === start.id)) fail('Ligue o Início ao primeiro passo antes de ativar o fluxo.');
}

function flowName(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > LIMITS.name) {
    fail(`O nome do fluxo deve ter entre 1 e ${LIMITS.name} caracteres.`);
  }
  return value.trim();
}

function defaultGraph() {
  return { nodes: [{ id: 'start', type: 'start', position: { x: 250, y: 50 }, data: {} }], edges: [] };
}

// ---------------------------------------------------------------------------
// Execucao
// ---------------------------------------------------------------------------

const normalizeText = value => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

function interpolate(template, variables, chat) {
  return String(template || '').replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (match, name) => {
    if (name === 'cliente') return chat.client_name || '';
    return variables[name] !== undefined ? String(variables[name]) : '';
  });
}

function menuText(node, variables, chat) {
  const options = node.data.options.map((option, index) => `${index + 1}. ${option.label}`).join('\n');
  return `${interpolate(node.data.text, variables, chat)}\n\n${options}`;
}

function matchMenuOption(node, answer) {
  const normalized = normalizeText(answer);
  const number = Number.parseInt(normalized, 10);
  if (String(number) === normalized && number >= 1 && number <= node.data.options.length) return node.data.options[number - 1];
  return node.data.options.find(option => normalizeText(option.label) === normalized) || null;
}

// Retorna o valor normalizado ou null se a resposta nao atende ao tipo pedido.
function parseAnswer(input, answer) {
  const value = String(answer || '').trim().slice(0, 1000);
  if (!value) return null;
  switch (input) {
    case 'number': {
      const number = Number(value.replace(/\s/g, '').replace(',', '.'));
      return Number.isFinite(number) ? String(number) : null;
    }
    case 'email':
      return /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(value) ? value.toLowerCase() : null;
    case 'phone': {
      const digits = value.replace(/\D/g, '');
      return digits.length >= 10 && digits.length <= 15 ? digits : null;
    }
    default:
      return value;
  }
}

function evaluateCondition(node, variables) {
  const current = variables[node.data.variable];
  const actual = normalizeText(current);
  const expected = normalizeText(node.data.value);
  switch (node.data.operator) {
    case 'equals': return actual === expected;
    case 'not_equals': return actual !== expected;
    case 'contains': return expected !== '' && actual.includes(expected);
    case 'is_empty': return actual === '';
    case 'not_empty': return actual !== '';
    case 'greater': return Number(current) > Number(node.data.value);
    case 'less': return Number(current) < Number(node.data.value);
    default: return false;
  }
}

function nextNodeId(graph, nodeId, handle = null) {
  return graph.edges.find(edge => edge.source === nodeId && (edge.sourceHandle ?? null) === handle)?.target || null;
}

const INVALID_ANSWER = 'Não entendi sua resposta. Por favor, tente novamente.';
const TOO_MANY_RETRIES = 'Vou encaminhar sua conversa para um de nossos atendentes.';

function saveSession(session, data) {
  return prisma.flowSession.update({ where: { id: session.id }, data });
}

function finishSession(session, variables, status) {
  return prisma.flowSession.update({
    where: { id: session.id },
    data: { status, variables, current_node_id: null, finished_at: new Date() }
  });
}

/**
 * Executa a partir de nodeId ate precisar de uma resposta do cliente ou terminar.
 * actions: { send(text), transfer({ toSales }) } fornecidos pelo chamador.
 */
async function runFrom(session, graph, nodeId, chat, actions) {
  const variables = { ...(session.variables || {}) };
  let currentId = nodeId;

  for (let step = 0; step < MAX_STEPS; step++) {
    const node = graph.nodes.find(candidate => candidate.id === currentId);
    if (!node) return finishSession(session, variables, 'finished');

    switch (node.type) {
      case 'start':
        currentId = nextNodeId(graph, node.id);
        break;
      case 'message':
        await actions.send(interpolate(node.data.text, variables, chat));
        currentId = nextNodeId(graph, node.id);
        break;
      case 'condition':
        currentId = nextNodeId(graph, node.id, evaluateCondition(node, variables) ? 'true' : 'false');
        break;
      case 'menu':
        await actions.send(menuText(node, variables, chat));
        return saveSession(session, { current_node_id: node.id, variables, retries: 0 });
      case 'question':
        await actions.send(interpolate(node.data.text, variables, chat));
        return saveSession(session, { current_node_id: node.id, variables, retries: 0 });
      case 'transfer':
        if (node.data.text) await actions.send(interpolate(node.data.text, variables, chat));
        await actions.transfer({ toSales: node.data.to_sales });
        return finishSession(session, variables, 'transferred');
      case 'end':
        if (node.data.text) await actions.send(interpolate(node.data.text, variables, chat));
        return finishSession(session, variables, 'finished');
      default:
        return finishSession(session, variables, 'finished');
    }

    if (!currentId) return finishSession(session, variables, 'finished');
  }

  // Protecao contra ciclos (ex.: condicoes apontando uma para a outra).
  console.error(`[Flow] Limite de passos atingido no fluxo ${session.flow_id}.`);
  return finishSession(session, variables, 'error');
}

// Processa a resposta do cliente no no que aguardava entrada.
async function answer(session, graph, chat, message, actions) {
  const node = graph.nodes.find(candidate => candidate.id === session.current_node_id);
  if (!node || (node.type !== 'menu' && node.type !== 'question')) {
    return finishSession(session, session.variables || {}, 'finished');
  }

  const variables = { ...(session.variables || {}) };
  let next = null;
  let accepted = false;

  if (node.type === 'menu') {
    const option = matchMenuOption(node, message);
    if (option) {
      accepted = true;
      if (node.data.variable) variables[node.data.variable] = option.label;
      next = nextNodeId(graph, node.id, option.id);
    }
  } else {
    const value = parseAnswer(node.data.input, message);
    if (value !== null) {
      accepted = true;
      variables[node.data.variable] = value;
      next = nextNodeId(graph, node.id);
    }
  }

  if (!accepted) {
    const retries = (session.retries || 0) + 1;
    if (retries >= MAX_RETRIES) {
      await actions.send(TOO_MANY_RETRIES);
      await actions.transfer({ toSales: false });
      return finishSession(session, variables, 'transferred');
    }
    const retryText = node.data.invalid_text || INVALID_ANSWER;
    await actions.send(node.type === 'menu' ? `${retryText}\n\n${menuText(node, variables, chat)}` : retryText);
    return saveSession(session, { retries });
  }

  const updated = await saveSession(session, { variables, retries: 0 });
  if (!next) return finishSession(updated, variables, 'finished');
  return runFrom(updated, graph, next, chat, actions);
}

// Mensagens da mesma conversa sao processadas em ordem, uma de cada vez.
const chatQueues = new Map();
function serialize(chatId, task) {
  const previous = chatQueues.get(chatId) || Promise.resolve();
  const run = previous.catch(() => {}).then(task);
  chatQueues.set(chatId, run);
  run.finally(() => { if (chatQueues.get(chatId) === run) chatQueues.delete(chatId); }).catch(() => {});
  return run;
}

/**
 * Chamado a cada mensagem recebida do cliente. Retorna true quando o fluxo
 * tratou a mensagem (a IA nao deve responder).
 *   isNewChat: a conversa acabou de ser criada (fluxos so comecam em conversas novas).
 */
function handleIncoming({ chat, message, isNewChat, actions }) {
  return serialize(chat.id, async () => {
    let session = await prisma.flowSession.findUnique({ where: { chat_id: chat.id } });

    if (session && session.status === 'active') {
      if (Date.now() - new Date(session.updated_at).getTime() > SESSION_TTL_MS) {
        await prisma.flowSession.update({ where: { id: session.id }, data: { status: 'expired', current_node_id: null, finished_at: new Date() } });
        return false;
      }
      const flow = session.flow_id ? await prisma.flow.findUnique({ where: { id: session.flow_id } }) : null;
      if (!flow) {
        await prisma.flowSession.update({ where: { id: session.id }, data: { status: 'cancelled', current_node_id: null, finished_at: new Date() } });
        return false;
      }
      await answer(session, flow.graph, chat, message, actions);
      return true;
    }

    if (session || !isNewChat) return false;

    const flow = await prisma.flow.findFirst({ where: { company_id: chat.company_id, is_active: true } });
    if (!flow) return false;

    session = await prisma.flowSession.create({
      data: { chat_id: chat.id, company_id: chat.company_id, flow_id: flow.id, flow_name: flow.name, status: 'active', variables: {} }
    });
    const start = flow.graph.nodes.find(node => node.type === 'start');
    await runFrom(session, flow.graph, start.id, chat, actions);
    return true;
  });
}

// Um atendente humano respondeu: o fluxo automatico para nesta conversa.
async function cancelForHuman(chatId) {
  await prisma.flowSession.updateMany({
    where: { chat_id: chatId, status: 'active' },
    data: { status: 'cancelled', current_node_id: null, finished_at: new Date() }
  });
}

module.exports = {
  FlowValidationError,
  NODE_TYPES,
  validateGraph,
  assertActivatable,
  flowName,
  defaultGraph,
  handleIncoming,
  cancelForHuman,
  // expostos para testes
  interpolate,
  parseAnswer,
  matchMenuOption,
  evaluateCondition
};
