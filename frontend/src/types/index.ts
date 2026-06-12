export interface User {
  id: string;
  name: string;
  username: string;
  role: 'superadmin' | 'admin' | 'supervisor' | 'seller' | 'support' | 'other';
  status: 'online' | 'offline';
  company_id: string;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  plan: string;
  max_instances: number;
  max_users: number;
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
  id: string;
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
}

export interface Settings {
  id: string;
  company_id: string;
  ai_enabled: boolean;
  ai_provider: 'mock' | 'gemini' | 'openai' | 'grok';
  gemini_key: string;
  openai_key: string;
  grok_key: string;
  gemini_model: string;
  openai_model: string;
  grok_model: string;
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
