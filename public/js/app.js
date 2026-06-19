// App State
let state = {
  currentView: 'dashboard',
  chats: [],
  selectedChatId: null,
  settings: {},
  logs: [],
  whatsappStatus: {
    status: 'disconnected',
    qr: null,
    phone: null
  },
  whatsappInstances: [],
  activePairingInstanceId: null
};

// DOM Elements
const views = {
  dashboard: document.getElementById('view-dashboard'),
  crm: document.getElementById('view-crm'),
  kanban: document.getElementById('view-kanban'),
  'connect-whatsapp': document.getElementById('view-connect-whatsapp'),
  'config-ai': document.getElementById('view-config-ai'),
  'config-mp': document.getElementById('view-config-mp'),
  team: document.getElementById('view-team'),
  reports: document.getElementById('view-reports'),
  logs: document.getElementById('view-logs')
};

let messagesVolumeChartInstance = null;
let sectorDistributionChartInstance = null;

const navItems = document.querySelectorAll('.nav-item');
const viewTitle = document.getElementById('view-title');
const headerAiBadge = document.getElementById('header-ai-badge');

// -------------------------------------------------------------
// Initialization & Navigation
// -------------------------------------------------------------
let socket;
let currentUser = null;
let currentFilter = 'my';
let allUsers = [];
let inputMode = 'msg'; // 'msg' or 'note'

document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('crm_token');
  const userJson = localStorage.getItem('crm_user');
  if (!token || !userJson) {
    window.location.href = 'login.html';
    return;
  }

  currentUser = JSON.parse(userJson);
  state.settings = {};

  setupNavigation();
  loadSettings();
  loadChats();
  loadLogs();
  loadWhatsAppStatus();
  loadAllUsers();
  setupEventListeners();
  setupAttendantUI();

  socket = io({
    auth: {
      token
    }
  });

  socket.on('connect', () => {
    if (currentUser && currentUser.company_id) {
      socket.emit('join_company', currentUser.company_id);
    }
  });

  socket.on('chats_updated', (chats) => {
    state.chats = chats;
    renderClientList();
    updateDashboardStats();
    if (state.currentView === 'kanban') {
      renderKanban();
    }
    if (state.selectedChatId) {
      const updatedChat = state.chats.find(c => c.id === state.selectedChatId);
      if (updatedChat) {
        renderActiveChat(updatedChat);
      }
    }
  });

  socket.on('chat_updated', (chat) => {
    if (!chat || !chat.id) return;

    const idx = state.chats.findIndex(c => c.id === chat.id);
    if (idx >= 0) {
      state.chats[idx] = chat;
    } else {
      state.chats.push(chat);
    }

    renderClientList();
    updateDashboardStats();
    if (state.currentView === 'kanban') {
      renderKanban();
    }
    if (state.selectedChatId === chat.id) {
      renderActiveChat(chat);
      renderActiveChatHeader(chat);
    }
  });

  socket.on('logs_updated', (logs) => {
    state.logs = logs;
    renderLogs();
    renderDashboardLogs();
  });

  socket.on('whatsapp_status_updated', (data) => {
    console.log('[SOCKET] whatsapp_status_updated:', data);
    
    if (state.whatsappInstances) {
      const idx = state.whatsappInstances.findIndex(i => i.id === data.instanceId);
      if (idx !== -1) {
        state.whatsappInstances[idx].status = data.status;
        state.whatsappInstances[idx].qr = data.qr;
        state.whatsappInstances[idx].phone = data.phone;
      }
    }
    
    if (!state.whatsappStatus || data.instanceId === 'inst_default' || (state.whatsappInstances && state.whatsappInstances[0]?.id === data.instanceId)) {
      state.whatsappStatus = {
        status: data.status,
        qr: data.qr,
        phone: data.phone
      };
    }
    
    updateWhatsAppConnectionUI();
    
    const qrModal = document.getElementById('instance-qr-modal');
    if (qrModal && qrModal.classList.contains('active') && state.activePairingInstanceId === data.instanceId) {
      const loadingDiv = document.getElementById('instance-qr-loading');
      const displayDiv = document.getElementById('instance-qr-display');
      const qrImg = document.getElementById('instance-qr-img');
      const qrStatus = document.getElementById('instance-qr-status');
      
      if (data.status === 'connecting') {
        loadingDiv.style.display = 'block';
        displayDiv.style.display = 'none';
      } else if (data.status === 'qr') {
        loadingDiv.style.display = 'none';
        displayDiv.style.display = 'block';
        if (data.qr) {
          qrImg.src = data.qr;
        }
        qrStatus.innerText = 'Aguardando leitura...';
      } else if (data.status === 'open' || data.status === 'connected') {
        loadingDiv.style.display = 'none';
        displayDiv.style.display = 'block';
        qrImg.src = '';
        qrStatus.innerText = 'Conectado!';
        qrStatus.style.color = 'var(--status-finalizada)';
        
        setTimeout(() => {
          qrModal.classList.remove('active');
        }, 2000);
      } else if (data.status === 'disconnected') {
        qrStatus.innerText = 'Conectando/Aguardando QR...';
        qrStatus.style.color = '#ef4444';
      }
    }
  });

  socket.on('users_updated', (users) => {
    allUsers = users;
    renderUsersList();
    if (state.selectedChatId) {
      const activeChat = state.chats.find(c => c.id === state.selectedChatId);
      if (activeChat) renderActiveChatHeader(activeChat);
    }
  });
});

async function loadWhatsAppStatus() {
  try {
    const res = await fetch('/api/instances', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('crm_token')}` }
    });
    if (res.ok) {
      state.whatsappInstances = await res.json();
      
      if (state.whatsappInstances.length > 0) {
        state.whatsappStatus = {
          status: state.whatsappInstances[0].status,
          qr: state.whatsappInstances[0].qr,
          phone: state.whatsappInstances[0].phone
        };
      } else {
        state.whatsappStatus = {
          status: 'disconnected',
          qr: null,
          phone: null
        };
      }
      
      updateWhatsAppConnectionUI();
    }
  } catch (err) {
    console.warn('Error loading WhatsApp status:', err);
  }
}

async function loadSettings() {
  try {
    const response = await fetch('/api/settings', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('crm_token')}` }
    });
    if (!response.ok) throw new Error('Failed to fetch settings');
    
    state.settings = await response.json();
    populateSettingsForm();
    updateHeaderBadge();
  } catch (error) {
    console.error('Error loading settings:', error);
    showToast('Erro ao carregar configurações do servidor', 'error');
  }
}

async function loadChats() {
  try {
    const response = await fetch('/api/chats', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('crm_token')}` }
    });
    if (!response.ok) throw new Error('Failed to fetch chats');
    
    state.chats = await response.json();
    renderClientList();
    updateDashboardStats();
  } catch (error) {
    console.error('Error loading chats:', error);
  }
}

async function loadLogs() {
  try {
    const response = await fetch('/api/logs', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('crm_token')}` }
    });
    if (!response.ok) throw new Error('Failed to fetch logs');
    
    state.logs = await response.json();
    renderLogs();
    renderDashboardLogs();
  } catch (error) {
    console.error('Error loading logs:', error);
  }
}

function setupNavigation() {
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const viewName = item.getAttribute('data-view');
      switchView(viewName);
      
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');
    });
  });
}

function switchView(viewName) {
  state.currentView = viewName;
  
  Object.keys(views).forEach(key => {
    if (key === viewName) {
      views[key].classList.add('active');
    } else {
      views[key].classList.remove('active');
    }
  });

  const titles = {
    dashboard: 'Dashboard / Resumo',
    crm: 'CRM / Gestão de Conversas',
    kanban: 'Pipeline de Vendas (Kanban)',
    'connect-whatsapp': 'Conectar WhatsApp Real',
    'config-ai': 'Configurações de Inteligência Artificial',
    'config-mp': 'Integração Mercado Pago',
    team: 'Gestão de Equipe (Membros)',
    reports: 'Relatórios / Métricas Analíticas',
    logs: 'Terminal de Operações'
  };
  viewTitle.innerText = titles[viewName] || 'Painel de Controle';

  if (viewName === 'dashboard') {
    updateDashboardStats();
    loadLogs();
  } else if (viewName === 'logs') {
    loadLogs();
  } else if (viewName === 'connect-whatsapp') {
    loadWhatsAppStatus();
  } else if (viewName === 'kanban') {
    renderKanban();
  } else if (viewName === 'team') {
    loadAllUsers();
  } else if (viewName === 'reports') {
    loadReportsData();
  }
}

// Render Helpers
// -------------------------------------------------------------

function updateWhatsAppConnectionUI() {
  const grid = document.getElementById('whatsapp-instances-grid');
  if (!grid) return;

  grid.innerHTML = '';

  const instances = state.whatsappInstances || [];

  if (instances.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted);">
        <p style="font-size: 15px; margin-bottom: 8px;">Nenhuma conexão cadastrada.</p>
        <p style="font-size: 13px; color: var(--text-dimmed);">Use o formulário acima para adicionar um novo chip de WhatsApp.</p>
      </div>
    `;
    return;
  }

  instances.forEach(inst => {
    let statusClass = 'offline';
    let statusLabel = 'Desconectado';
    let statusBadgeClass = 'status-badge-disconnected';
    
    if (inst.status === 'connected' || inst.status === 'open') {
      statusClass = 'online';
      statusLabel = 'Conectado';
      statusBadgeClass = 'status-badge-connected';
    } else if (inst.status === 'connecting') {
      statusClass = 'connecting';
      statusLabel = 'Conectando';
      statusBadgeClass = 'status-badge-connecting';
    } else if (inst.status === 'qr') {
      statusClass = 'qr';
      statusLabel = 'Aguardando QR';
      statusBadgeClass = 'status-badge-qr';
    }

    const card = document.createElement('div');
    card.className = `instance-card ${statusClass}`;
    
    const phoneText = inst.phone ? `+${inst.phone}` : 'Não pareado';
    
    let actionBtnHtml = '';
    if (inst.status === 'connected' || inst.status === 'open') {
      actionBtnHtml = `
        <button class="instance-btn instance-btn-disconnect" data-id="${inst.id}">
          🔌 Desconectar
        </button>
      `;
    } else {
      actionBtnHtml = `
        <button class="instance-btn instance-btn-connect" data-id="${inst.id}">
          ⚡ Conectar
        </button>
      `;
    }

    card.innerHTML = `
      <div class="instance-header">
        <div class="instance-title">${escapeHTML(inst.name)}</div>
        <div class="instance-status-badge ${statusBadgeClass}">${statusLabel}</div>
      </div>
      <div class="instance-info">
        <div class="instance-info-item">
          <span class="instance-info-label">ID da Conexão:</span>
          <span class="instance-info-value" style="font-family: monospace;">${inst.id}</span>
        </div>
        <div class="instance-info-item">
          <span class="instance-info-label">Número de Telefone:</span>
          <span class="instance-info-value">${phoneText}</span>
        </div>
      </div>
      <div class="instance-actions">
        ${actionBtnHtml}
        <button class="instance-btn instance-btn-delete" data-id="${inst.id}" title="Excluir Conexão">
          🗑️
        </button>
      </div>
    `;

    // Listeners for actions
    const connectBtn = card.querySelector('.instance-btn-connect');
    if (connectBtn) {
      connectBtn.addEventListener('click', () => handleConnectInstance(inst.id, inst.name));
    }

    const disconnectBtn = card.querySelector('.instance-btn-disconnect');
    if (disconnectBtn) {
      disconnectBtn.addEventListener('click', () => handleDisconnectInstance(inst.id));
    }

    const deleteBtn = card.querySelector('.instance-btn-delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => handleDeleteInstance(inst.id, inst.name));
    }

    grid.appendChild(card);
  });
}

function populateSettingsForm() {
  document.getElementById('ai-enabled-toggle').checked = !!state.settings.ai_enabled;
  const aiProvider = state.settings.ai_provider === 'grok' ? 'groq' : (state.settings.ai_provider || 'mock');
  document.getElementById('ai-provider-select').value = aiProvider;
  document.getElementById('gemini-key-input').value = state.settings.gemini_key || '';
  document.getElementById('openai-key-input').value = state.settings.openai_key || '';
  document.getElementById('grok-key-input').value = state.settings.groq_key || state.settings.grok_key || '';
  document.getElementById('system-prompt-input').value = state.settings.system_prompt || '';

  // Model names
  document.getElementById('gemini-model-input').value = state.settings.gemini_model || 'gemini-1.5-flash';
  document.getElementById('openai-model-input').value = state.settings.openai_model || 'gpt-4o-mini';
  document.getElementById('grok-model-input').value = state.settings.groq_model || state.settings.grok_model || 'llama-3.3-70b-versatile';

  document.getElementById('mp-enabled-toggle').checked = !!state.settings.mp_enabled;
  document.getElementById('mp-access-token-input').value = state.settings.mp_access_token || '';

  handleAiProviderFields();
}

function handleAiProviderFields() {
  const provider = document.getElementById('ai-provider-select').value;
  document.querySelectorAll('.key-field').forEach(el => el.style.display = 'none');
  
  if (provider === 'gemini') {
    document.getElementById('gemini-key-group').style.display = 'block';
    document.getElementById('gemini-model-group').style.display = 'block';
  } else if (provider === 'openai') {
    document.getElementById('openai-key-group').style.display = 'block';
    document.getElementById('openai-model-group').style.display = 'block';
  } else if (provider === 'groq') {
    document.getElementById('grok-key-group').style.display = 'block';
    document.getElementById('grok-model-group').style.display = 'block';
  }
}

function updateHeaderBadge() {
  if (state.settings.ai_enabled) {
    headerAiBadge.innerText = 'Atendente Virtual: ATIVADO';
    headerAiBadge.className = 'badge-ai-status active';
  } else {
    headerAiBadge.innerText = 'Atendente Virtual: DESATIVADO';
    headerAiBadge.className = 'badge-ai-status inactive';
  }
}

function updateDashboardStats() {
  const total = state.chats.length;
  const iniciada = state.chats.filter(c => c.status === 'iniciada').length;
  const interesse = state.chats.filter(c => c.status === 'interesse em compra').length;
  const finalizada = state.chats.filter(c => c.status === 'finalizada').length;

  document.getElementById('stat-total-chats').innerText = total;
  document.getElementById('stat-status-iniciada').innerText = iniciada;
  document.getElementById('stat-status-interesse').innerText = interesse;
  document.getElementById('stat-status-finalizada').innerText = finalizada;

  const maxVal = Math.max(iniciada, interesse, finalizada, 1);
  
  document.getElementById('bar-iniciada').style.height = `${(iniciada / maxVal) * 100}%`;
  document.getElementById('bar-interesse').style.height = `${(interesse / maxVal) * 100}%`;
  document.getElementById('bar-finalizada').style.height = `${(finalizada / maxVal) * 100}%`;
}

function renderClientList() {
  const listContainer = document.getElementById('crm-client-list');
  const searchInput = document.getElementById('crm-search-input').value.toLowerCase();
  
  listContainer.innerHTML = '';
  
  let filteredChats = state.chats;

  // Search Filter
  if (searchInput) {
    filteredChats = filteredChats.filter(chat => 
      chat.client_name.toLowerCase().includes(searchInput) || 
      chat.client_phone.includes(searchInput)
    );
  }

  // Sector Filter
  const sectorFilter = document.getElementById('crm-sector-filter').value;
  if (sectorFilter) {
    if (sectorFilter === 'none') {
      filteredChats = filteredChats.filter(chat => !chat.sector);
    } else {
      filteredChats = filteredChats.filter(chat => chat.sector === sectorFilter);
    }
  }

  // Filter out archived chats for default views (Meus, Fila, Todos)
  if (currentFilter !== 'archive') {
    filteredChats = filteredChats.filter(chat => !chat.is_archived);
  }

  // Current filter tabs
  if (currentFilter === 'my') {
    filteredChats = filteredChats.filter(chat => chat.assigned_to === currentUser.id);
  } else if (currentFilter === 'queue') {
    filteredChats = filteredChats.filter(chat => chat.assigned_to === null);
  } else if (currentFilter === 'favorite') {
    filteredChats = filteredChats.filter(chat => chat.is_favorite);
  } else if (currentFilter === 'archive') {
    filteredChats = filteredChats.filter(chat => chat.is_archived);
  }
  // 'all' tab shows everything

  if (filteredChats.length === 0) {
    listContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-dimmed); font-size:13px;">Nenhuma conversa nesta aba</div>';
    return;
  }

  filteredChats.forEach(chat => {
    const item = document.createElement('div');
    item.className = `client-item ${state.selectedChatId === chat.id ? 'active' : ''}`;
    item.setAttribute('data-id', chat.id);
    
    let statusClass = 'iniciada';
    if (chat.status === 'interesse em compra') statusClass = 'interesse';
    if (chat.status === 'finalizada') statusClass = 'finalizada';

    const lastMsg = chat.messages.length > 0 ? chat.messages[chat.messages.length - 1].text : 'Nenhuma mensagem';
    const cleanLastMsg = lastMsg.length > 30 ? lastMsg.substring(0, 30) + '...' : lastMsg;

    item.innerHTML = `
      <div class="client-avatar">${chat.client_name.charAt(0).toUpperCase()}</div>
      <div class="client-details">
        <div class="client-meta">
          <span class="client-name">${chat.client_name}</span>
          <span class="client-status-dot ${statusClass}" title="${chat.status}"></span>
        </div>
        <div class="client-phone" style="display:flex; justify-content:space-between; align-items:center;">
          <span>+${chat.client_phone}</span>
          <span style="font-size:10px; color:var(--text-dimmed); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:110px;">${cleanLastMsg}</span>
        </div>
      </div>
    `;

    item.addEventListener('click', () => {
      selectChat(chat.id);
    });

    listContainer.appendChild(item);
  });
}

function selectChat(chatId) {
  state.selectedChatId = chatId;
  
  document.querySelectorAll('.client-item').forEach(el => {
    if (el.getAttribute('data-id') === chatId) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  const chat = state.chats.find(c => c.id === chatId);
  if (!chat) return;

  document.getElementById('chat-empty-state').style.display = 'none';
  document.getElementById('chat-active-state').style.display = 'flex';

  document.getElementById('chat-header-name').innerText = chat.client_name;
  document.getElementById('chat-header-phone').innerText = `+${chat.client_phone}`;
  document.getElementById('chat-header-avatar').innerText = chat.client_name.charAt(0).toUpperCase();
  document.getElementById('chat-status-select').value = chat.status;
  document.getElementById('chat-sector-select').value = chat.sector || '';

  renderActiveChatHeader(chat);
  renderActiveChat(chat);
}

function renderActiveChat(chat) {
  try {
    const container = document.getElementById('chat-messages-container');
    if (!container) return;
    container.innerHTML = '';

    if (!chat || !Array.isArray(chat.messages)) return;

    chat.messages.forEach(msg => {
      try {
        const bubble = document.createElement('div');
        
        let senderClass = 'system';
        if (msg.sender === 'client') senderClass = 'client';
        if (msg.sender === 'attendant') {
          senderClass = `attendant ${msg.is_ai ? 'is-ai' : ''}`;
          if (msg.is_note) {
            senderClass = 'team-note';
          }
        }
        
        const msgText = msg.text || '';
        if (msg.sender === 'system' && msgText.includes('aprovado')) {
          senderClass = 'system approved';
        }

        bubble.className = `message-bubble ${senderClass}`;
        
        let content = '';
        if (msg.is_note) {
          content = `
            <div style="font-weight: 700; font-size: 11px; text-transform: uppercase; color: #eab308; margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
              📌 Nota Interna (Privada)
            </div>
            <div style="color: #fff;">${escapeHtml(msgText)}</div>
          `;
        } else if (msg.payment_url) {
          const isApproved = msg.payment_status === 'approved';
          const statusText = isApproved ? '✅ Pago' : '⏳ Aguardando Pagamento';
          
          const cleanedText = msgText.split(' Link para pagar: ')[0].split(' Clique no link para pagar: ')[0] || msgText;
          content = `
            <div style="font-weight:600; margin-bottom: 4px;">💳 Fatura Mercado Pago</div>
            <div>${cleanedText}</div>
            <div style="margin-top:8px; font-weight: bold; color: ${isApproved ? 'var(--status-finalizada)' : 'var(--status-interesse)'};">${statusText}</div>
          `;

          if (!isApproved) {
            content += `
              <div style="margin-top:10px; display:flex; gap:8px; align-items:center;">
                <a href="${msg.payment_url}" target="_blank" class="payment-link-btn" style="margin-top:0;">Pagar Conta</a>
                <button onclick="checkPaymentStatus('${chat.id}')" class="check-payment-btn">Verificar Status</button>
              </div>
            `;
          }
        } else {
          content = escapeHtml(msgText);
        }

        if (msg.media_url) {
          let mediaHtml = '';
          if (msg.media_type === 'image') {
            mediaHtml = `<a href="${msg.media_url}" target="_blank"><img src="${msg.media_url}" class="message-media-img" alt="Imagem"></a>`;
          } else if (msg.media_type === 'video') {
            mediaHtml = `<video src="${msg.media_url}" controls class="message-media-video"></video>`;
          } else if (msg.media_type === 'audio') {
            mediaHtml = `<audio src="${msg.media_url}" controls class="message-media-audio"></audio>`;
          } else {
            const fname = msg.file_name || 'Arquivo';
            mediaHtml = `
              <a href="${msg.media_url}" target="_blank" class="message-media-doc" download="${fname}">
                <div class="message-media-doc-icon">📁</div>
                <div class="message-media-doc-info">
                  <div class="message-media-doc-name">${escapeHtml(fname)}</div>
                  <div class="message-media-doc-size">Clique para baixar</div>
                </div>
              </a>
            `;
          }
          if (content) {
            content = `<div>${content}</div><div style="margin-top:6px;">${mediaHtml}</div>`;
          } else {
            content = mediaHtml;
          }
        }

        const timestampStr = msg.timestamp || new Date().toISOString();
        const time = new Date(timestampStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        bubble.innerHTML = `
          <div>${content}</div>
          <div class="message-info">
            <span>${time}</span>
            ${msg.is_ai ? '<span class="badge-ai-indicator">Virtual AI</span>' : ''}
          </div>
        `;
        
        container.appendChild(bubble);
      } catch (innerErr) {
        console.error('Error rendering message bubble:', innerErr, msg);
      }
    });

    container.scrollTop = container.scrollHeight;
    setTimeout(() => {
      container.scrollTop = container.scrollHeight;
    }, 50);
  } catch (err) {
    console.error('Error in renderActiveChat:', err);
  }
}

function renderLogs() {
  const container = document.getElementById('logs-container');
  container.innerHTML = '';

  if (state.logs.length === 0) {
    container.innerHTML = '<div style="color:var(--text-dimmed);">Nenhum log registrado ainda...</div>';
    return;
  }

  state.logs.forEach(log => {
    const time = new Date(log.timestamp).toLocaleTimeString();
    const line = document.createElement('div');
    line.className = 'log-line';
    line.innerHTML = `
      <span class="log-time">[${time}]</span>
      <span class="log-msg">${escapeHtml(log.message)}</span>
    `;
    container.appendChild(line);
  });
}

function renderDashboardLogs() {
  const container = document.getElementById('dashboard-recent-logs');
  container.innerHTML = '';

  const recent = state.logs.slice(0, 10);
  if (recent.length === 0) {
    container.innerHTML = '<div style="color:var(--text-dimmed); font-size:13px; text-align:center; padding-top:40px;">Sem atividades recentes</div>';
    return;
  }

  recent.forEach(log => {
    const time = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const item = document.createElement('div');
    item.style.fontSize = '13px';
    item.style.padding = '8px 12px';
    item.style.backgroundColor = 'rgba(255,255,255,0.02)';
    item.style.border = '1px solid var(--border-color)';
    item.style.borderRadius = '6px';
    item.style.display = 'flex';
    item.style.gap = '8px';
    
    item.innerHTML = `
      <span style="color: var(--primary); font-weight:600; white-space:nowrap;">${time}</span>
      <span style="color: var(--text-main);">${escapeHtml(log.message)}</span>
    `;
    container.appendChild(item);
  });
}

// -------------------------------------------------------------
// Interactive & Operations Event Handlers
// -------------------------------------------------------------

function setupEventListeners() {
  document.getElementById('ai-provider-select').addEventListener('change', handleAiProviderFields);
  document.getElementById('save-ai-settings-btn').addEventListener('click', saveAiSettings);
  document.getElementById('save-mp-settings-btn').addEventListener('click', saveMpSettings);
  document.getElementById('clear-logs-btn').addEventListener('click', clearLogs);

  // Reports CSV Export
  const exportBtn = document.getElementById('export-reports-csv-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportReportsCSV);
  }

  // Rich Media Attachment Trigger
  document.getElementById('chat-attach-btn').addEventListener('click', () => {
    if (!state.selectedChatId) return;
    document.getElementById('chat-file-input').click();
  });

  // Rich Media File Upload & Send
  document.getElementById('chat-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || !state.selectedChatId) return;

    const formData = new FormData();
    formData.append('file', file);

    showToast('Enviando arquivo/mídia...', 'info');

    try {
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('crm_token')}` },
        body: formData
      });

      if (!uploadRes.ok) throw new Error('Upload falhou');

      const data = await uploadRes.json();
      const mediaType = file.type.startsWith('image/') ? 'image' : 
                        file.type.startsWith('video/') ? 'video' : 
                        file.type.startsWith('audio/') ? 'audio' : 'document';

      const sendRes = await fetch(`/api/chats/${encodeURIComponent(state.selectedChatId)}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('crm_token')}`
        },
        body: JSON.stringify({
          text: '',
          mediaUrl: data.url,
          mediaType: mediaType,
          fileName: file.name
        })
      });

      if (sendRes.ok) {
        showToast('Mídia enviada com sucesso!', 'success');
        await loadChats();
        const updated = state.chats.find(c => c.id === state.selectedChatId);
        if (updated) renderActiveChat(updated);
      } else {
        throw new Error('Falha no envio');
      }
    } catch (err) {
      showToast('Erro ao enviar mídia/arquivo.', 'error');
    } finally {
      e.target.value = '';
    }
  });

  // Schedule Modal Actions
  const scheduleModal = document.getElementById('schedule-message-modal');
  document.getElementById('chat-schedule-btn').addEventListener('click', () => {
    if (!state.selectedChatId) return;
    
    const now = new Date();
    now.setHours(now.getHours() + 1);
    const offset = now.getTimezoneOffset();
    const localTime = new Date(now.getTime() - (offset * 60 * 1000));
    document.getElementById('modal-schedule-time').value = localTime.toISOString().slice(0, 16);
    document.getElementById('modal-schedule-text').value = '';
    document.getElementById('modal-schedule-file-name').innerText = 'Nenhum arquivo selecionado';
    document.getElementById('modal-schedule-media-url').value = '';
    document.getElementById('modal-schedule-media-type').value = '';
    
    scheduleModal.classList.add('active');
  });

  document.getElementById('modal-schedule-close-btn').addEventListener('click', () => {
    scheduleModal.classList.remove('active');
  });
  document.getElementById('modal-schedule-cancel-btn').addEventListener('click', () => {
    scheduleModal.classList.remove('active');
  });

  document.getElementById('modal-schedule-upload-btn').addEventListener('click', () => {
    document.getElementById('modal-schedule-file-input').click();
  });

  document.getElementById('modal-schedule-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const label = document.getElementById('modal-schedule-file-name');
    label.innerText = 'Enviando...';

    const formData = new FormData();
    formData.append('file', file);

    try {
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('crm_token')}` },
        body: formData
      });

      if (!uploadRes.ok) throw new Error('Upload falhou');

      const data = await uploadRes.json();
      const mediaType = file.type.startsWith('image/') ? 'image' : 
                        file.type.startsWith('video/') ? 'video' : 
                        file.type.startsWith('audio/') ? 'audio' : 'document';

      document.getElementById('modal-schedule-media-url').value = data.url;
      document.getElementById('modal-schedule-media-type').value = mediaType;
      label.innerText = file.name;
      showToast('Arquivo anexado ao agendamento.', 'success');
    } catch (err) {
      label.innerText = 'Falha no upload';
      showToast('Erro ao anexar arquivo ao agendamento.', 'error');
    }
  });

  document.getElementById('modal-schedule-save-btn').addEventListener('click', async () => {
    const timeVal = document.getElementById('modal-schedule-time').value;
    const textVal = document.getElementById('modal-schedule-text').value.trim();
    const mediaUrl = document.getElementById('modal-schedule-media-url').value;
    const mediaType = document.getElementById('modal-schedule-media-type').value;
    const labelFileName = document.getElementById('modal-schedule-file-name').innerText;
    const fileName = (labelFileName !== 'Nenhum arquivo selecionado' && labelFileName !== 'Enviando...') ? labelFileName : null;

    if (!timeVal) {
      showToast('Defina a data e hora do agendamento.', 'warning');
      return;
    }

    if (!textVal && !mediaUrl) {
      showToast('Digite uma mensagem ou anexe uma mídia para agendar.', 'warning');
      return;
    }

    try {
      const res = await fetch(`/api/chats/${encodeURIComponent(state.selectedChatId)}/schedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('crm_token')}`
        },
        body: JSON.stringify({
          text: textVal,
          scheduledTime: new Date(timeVal).toISOString(),
          mediaUrl,
          mediaType,
          fileName
        })
      });

      if (res.ok) {
        showToast('Mensagem agendada com sucesso!', 'success');
        scheduleModal.classList.remove('active');
      } else {
        const err = await res.json();
        showToast(err.error || 'Erro ao agendar mensagem.', 'error');
      }
    } catch (err) {
      showToast('Erro de conexão ao salvar agendamento.', 'error');
    }
  });

  // View Scheduled Modal Actions
  const viewScheduledModal = document.getElementById('view-scheduled-modal');
  document.getElementById('chat-view-scheduled-btn').addEventListener('click', async () => {
    if (!state.selectedChatId) return;
    await loadScheduledMessages(state.selectedChatId);
    viewScheduledModal.classList.add('active');
  });

  document.getElementById('modal-view-sch-close-btn').addEventListener('click', () => {
    viewScheduledModal.classList.remove('active');
  });
  document.getElementById('modal-view-sch-close-btn2').addEventListener('click', () => {
    viewScheduledModal.classList.remove('active');
  });

  // Send Manual CRM Message
  document.getElementById('chat-send-btn').addEventListener('click', sendManualMessage);
  document.getElementById('chat-message-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendManualMessage();
    }
  });

  // Client manual status select dropdown change
  document.getElementById('chat-status-select').addEventListener('change', updateClientStatus);

  // Sector filter change
  document.getElementById('crm-sector-filter').addEventListener('change', renderClientList);

  // Add Client Modal Actions
  const addModal = document.getElementById('add-client-modal');
  document.getElementById('crm-add-client-btn').addEventListener('click', () => {
    addModal.classList.add('active');
  });
  document.getElementById('modal-close-btn').addEventListener('click', () => {
    addModal.classList.remove('active');
  });
  document.getElementById('modal-cancel-btn').addEventListener('click', () => {
    addModal.classList.remove('active');
  });
  document.getElementById('modal-save-btn').addEventListener('click', saveNewClient);

  // Charge Modal Actions
  const chargeModal = document.getElementById('manual-charge-modal');
  document.getElementById('chat-quick-charge-btn').addEventListener('click', () => {
    if (!state.selectedChatId) return;
    chargeModal.classList.add('active');
  });
  document.getElementById('modal-charge-close-btn').addEventListener('click', () => {
    chargeModal.classList.remove('active');
  });
  document.getElementById('modal-charge-cancel-btn').addEventListener('click', () => {
    chargeModal.classList.remove('active');
  });
  document.getElementById('modal-charge-save-btn').addEventListener('click', generateManualCharge);

  // WhatsApp Multi-Instance Event Listeners
  const addInstanceBtn = document.getElementById('add-instance-btn');
  const newInstanceNameInput = document.getElementById('new-instance-name');
  
  if (addInstanceBtn) {
    addInstanceBtn.addEventListener('click', async () => {
      const name = newInstanceNameInput.value.trim();
      if (!name) {
        showToast('Por favor, informe o nome identificador da conexão.', 'error');
        return;
      }
      
      try {
        addInstanceBtn.disabled = true;
        addInstanceBtn.innerText = 'Adicionando...';
        
        const res = await fetch('/api/instances', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('crm_token')}`
          },
          body: JSON.stringify({ name })
        });
        
        if (res.ok) {
          showToast('Conexão cadastrada com sucesso!', 'success');
          newInstanceNameInput.value = '';
          loadWhatsAppStatus();
        } else {
          const data = await res.json();
          throw new Error(data.error || 'Erro ao cadastrar conexão.');
        }
      } catch (err) {
        console.error('Error adding instance:', err);
        showToast(err.message, 'error');
      } finally {
        addInstanceBtn.disabled = false;
        addInstanceBtn.innerText = '➕ Adicionar Conexão';
      }
    });
  }

  const qrCloseBtn = document.getElementById('instance-qr-close-btn');
  const qrModal = document.getElementById('instance-qr-modal');
  
  if (qrCloseBtn && qrModal) {
    qrCloseBtn.addEventListener('click', () => {
      qrModal.classList.remove('active');
      state.activePairingInstanceId = null;
    });
    
    qrModal.addEventListener('click', (e) => {
      if (e.target === qrModal) {
        qrModal.classList.remove('active');
        state.activePairingInstanceId = null;
      }
    });
  }

  // Input Mode Toggles (Message vs Note)
  document.getElementById('mode-msg-btn').addEventListener('click', () => {
    inputMode = 'msg';
    document.getElementById('mode-msg-btn').classList.add('active');
    document.getElementById('mode-msg-btn').style.background = 'rgba(99, 102, 241, 0.15)';
    document.getElementById('mode-msg-btn').style.borderColor = 'var(--primary)';
    document.getElementById('mode-msg-btn').style.color = '#fff';
    
    document.getElementById('mode-note-btn').classList.remove('active');
    document.getElementById('mode-note-btn').style.background = 'rgba(255,255,255,0.03)';
    document.getElementById('mode-note-btn').style.borderColor = 'var(--border-color)';
    document.getElementById('mode-note-btn').style.color = 'var(--text-muted)';
    
    document.getElementById('chat-message-input').placeholder = "Digite uma resposta manual (enviará diretamente para o WhatsApp real)...";
  });

  document.getElementById('mode-note-btn').addEventListener('click', () => {
    inputMode = 'note';
    document.getElementById('mode-note-btn').classList.add('active');
    document.getElementById('mode-note-btn').style.background = 'rgba(234, 179, 8, 0.15)';
    document.getElementById('mode-note-btn').style.borderColor = '#eab308';
    document.getElementById('mode-note-btn').style.color = '#fff';
    
    document.getElementById('mode-msg-btn').classList.remove('active');
    document.getElementById('mode-msg-btn').style.background = 'rgba(255,255,255,0.03)';
    document.getElementById('mode-msg-btn').style.borderColor = 'var(--border-color)';
    document.getElementById('mode-msg-btn').style.color = 'var(--text-muted)';
    
    document.getElementById('chat-message-input').placeholder = "Digite uma nota interna (visível apenas para a equipe local)...";
  });

  // Tags Modal Handlers
  const tagModal = document.getElementById('add-tag-modal');
  document.getElementById('add-tag-btn').addEventListener('click', () => {
    if (!state.selectedChatId) return;
    document.getElementById('modal-tag-name').value = '';
    tagModal.classList.add('active');
  });

  document.getElementById('modal-tag-close-btn').addEventListener('click', () => {
    tagModal.classList.remove('active');
  });

  document.getElementById('modal-tag-cancel-btn').addEventListener('click', () => {
    tagModal.classList.remove('active');
  });

  document.getElementById('modal-tag-save-btn').addEventListener('click', () => {
    const tagName = document.getElementById('modal-tag-name').value.trim();
    if (!tagName) {
      showToast('Digite um nome para a tag.', 'warning');
      return;
    }
    addChatTag(state.selectedChatId, tagName);
    tagModal.classList.remove('active');
  });
}

// Disconnect WhatsApp session
// Multi-Instance Actions
async function handleConnectInstance(instanceId, name) {
  try {
    state.activePairingInstanceId = instanceId;
    
    const qrModal = document.getElementById('instance-qr-modal');
    const qrTitle = document.getElementById('instance-qr-title');
    const loadingDiv = document.getElementById('instance-qr-loading');
    const displayDiv = document.getElementById('instance-qr-display');
    const qrImg = document.getElementById('instance-qr-img');
    const qrStatus = document.getElementById('instance-qr-status');
    
    qrTitle.innerText = `Conectar WhatsApp: ${name}`;
    loadingDiv.style.display = 'block';
    displayDiv.style.display = 'none';
    qrImg.src = '';
    qrStatus.innerText = 'Aguardando leitura...';
    qrStatus.style.color = 'var(--primary)';
    
    qrModal.classList.add('active');
    
    const res = await fetch(`/api/instances/${instanceId}/connect`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('crm_token')}` }
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Erro ao conectar à instância.');
    }
  } catch (err) {
    console.error('Error connecting instance:', err);
    showToast(err.message, 'error');
    const qrModal = document.getElementById('instance-qr-modal');
    if (qrModal) qrModal.classList.remove('active');
  }
}

async function handleDisconnectInstance(instanceId) {
  if (!confirm('Deseja desconectar esta conexão de WhatsApp? O celular precisará ser pareado novamente.')) {
    return;
  }
  try {
    const res = await fetch(`/api/instances/${instanceId}/disconnect`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('crm_token')}` }
    });
    
    if (res.ok) {
      showToast('Solicitação de desconexão enviada.', 'success');
      loadWhatsAppStatus();
    } else {
      const data = await res.json();
      throw new Error(data.error || 'Erro ao desconectar instância.');
    }
  } catch (err) {
    console.error('Error disconnecting instance:', err);
    showToast(err.message, 'error');
  }
}

async function handleDeleteInstance(instanceId, name) {
  if (!confirm(`Deseja realmente excluir a conexão "${name}"? Todas as credenciais físicas e sessão serão excluídas permanentemente.`)) {
    return;
  }
  try {
    const res = await fetch(`/api/instances/${instanceId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('crm_token')}` }
    });
    
    if (res.ok) {
      showToast('Conexão excluída com sucesso.', 'success');
      loadWhatsAppStatus();
    } else {
      const data = await res.json();
      throw new Error(data.error || 'Erro ao excluir conexão.');
    }
  } catch (err) {
    console.error('Error deleting instance:', err);
    showToast(err.message, 'error');
  }
}

// Save AI Config Form
async function saveAiSettings() {
  const payload = {
    ai_enabled: document.getElementById('ai-enabled-toggle').checked,
    ai_provider: document.getElementById('ai-provider-select').value,
    gemini_key: document.getElementById('gemini-key-input').value,
    openai_key: document.getElementById('openai-key-input').value,
    grok_key: document.getElementById('grok-key-input').value,
    system_prompt: document.getElementById('system-prompt-input').value,
    
    // Model names
    gemini_model: document.getElementById('gemini-model-input').value.trim(),
    openai_model: document.getElementById('openai-model-input').value.trim(),
    grok_model: document.getElementById('grok-model-input').value.trim()
  };

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('crm_token')}`
      },
      body: JSON.stringify(payload)
    });
    
    if (res.ok) {
      const data = await res.json();
      state.settings = data.settings;
      updateHeaderBadge();
      showToast('Configurações de IA salvas!', 'success');
      loadLogs();
    } else {
      throw new Error('Server error');
    }
  } catch (err) {
    showToast('Erro ao salvar configurações de IA.', 'error');
  }
}

// Save MP Config Form
async function saveMpSettings() {
  const payload = {
    mp_enabled: document.getElementById('mp-enabled-toggle').checked,
    mp_access_token: document.getElementById('mp-access-token-input').value
  };

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('crm_token')}`
      },
      body: JSON.stringify(payload)
    });
    
    if (res.ok) {
      const data = await res.json();
      state.settings = data.settings;
      showToast('Configurações de Recebimento salvas!', 'success');
      loadLogs();
    } else {
      throw new Error('Server error');
    }
  } catch (err) {
    showToast('Erro ao salvar configurações de recebimento.', 'error');
  }
}

// Clear logs on server
async function clearLogs() {
  try {
    const res = await fetch('/api/logs/clear', { 
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('crm_token')}` }
    });
    if (res.ok) {
      state.logs = [];
      renderLogs();
      renderDashboardLogs();
      showToast('Logs limpos com sucesso.', 'info');
    }
  } catch (err) {
    showToast('Erro ao limpar logs.', 'error');
  }
}

// Send manual message from CRM chat
async function sendManualMessage() {
  if (!state.selectedChatId) return;
  
  const textarea = document.getElementById('chat-message-input');
  const text = textarea.value.trim();
  if (!text) return;

  textarea.disabled = true;

  try {
    const res = await fetch(`/api/chats/${encodeURIComponent(state.selectedChatId)}/message`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('crm_token')}`
      },
      body: JSON.stringify({ text, isNote: inputMode === 'note' })
    });

    if (res.ok) {
      textarea.value = '';
      await loadChats();
      const updated = state.chats.find(c => c.id === state.selectedChatId);
      if (updated) {
        renderActiveChat(updated);
      }
    } else {
      throw new Error();
    }
  } catch (err) {
    showToast('Erro ao enviar mensagem.', 'error');
  } finally {
    textarea.disabled = false;
    textarea.focus();
  }
}

// Update client funnel status manually
async function updateClientStatus() {
  if (!state.selectedChatId) return;

  const select = document.getElementById('chat-status-select');
  const status = select.value;

  try {
    const res = await fetch(`/api/chats/${encodeURIComponent(state.selectedChatId)}/status`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('crm_token')}`
      },
      body: JSON.stringify({ status })
    });

    if (res.ok) {
      showToast(`Status alterado para "${status}"`, 'success');
      await loadChats();
    } else {
      throw new Error();
    }
  } catch (err) {
    showToast('Erro ao atualizar status do cliente.', 'error');
  }
}

// Save New Customer
async function saveNewClient() {
  const name = document.getElementById('modal-client-name').value.trim();
  const phone = document.getElementById('modal-client-phone').value.trim();
  
  if (!name || !phone) {
    showToast('Preencha o nome e o telefone.', 'warning');
    return;
  }

  if (!/^\d+(@s\.whatsapp\.net)?$/.test(phone)) {
    showToast('Insira apenas números no telefone (código país + ddd + número).', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/chats', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('crm_token')}`
      },
      body: JSON.stringify({ name, phone })
    });

    if (res.ok) {
      const data = await res.json();
      showToast('Cliente cadastrado com sucesso!', 'success');
      document.getElementById('add-client-modal').classList.remove('active');
      document.getElementById('modal-client-name').value = '';
      document.getElementById('modal-client-phone').value = '';
      
      await loadChats();
      selectChat(data.chat.id);
    } else {
      const err = await res.json();
      showToast(err.error || 'Erro ao cadastrar cliente.', 'error');
    }
  } catch (err) {
    showToast('Erro de conexão ao criar cliente.', 'error');
  }
}

// Generate Manual Mercado Pago Invoice Link
async function generateManualCharge() {
  if (!state.selectedChatId) return;

  const item = document.getElementById('modal-charge-item').value.trim();
  const valText = document.getElementById('modal-charge-value').value.trim();
  const value = parseFloat(valText);

  if (!item || isNaN(value) || value <= 0) {
    showToast('Preencha a descrição do item e insira um valor válido maior que 0.', 'warning');
    return;
  }

  try {
    const res = await fetch(`/api/chats/${encodeURIComponent(state.selectedChatId)}/charge`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('crm_token')}`
      },
      body: JSON.stringify({ item, value })
    });

    if (res.ok) {
      showToast('Cobrança manual gerada com sucesso!', 'success');
      document.getElementById('manual-charge-modal').classList.remove('active');
      document.getElementById('modal-charge-item').value = '';
      document.getElementById('modal-charge-value').value = '';
      
      await loadChats();
      const updated = state.chats.find(c => c.id === state.selectedChatId);
      if (updated) {
        renderActiveChat(updated);
      }
    } else {
      const err = await res.json();
      showToast(err.error || 'Erro ao gerar cobrança.', 'error');
    }
  } catch (err) {
    showToast('Erro de conexão ao gerar cobrança.', 'error');
  }
}

// -------------------------------------------------------------
// Utilities
// -------------------------------------------------------------

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'warning') icon = '⚠️';
  if (type === 'error') icon = '❌';

  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) reverse forwards';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3500);
}

function insertQuickMessage(text) {
  const textarea = document.getElementById('chat-message-input');
  textarea.value = text;
  textarea.focus();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.innerText = text;
  return div.innerHTML;
}

async function checkPaymentStatus(chatId) {
  try {
    showToast('Verificando status de pagamento...', 'info');
    const response = await fetch(`/api/chats/${encodeURIComponent(chatId)}/check-payment`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('crm_token')}` }
    });

    if (response.ok) {
      const data = await response.json();
      if (data.verified) {
        showToast('Pagamento Aprovado com sucesso!', 'success');
        await loadChats();
        const updated = state.chats.find(c => c.id === chatId);
        if (updated) {
          renderActiveChat(updated);
        }
      } else {
        showToast('Pagamento ainda pendente no Mercado Pago.', 'warning');
      }
    } else {
      const err = await response.json();
      showToast(err.error || 'Erro ao verificar pagamento.', 'error');
    }
  } catch (err) {
    showToast('Erro de conexão ao verificar pagamento.', 'error');
  }
}

// Multi-attendant dashboard and WebSocket operations
async function loadAllUsers() {
  try {
    const response = await fetch('/api/users', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('crm_token')}` }
    });
    if (response.ok) {
      allUsers = await response.json();
      renderUsersList();
      if (state.selectedChatId) {
        const activeChat = state.chats.find(c => c.id === state.selectedChatId);
        if (activeChat) renderActiveChatHeader(activeChat);
      }
    }
  } catch (err) {
    console.error('Error loading users:', err);
  }
}

function renderUsersList() {
  const container = document.getElementById('admin-users-list');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (allUsers.length === 0) {
    container.innerHTML = '<div style="color:var(--text-dimmed); font-size:12px;">Nenhum atendente cadastrado.</div>';
    return;
  }

  allUsers.forEach(u => {
    const item = document.createElement('div');
    item.style.padding = '8px 12px';
    item.style.backgroundColor = 'rgba(255,255,255,0.02)';
    item.style.border = '1px solid var(--border-color)';
    item.style.borderRadius = '6px';
    item.style.display = 'flex';
    item.style.justifyContent = 'space-between';
    item.style.alignItems = 'center';
    item.style.fontSize = '12px';
    
    const statusText = u.status === 'online' ? '🟢 Online' : '⚫ Offline';
    const roleTranslations = {
      admin: 'Administrador',
      supervisor: 'Supervisor',
      seller: 'Vendedor',
      support: 'Suporte',
      other: 'Outro'
    };
    const roleText = roleTranslations[u.role] || u.role;
    
    let deleteHtml = '';
    const canDelete = currentUser.role === 'admin' || 
                      (currentUser.role === 'supervisor' && ['seller', 'support', 'other'].includes(u.role));
    if (canDelete && u.id !== currentUser.id) {
      deleteHtml = `<button onclick="deleteUser('${u.id}')" style="background: none; border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; border-radius: 4px; padding: 2px 6px; font-size: 10px; cursor: pointer; font-weight: 600; font-family: var(--font-body);">Excluir</button>`;
    }

    item.innerHTML = `
      <div>
        <div style="font-weight: 600; color: #fff;">${u.name} (@${u.username})</div>
        <div style="font-size: 10px; color: var(--text-muted);">${roleText} - ${statusText}</div>
      </div>
      <div>
        ${deleteHtml}
      </div>
    `;
    container.appendChild(item);
  });
}

function setupAttendantUI() {
  const roleTranslations = {
    admin: 'Administrador',
    supervisor: 'Supervisor',
    seller: 'Vendedor',
    support: 'Suporte',
    other: 'Outro'
  };

  // Set details in sidebar
  document.getElementById('user-name').innerText = currentUser.name;
  document.getElementById('user-role').innerText = roleTranslations[currentUser.role] || currentUser.role;
  document.getElementById('user-avatar').innerText = currentUser.name.charAt(0).toUpperCase();
  document.getElementById('user-status-select').value = currentUser.status || 'online';

  // Toggle Admin/Supervisor cards
  const isAdminOrSupervisor = currentUser.role === 'admin' || currentUser.role === 'supervisor';
  if (isAdminOrSupervisor) {
    document.getElementById('filter-all-tab').style.display = 'block';
    const navTeam = document.getElementById('nav-team');
    if (navTeam) navTeam.style.display = 'flex';
    const navReports = document.getElementById('nav-reports');
    if (navReports) navReports.style.display = 'flex';
    
    // If supervisor, restrict the registration role choices
    if (currentUser.role === 'supervisor') {
      const regRoleSelect = document.getElementById('reg-role');
      if (regRoleSelect) {
        regRoleSelect.innerHTML = `
          <option value="seller">Vendedor</option>
          <option value="support">Suporte</option>
          <option value="other">Outro</option>
        `;
      }
    }
  }

  // Filter tabs event listeners
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.getAttribute('data-filter');
      renderClientList();
    });
  });

  // User status select listener
  document.getElementById('user-status-select').addEventListener('change', (e) => {
    updateUserStatus(e.target.value);
  });

  // Logout button listener
  document.getElementById('logout-btn').addEventListener('click', logout);

  // Admin attendant registration
  const regSaveBtn = document.getElementById('reg-save-btn');
  if (regSaveBtn) {
    regSaveBtn.addEventListener('click', registerAttendant);
  }
}

function renderActiveChatHeader(chat) {
  const assignedNameEl = document.getElementById('chat-assigned-user-name');
  const claimBtn = document.getElementById('chat-claim-btn');
  const assignSelect = document.getElementById('chat-assign-select');
  const aiToggle = document.getElementById('chat-ai-active-toggle');

  if (!assignedNameEl) return;

  // Render Tags
  const tagsContainer = document.getElementById('chat-header-tags');
  tagsContainer.innerHTML = '';
  if (chat.tags && chat.tags.length > 0) {
    chat.tags.forEach(tag => {
      const badge = document.createElement('span');
      badge.style.cssText = 'background: rgba(99, 102, 241, 0.15); border: 1px solid var(--primary); color: #fff; border-radius: 4px; padding: 2px 6px; font-size: 10px; display: inline-flex; align-items: center; gap: 4px; font-weight: 600; font-family: var(--font-body);';
      badge.innerHTML = `${tag} <span onclick="removeChatTag('${chat.id}', '${tag}')" style="cursor: pointer; opacity: 0.6; font-weight: bold; margin-left: 2px;">&times;</span>`;
      tagsContainer.appendChild(badge);
    });
  }

  // Render Favorite Star
  const star = document.getElementById('chat-favorite-star');
  if (chat.is_favorite) {
    star.innerText = '★';
    star.style.color = '#eab308';
    star.style.transform = 'scale(1.2)';
  } else {
    star.innerText = '☆';
    star.style.color = 'var(--text-dimmed)';
    star.style.transform = 'scale(1)';
  }
  
  const newStar = star.cloneNode(true);
  star.parentNode.replaceChild(newStar, star);
  newStar.addEventListener('click', () => {
    toggleChatFavorite(chat.id, !chat.is_favorite);
  });

  // Render Archive Button State
  const archiveBtn = document.getElementById('chat-archive-btn');
  if (chat.is_archived) {
    archiveBtn.innerText = 'Desarquivar';
    archiveBtn.style.background = 'rgba(99, 102, 241, 0.15)';
    archiveBtn.style.borderColor = 'var(--primary)';
    archiveBtn.style.color = '#fff';
  } else {
    archiveBtn.innerText = 'Arquivar';
    archiveBtn.style.background = 'rgba(255, 255, 255, 0.03)';
    archiveBtn.style.borderColor = 'var(--border-color)';
    archiveBtn.style.color = 'var(--text-muted)';
  }
  
  const newArchiveBtn = archiveBtn.cloneNode(true);
  archiveBtn.parentNode.replaceChild(newArchiveBtn, archiveBtn);
  newArchiveBtn.addEventListener('click', () => {
    toggleChatArchive(chat.id, !chat.is_archived);
  });

  // Render Block Button State
  const blockBtn = document.getElementById('chat-block-btn');
  if (chat.is_blocked) {
    blockBtn.innerText = 'Desbloquear';
    blockBtn.style.background = 'rgba(239, 68, 68, 0.15)';
    blockBtn.style.borderColor = 'rgba(239, 68, 68, 0.5)';
    blockBtn.style.color = '#ef4444';
  } else {
    blockBtn.innerText = 'Bloquear';
    blockBtn.style.background = 'none';
    blockBtn.style.borderColor = 'rgba(239, 68, 68, 0.4)';
    blockBtn.style.color = '#ef4444';
  }
  
  const newBlockBtn = blockBtn.cloneNode(true);
  blockBtn.parentNode.replaceChild(newBlockBtn, blockBtn);
  newBlockBtn.addEventListener('click', () => {
    toggleChatBlock(chat.id, !chat.is_blocked);
  });

  // Set Sector state
  const sectorSelect = document.getElementById('chat-sector-select');
  sectorSelect.value = chat.sector || '';

  const newSectorSelect = sectorSelect.cloneNode(true);
  sectorSelect.parentNode.replaceChild(newSectorSelect, sectorSelect);
  newSectorSelect.addEventListener('change', (e) => {
    updateClientSector(chat.id, e.target.value || null);
  });

  // Set AI state
  aiToggle.checked = chat.ai_active !== false;

  const newAiToggle = aiToggle.cloneNode(true);
  aiToggle.parentNode.replaceChild(newAiToggle, aiToggle);
  newAiToggle.addEventListener('change', () => {
    toggleAiActive(chat.id, newAiToggle.checked);
  });

  // Set Assignment details
  const assignedUser = allUsers.find(u => u.id === chat.assigned_to);
  const assignedName = assignedUser ? assignedUser.name : 'Ninguém (Fila)';
  assignedNameEl.innerText = assignedName;

  const isAdminOrSupervisor = currentUser.role === 'admin' || currentUser.role === 'supervisor';
  if (isAdminOrSupervisor) {
    claimBtn.style.display = 'none';
    assignSelect.style.display = 'block';
    
    assignSelect.innerHTML = '<option value="">-- Atribuir a Ninguém --</option>';
    allUsers.forEach(u => {
      const roleTranslations = {
        admin: 'Admin',
        supervisor: 'Sup',
        seller: 'Vend',
        support: 'Suporte',
        other: 'Outro'
      };
      const rText = roleTranslations[u.role] || u.role;
      assignSelect.innerHTML += `<option value="${u.id}" ${chat.assigned_to === u.id ? 'selected' : ''}>${u.name} (${rText})</option>`;
    });

    const newAssignSelect = assignSelect.cloneNode(true);
    assignSelect.parentNode.replaceChild(newAssignSelect, assignSelect);
    newAssignSelect.addEventListener('change', (e) => {
      assignChat(chat.id, e.target.value);
    });
  } else {
    assignSelect.style.display = 'none';
    if (!chat.assigned_to) {
      claimBtn.style.display = 'inline-block';
      const newClaimBtn = claimBtn.cloneNode(true);
      claimBtn.parentNode.replaceChild(newClaimBtn, claimBtn);
      newClaimBtn.addEventListener('click', () => {
        claimChat(chat.id);
      });
    } else {
      claimBtn.style.display = 'none';
    }
  }
}

async function claimChat(chatId) {
  try {
    const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('crm_token')}`
      },
      body: JSON.stringify({ userId: currentUser.id })
    });

    if (res.ok) {
      showToast('Conversa capturada por você!', 'success');
      await loadChats();
    } else {
      showToast('Erro ao capturar conversa.', 'error');
    }
  } catch (err) {
    showToast('Erro de conexão ao capturar conversa.', 'error');
  }
}

async function assignChat(chatId, userId) {
  try {
    const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('crm_token')}`
      },
      body: JSON.stringify({ userId: userId || null })
    });

    if (res.ok) {
      showToast('Atribuição da conversa atualizada.', 'success');
      await loadChats();
    } else {
      showToast('Erro ao atribuir conversa.', 'error');
    }
  } catch (err) {
    showToast('Erro de conexão ao atribuir conversa.', 'error');
  }
}

async function toggleAiActive(chatId, aiActive) {
  try {
    const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}/ai-toggle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('crm_token')}`
      },
      body: JSON.stringify({ aiActive })
    });

    if (res.ok) {
      showToast(`IA do atendente virtual ${aiActive ? 'ativada' : 'desativada'} neste chat.`, 'success');
      await loadChats();
    } else {
      showToast('Erro ao alterar IA.', 'error');
    }
  } catch (err) {
    showToast('Erro de conexão ao alterar status da IA.', 'error');
  }
}

async function updateUserStatus(status) {
  try {
    const res = await fetch('/api/auth/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('crm_token')}`
      },
      body: JSON.stringify({ status })
    });

    if (res.ok) {
      currentUser.status = status;
      localStorage.setItem('crm_user', JSON.stringify(currentUser));
      showToast(`Você está ${status === 'online' ? 'Online' : 'Offline'}.`, 'success');
    }
  } catch (err) {
    console.error('Error updating status:', err);
  }
}

async function logout() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('crm_token')}` }
    });
  } catch (err) {}
  localStorage.removeItem('crm_token');
  localStorage.removeItem('crm_user');
  window.location.href = 'login.html';
}

async function registerAttendant() {
  const name = document.getElementById('reg-name').value.trim();
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;
  const role = document.getElementById('reg-role').value;

  if (!name || !username || !password || !role) {
    showToast('Preencha todos os campos do novo atendente.', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('crm_token')}`
      },
      body: JSON.stringify({ name, username, password, role })
    });

    if (res.ok) {
      showToast('Atendente cadastrado com sucesso!', 'success');
      document.getElementById('reg-name').value = '';
      document.getElementById('reg-username').value = '';
      document.getElementById('reg-password').value = '';
      loadAllUsers();
    } else {
      const err = await res.json();
      showToast(err.error || 'Erro ao cadastrar atendente.', 'error');
    }
  } catch (err) {
    showToast('Erro de conexão ao cadastrar atendente.', 'error');
  }
}

async function deleteUser(userId) {
  if (!confirm('Tem certeza de que deseja excluir este atendente da equipe?')) return;
  try {
    const res = await fetch(`/api/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('crm_token')}` }
    });

    if (res.ok) {
      showToast('Atendente excluído da equipe com sucesso!', 'success');
      loadAllUsers();
      loadChats();
    } else {
      const err = await res.json();
      showToast(err.error || 'Erro ao excluir atendente.', 'error');
    }
  } catch (err) {
    showToast('Erro de conexão ao excluir atendente.', 'error');
  }
}

async function addChatTag(chatId, tag) {
  try {
    const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}/tags`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('crm_token')}`
      },
      body: JSON.stringify({ tag })
    });
    if (res.ok) {
      showToast(`Tag "${tag}" adicionada.`, 'success');
      await loadChats();
    } else {
      showToast('Erro ao adicionar tag.', 'error');
    }
  } catch (err) {
    showToast('Erro de conexão ao adicionar tag.', 'error');
  }
}

async function removeChatTag(chatId, tag) {
  try {
    const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}/tags`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('crm_token')}`
      },
      body: JSON.stringify({ tag })
    });
    if (res.ok) {
      showToast(`Tag "${tag}" removida.`, 'success');
      await loadChats();
    } else {
      showToast('Erro ao remover tag.', 'error');
    }
  } catch (err) {
    showToast('Erro de conexão ao remover tag.', 'error');
  }
}

async function toggleChatFavorite(chatId, isFavorite) {
  try {
    const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}/favorite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('crm_token')}`
      },
      body: JSON.stringify({ isFavorite })
    });
    if (res.ok) {
      showToast(isFavorite ? 'Adicionado aos favoritos.' : 'Removido dos favoritos.', 'success');
      await loadChats();
    } else {
      showToast('Erro ao favoritar.', 'error');
    }
  } catch (err) {
    showToast('Erro de conexão ao favoritar.', 'error');
  }
}

async function toggleChatArchive(chatId, isArchived) {
  try {
    const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}/archive`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('crm_token')}`
      },
      body: JSON.stringify({ isArchived })
    });
    if (res.ok) {
      showToast(isArchived ? 'Conversa arquivada.' : 'Conversa desarquivada.', 'success');
      await loadChats();
      if (isArchived && state.selectedChatId === chatId) {
        state.selectedChatId = null;
        document.getElementById('chat-active-state').style.display = 'none';
        document.getElementById('chat-empty-state').style.display = 'flex';
      }
    } else {
      showToast('Erro ao arquivar.', 'error');
    }
  } catch (err) {
    showToast('Erro de conexão ao arquivar.', 'error');
  }
}

async function toggleChatBlock(chatId, isBlocked) {
  const confirmText = isBlocked ? 
    'Tem certeza que deseja bloquear este contato? Ele não receberá mais respostas automáticas.' : 
    'Tem certeza que deseja desbloquear este contato?';
  if (!confirm(confirmText)) return;

  try {
    const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}/block`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('crm_token')}`
      },
      body: JSON.stringify({ isBlocked })
    });
    if (res.ok) {
      showToast(isBlocked ? 'Contato bloqueado.' : 'Contato desbloqueado.', 'success');
      await loadChats();
    } else {
      showToast('Erro ao alterar bloqueio.', 'error');
    }
  } catch (err) {
    showToast('Erro de conexão.', 'error');
  }
}

async function updateClientSector(chatId, sector) {
  try {
    const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}/sector`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('crm_token')}`
      },
      body: JSON.stringify({ sector })
    });
    if (res.ok) {
      showToast('Setor da conversa atualizado com sucesso.', 'success');
      await loadChats();
    } else {
      showToast('Erro ao atualizar setor.', 'error');
    }
  } catch (err) {
    showToast('Erro de conexão ao atualizar setor.', 'error');
  }
}

// Kanban Drag & Drop HTML5 Global functions
function allowDrop(ev) {
  ev.preventDefault();
}

function drag(ev) {
  ev.dataTransfer.setData("text", ev.target.id);
}

async function drop(ev, newStatus) {
  ev.preventDefault();
  const cardId = ev.dataTransfer.getData("text");
  const chatId = cardId.replace('kanban-card-', '');
  
  try {
    const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('crm_token')}`
      },
      body: JSON.stringify({ status: newStatus })
    });
    if (res.ok) {
      showToast(`Status atualizado para "${newStatus === 'interesse em compra' ? 'Interesse' : newStatus}"`, 'success');
      await loadChats();
    } else {
      showToast('Erro ao atualizar status.', 'error');
    }
  } catch (err) {
    showToast('Erro de conexão.', 'error');
  }
}

function renderKanban() {
  const cols = {
    iniciada: document.getElementById('kanban-cards-iniciada'),
    'interesse em compra': document.getElementById('kanban-cards-interesse'),
    finalizada: document.getElementById('kanban-cards-finalizada')
  };

  Object.keys(cols).forEach(k => {
    if (cols[k]) cols[k].innerHTML = '';
  });

  const counts = { iniciada: 0, 'interesse em compra': 0, finalizada: 0 };
  const activeChats = state.chats.filter(c => !c.is_archived);

  activeChats.forEach(chat => {
    const col = cols[chat.status];
    if (!col) return;

    counts[chat.status]++;

    const card = document.createElement('div');
    card.className = 'kanban-card';
    card.id = `kanban-card-${chat.id}`;
    card.draggable = true;
    card.setAttribute('ondragstart', 'drag(event)');
    
    card.style.cssText = 'background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; cursor: grab; transition: transform 0.2s ease, box-shadow 0.2s ease; position: relative;';
    
    card.addEventListener('mouseenter', () => {
      card.style.transform = 'translateY(-2px)';
      card.style.boxShadow = 'var(--shadow-glow)';
      card.style.borderColor = 'var(--primary)';
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'translateY(0)';
      card.style.boxShadow = 'none';
      card.style.borderColor = 'var(--border-color)';
    });

    const assignedUser = allUsers.find(u => u.id === chat.assigned_to);
    const assignedName = assignedUser ? assignedUser.name.split(' ')[0] : 'Fila';
    
    const sectorTranslations = {
      sales: 'Vendas',
      support: 'Suporte',
      finance: 'Finanças'
    };
    const sectorText = chat.sector ? sectorTranslations[chat.sector] : 'Sem Setor';

    let tagsHtml = '';
    if (chat.tags && chat.tags.length > 0) {
      tagsHtml = '<div style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 8px;">';
      chat.tags.slice(0, 3).forEach(t => {
        tagsHtml += `<span style="background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.3); color: #fff; font-size: 8px; padding: 1px 4px; border-radius: 3px; font-family: var(--font-body); font-weight: 600;">${t}</span>`;
      });
      tagsHtml += '</div>';
    }

    card.addEventListener('dblclick', () => {
      switchView('crm');
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.getElementById('nav-crm').classList.add('active');
      selectChat(chat.id);
    });

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
        <span style="font-weight: 700; color: #fff; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;" title="${chat.client_name}">${chat.client_name}</span>
        <span style="font-size: 9px; padding: 2px 5px; border-radius: 4px; font-weight: 600; font-family: var(--font-body); background: rgba(255,255,255,0.04); border: 1px solid var(--border-color); color: var(--text-muted);">${sectorText}</span>
      </div>
      <div style="font-size: 11px; color: var(--text-dimmed); margin-top: 4px;">+${chat.client_phone}</div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; font-size: 10px; border-top: 1px solid rgba(255,255,255,0.03); padding-top: 6px;">
        <span style="color: var(--text-muted);">Resp: <strong style="color:#fff;">${assignedName}</strong></span>
        ${chat.is_favorite ? '<span style="color: #eab308; font-size:12px;">★</span>' : ''}
      </div>
      ${tagsHtml}
    `;

    col.appendChild(card);
  });

  document.getElementById('kanban-count-iniciada').innerText = counts.iniciada;
  document.getElementById('kanban-count-interesse').innerText = counts['interesse em compra'];
  document.getElementById('kanban-count-finalizada').innerText = counts.finalizada;
}

async function loadScheduledMessages(chatId) {
  const container = document.getElementById('scheduled-messages-list');
  if (!container) return;

  container.innerHTML = '<div style="color:var(--text-dimmed); font-size:12px; text-align:center; padding: 20px;">Carregando agendamentos...</div>';

  try {
    const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}/schedule`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('crm_token')}` }
    });

    if (!res.ok) throw new Error();

    const schedules = await res.json();
    container.innerHTML = '';

    if (schedules.length === 0) {
      container.innerHTML = '<div style="color:var(--text-dimmed); font-size:12px; text-align:center; padding: 20px;">Nenhum agendamento pendente para este cliente.</div>';
      return;
    }

    schedules.forEach(s => {
      const item = document.createElement('div');
      item.className = 'schedule-item';
      
      const timeStr = new Date(s.scheduledTime).toLocaleString();
      let attachmentHtml = '';
      
      if (s.mediaUrl) {
        attachmentHtml = `
          <div class="schedule-attachment-info">
            <span>📎 Anexo: ${escapeHtml(s.fileName || 'Arquivo')} (${s.mediaType})</span>
          </div>
        `;
      }

      item.innerHTML = `
        <div style="flex-grow: 1;">
          <div class="schedule-meta-time">🕒 Enviar em: ${timeStr}</div>
          <div class="schedule-text">${escapeHtml(s.text || '[Apenas Mídia]')}</div>
          ${attachmentHtml}
        </div>
        <button onclick="deleteSchedule('${s.id}')" style="background: none; border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; border-radius: 4px; padding: 4px 8px; font-size: 11px; cursor: pointer; font-weight: 600; font-family: var(--font-body); flex-shrink: 0; align-self: center;">Cancelar</button>
      `;

      container.appendChild(item);
    });
  } catch (err) {
    container.innerHTML = '<div style="color:#ef4444; font-size:12px; text-align:center; padding: 20px;">Erro ao carregar agendamentos.</div>';
  }
}

async function deleteSchedule(scheduleId) {
  if (!confirm('Tem certeza de que deseja cancelar este agendamento?')) return;

  try {
    const res = await fetch(`/api/chats/schedule/${encodeURIComponent(scheduleId)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('crm_token')}` }
    });

    if (res.ok) {
      showToast('Agendamento cancelado com sucesso.', 'success');
      if (state.selectedChatId) {
        await loadScheduledMessages(state.selectedChatId);
      }
    } else {
      showToast('Erro ao cancelar agendamento.', 'error');
    }
  } catch (err) {
    showToast('Erro de conexão ao cancelar agendamento.', 'error');
  }
}

async function loadReportsData() {
  try {
    const res = await fetch('/api/reports/statistics', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('crm_token')}` }
    });
    if (!res.ok) throw new Error('Falha ao obter dados estatísticos');

    const data = await res.json();
    
    const formatTime = (sec) => {
      if (sec < 60) return `${sec}s`;
      const min = Math.floor(sec / 60);
      const remSec = sec % 60;
      return `${min}m ${remSec}s`;
    };

    document.getElementById('rep-total-chats').innerText = data.kpis.totalChats;
    document.getElementById('rep-tmr-humano').innerText = formatTime(data.kpis.tmrHumano);
    document.getElementById('rep-tmr-ai').innerText = formatTime(data.kpis.tmrAi);
    document.getElementById('rep-tma-geral').innerText = formatTime(data.kpis.tmaGeral);

    window.lastReportData = data;

    const tbody = document.getElementById('attendants-performance-tbody');
    tbody.innerHTML = '';
    
    data.attendants.forEach(u => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid var(--border-color)';
      
      const roleTranslations = {
        admin: 'Admin',
        supervisor: 'Supervisor',
        seller: 'Vendedor',
        support: 'Suporte',
        other: 'Outro'
      };
      
      const statusClass = u.status === 'online' ? '🟢 Online' : '⚫ Offline';

      tr.innerHTML = `
        <td style="padding: 12px; font-weight: 600;">${u.name}</td>
        <td style="padding: 12px;">${roleTranslations[u.role] || u.role}</td>
        <td style="padding: 12px; text-align: center; font-size: 11px;">${statusClass}</td>
        <td style="padding: 12px; text-align: center; font-weight: 700;">${u.activeChats}</td>
        <td style="padding: 12px; text-align: center;">${u.repliesCount}</td>
        <td style="padding: 12px; text-align: center; font-weight: 600; color: var(--status-interesse);">${formatTime(u.tmr)}</td>
        <td style="padding: 12px; text-align: center; font-weight: 600; color: var(--primary);">${formatTime(u.tma)}</td>
      `;
      tbody.appendChild(tr);
    });

    renderMessageVolumeChart(data.history);
    renderSectorChart(data.sectors);
  } catch (err) {
    console.error('Error loading reports data:', err);
    showToast('Erro ao carregar dados dos relatórios.', 'error');
  }
}

function renderMessageVolumeChart(history) {
  const ctx = document.getElementById('messagesVolumeChart').getContext('2d');
  
  if (messagesVolumeChartInstance) {
    messagesVolumeChartInstance.destroy();
  }

  const labels = history.map(h => h.label);
  const clientData = history.map(h => h.clientMessages);
  const attendantData = history.map(h => h.attendantMessages);

  messagesVolumeChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Mensagens de Clientes',
          data: clientData,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.3
        },
        {
          label: 'Mensagens de Atendentes',
          data: attendantData,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#9ca3af' }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#9ca3af' }
        }
      },
      plugins: {
        legend: {
          labels: { color: '#fff', font: { family: 'Outfit' } }
        }
      }
    }
  });
}

function renderSectorChart(sectors) {
  const ctx = document.getElementById('sectorDistributionChart').getContext('2d');

  if (sectorDistributionChartInstance) {
    sectorDistributionChartInstance.destroy();
  }

  const dataValues = [sectors.sales, sectors.support, sectors.finance, sectors.none];

  sectorDistributionChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Vendas', 'Suporte', 'Financeiro', 'Sem Setor'],
      datasets: [{
        data: dataValues,
        backgroundColor: [
          '#f59e0b',
          '#3b82f6',
          '#10b981',
          'rgba(255, 255, 255, 0.1)'
        ],
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#fff', font: { family: 'Outfit', size: 11 } }
        }
      }
    }
  });
}

function exportReportsCSV() {
  const data = window.lastReportData;
  if (!data) {
    showToast('Nenhum dado disponível para exportação.', 'warning');
    return;
  }

  let csvContent = '\uFEFF';
  
  csvContent += 'MÉTRICAS GERAIS DO CRM\n';
  csvContent += `Total de Chats;${data.kpis.totalChats}\n`;
  csvContent += `TMR Geral (Média);${data.kpis.tmrGeral}s\n`;
  csvContent += `TMR Humano (Média);${data.kpis.tmrHumano}s\n`;
  csvContent += `TMR IA (Média);${data.kpis.tmrAi}s\n`;
  csvContent += `TMA Geral (Média);${data.kpis.tmaGeral}s\n\n`;

  csvContent += 'DESEMPENHO POR ATENDENTE\n';
  csvContent += 'Nome;Cargo;Status;Chats Ativos;Respostas Enviadas;TMR Médio (s);TMA Médio (s)\n';
  data.attendants.forEach(u => {
    csvContent += `${u.name};${u.role};${u.status};${u.activeChats};${u.repliesCount};${u.tmr};${u.tma}\n`;
  });
  csvContent += '\n';

  csvContent += 'DISTRIBUIÇÃO POR SETOR\n';
  csvContent += `Vendas;${data.sectors.sales}\n`;
  csvContent += `Suporte;${data.sectors.support}\n`;
  csvContent += `Financeiro;${data.sectors.finance}\n`;
  csvContent += `Sem Setor;${data.sectors.none}\n`;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `auditoria_crm_whatsapp_${Date.now()}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Auditoria exportada como CSV!', 'success');
}

window.insertQuickMessage = insertQuickMessage;
window.checkPaymentStatus = checkPaymentStatus;
window.deleteUser = deleteUser;
window.removeChatTag = removeChatTag;
window.allowDrop = allowDrop;
window.drag = drag;
window.drop = drop;
window.deleteSchedule = deleteSchedule;
window.loadReportsData = loadReportsData;
window.exportReportsCSV = exportReportsCSV;
