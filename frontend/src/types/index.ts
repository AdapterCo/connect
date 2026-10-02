export interface User {
  requires_payment?: boolean;
  id: string;
  name: string;
  username: string;
  role: 'superadmin' | 'admin' | 'supervisor' | 'seller' | 'support' | 'other';
  sector?: 'sales' | 'support' | 'finance' | null;
  status: 'online' | 'offline';
  company_id: string;
  email?: string | null;
  phone?: string | null;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  plan: string;
  max_instances: number;
  max_users: number;
  max_products: number;
  mp_enabled: boolean;
  mp_access_token?: string;
  mp_public_key?: string;
}

export interface Instance {
  id: string;
  name: string;
  phone: string | null;
  status: 'connected' | 'disconnected' | 'qr' | 'connecting' | 'open';
  qr: string | null;
  user_id?: string | null;
}

export interface Message {
  id: string;
  chat_id: string;
  sender: 'client' | 'attendant' | 'system';
  sender_id?: string;
  text: string;
  timestamp: string;
  is_ai: boolean;
  is_note: boolean;
  is_scheduled: boolean;
  media_url?: string;
  media_type?: string;
  file_name?: string;
  payment_id?: string;
  payment_url?: string;
  payment_status?: string;
}

export interface Chat {
  history_has_more?: boolean;
  created_at: string;
  sales_reply_due_at?: string | null;
  id: string;
  remote_jid?: string | null;
  client_name: string;
  client_phone: string;
  status: 'iniciada' | 'interesse em compra' | 'finalizada';
  assigned_to: string | null;
  ai_active: boolean;
  tags: string[];
  is_favorite: boolean;
  is_archived: boolean;
  is_blocked: boolean;
  sector: 'sales' | 'support' | 'finance' | null;
  company_id: string;
  instance_id: string;
  waiting_since: string | null;
  claimed_at: string | null;
  messages: Message[];
  instance?: { id: string; name: string; phone: string | null; user_id?: string | null };
}

export interface Settings {
  id: string;
  company_id: string;
  ai_enabled: boolean;
  ai_provider: 'mock' | 'gemini' | 'openai' | 'groq' | 'grok';
  gemini_key: string;
  openai_key: string;
  grok_key: string;
  groq_key?: string;
  gemini_model: string;
  openai_model: string;
  grok_model: string;
  groq_model?: string;
  system_prompt: string;
  mp_enabled: boolean;
  mp_access_token: string;
  mp_public_key: string;
}

export interface Log {
  timestamp: string;
  message: string;
  company_id: string;
}

export interface Metric {
  type: 'response_time' | 'attendance_time';
  chat_id: string;
  attendant_id: string | null;
  is_ai: boolean;
  duration_seconds: number;
  timestamp: string;
}

export interface Statistics {
  kpis: {
    tmrGeral: number;
    tmrAi: number;
    tmrHumano: number;
    tmaGeral: number;
    totalChats: number;
    finishedChats: number;
  };
  attendants: AttendantStats[];
  sectors: {
    sales: number;
    support: number;
    finance: number;
    none: number;
  };
  status: {
    iniciada: number;
    interesse: number;
    finalizada: number;
  };
  history: DayHistory[];
}

export interface AttendantStats {
  id: string;
  name: string;
  role: string;
  status: string;
  repliesCount: number;
  tmr: number;
  tma: number;
  activeChats: number;
}

export interface DayHistory {
  label: string;
  fullDate: string;
  clientMessages: number;
  attendantMessages: number;
}

export interface ScheduledMessage {
  id: string;
  chatId: string;
  clientName: string;
  text: string | null;
  scheduledTime: string;
  mediaUrl: string | null;
  mediaType: string | null;
  fileName: string | null;
  created_by: string;
}

// Fluxos de atendimento (mesmo formato salvo pelo backend em Flow.graph).
export type FlowNodeType = 'start' | 'message' | 'menu' | 'question' | 'condition' | 'transfer' | 'end';
export type FlowInputType = 'text' | 'number' | 'email' | 'phone';
export type FlowOperator = 'equals' | 'not_equals' | 'contains' | 'is_empty' | 'not_empty' | 'greater' | 'less';

export interface FlowMenuOption {
  id: string;
  label: string;
}

export interface FlowNodeData {
  text?: string;
  options?: FlowMenuOption[];
  variable?: string | null;
  invalid_text?: string;
  input?: FlowInputType;
  operator?: FlowOperator;
  value?: string;
  to_sales?: boolean;
  [key: string]: unknown;
}

export interface FlowGraphNode {
  id: string;
  type: FlowNodeType;
  position: { x: number; y: number };
  data: FlowNodeData;
}

export interface FlowGraphEdge {
  id: string;
  source: string;
  sourceHandle: string | null;
  target: string;
}

export interface FlowSummary {
  id: string;
  name: string;
  is_active: boolean;
  node_count: number;
  updated_at: string;
}

export interface FlowDetail extends FlowSummary {
  graph: { nodes: FlowGraphNode[]; edges: FlowGraphEdge[] };
}

export interface FlowSessionInfo {
  flow_name: string;
  status: 'active' | 'finished' | 'transferred' | 'cancelled' | 'expired' | 'error';
  variables: Record<string, string>;
  started_at: string;
  finished_at: string | null;
}
