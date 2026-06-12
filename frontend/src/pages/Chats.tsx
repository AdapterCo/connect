import { useEffect, useState, useRef } from 'react';
import { useAppStore } from '../stores/appStore';
import { useAuthStore } from '../stores/authStore';
import type { Chat } from '../types';

type FilterType = 'my' | 'queue' | 'favorite' | 'archive' | 'all';

export default function Chats() {
  const { chats, users, selectedChatId, selectChat, fetchChats, fetchUsers, sendMessage, updateChatStatus, assignChat, toggleAi, updateSector, toggleFavorite, toggleArchive, toggleBlock, addTag, deleteTag } = useAppStore();
  const { user } = useAuthStore();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('my');
  const [sectorFilter, setSectorFilter] = useState('');
  const [messageText, setMessageText] = useState('');
  const [isNote, setIsNote] = useState(false);
  const [sendError, setSendError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchChats();
    fetchUsers();
  }, [fetchChats, fetchUsers]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedChatId, chats]);

  const filteredChats = chats.filter(chat => {
    if (search && !chat.client_name.toLowerCase().includes(search.toLowerCase())) return false;
    if (sectorFilter && chat.sector !== sectorFilter) return false;
    
    switch (filter) {
      case 'my': return chat.assigned_to === user?.id;
      case 'queue': return !chat.assigned_to;
      case 'favorite': return chat.is_favorite;
      case 'archive': return chat.is_archived;
      case 'all': return true;
      default: return true;
    }
  });

  const selectedChat = chats.find(c => c.id === selectedChatId);

  const handleSend = async () => {
    if (!messageText.trim() || !selectedChatId) return;
    setSendError('');
    try {
      await sendMessage(selectedChatId, messageText, isNote);
      setMessageText('');
    } catch (error: any) {
      setSendError(error.response?.data?.error || 'Nao foi possivel enviar a mensagem.');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-full flex">
      {/* Sidebar com lista de chats */}
      <div className="w-80 border-r border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-700 space-y-3">
          <input
            type="text"
            placeholder="Buscar cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
          
          <div className="flex gap-2">
            <select
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white"
            >
              <option value="">Todos os Setores</option>
              <option value="sales">Vendas</option>
              <option value="support">Suporte</option>
              <option value="finance">Financeiro</option>
            </select>
          </div>

          <div className="flex gap-1 text-xs">
            {(['my', 'queue', 'favorite', 'archive', 'all'] as FilterType[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 py-2 rounded font-medium transition-colors ${
                  filter === f ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-700'
                }`}
              >
                {f === 'my' ? 'Meus' : f === 'queue' ? 'Fila' : f === 'favorite' ? '★' : f === 'archive' ? '📁' : 'Todos'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredChats.map(chat => (
            <ChatListItem
              key={chat.id}
              chat={chat}
              isSelected={chat.id === selectedChatId}
              onClick={() => selectChat(chat.id)}
            />
          ))}
        </div>
      </div>

      {/* Área do chat */}
      <div className="flex-1 flex flex-col">
        {selectedChat ? (
          <>
            <ChatHeader
              chat={selectedChat}
              users={users}
              onUpdateStatus={updateChatStatus}
              onAssign={assignChat}
              onToggleAi={toggleAi}
              onUpdateSector={updateSector}
              onToggleFavorite={toggleFavorite}
              onToggleArchive={toggleArchive}
              onToggleBlock={toggleBlock}
              onAddTag={addTag}
              onDeleteTag={deleteTag}
              currentUser={user!}
            />

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {selectedChat.messages.map(msg => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-gray-700 p-4">
              <div className="flex gap-2 mb-2">
                <button
                  onClick={() => setIsNote(false)}
                  className={`px-3 py-1 rounded text-xs font-medium ${!isNote ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                >
                  💬 Mensagem
                </button>
                <button
                  onClick={() => setIsNote(true)}
                  className={`px-3 py-1 rounded text-xs font-medium ${isNote ? 'bg-amber-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                >
                  📝 Nota Interna
                </button>
              </div>
              <div className="flex gap-2">
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder={isNote ? 'Nota interna (não será enviada ao cliente)...' : 'Digite uma mensagem...'}
                  className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none"
                  rows={2}
                />
                <button
                  onClick={handleSend}
                  className="px-6 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
                >
                  Enviar
                </button>
              </div>
              {sendError && (
                <p className="mt-2 text-xs text-red-400">{sendError}</p>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <p className="text-4xl mb-4">💬</p>
              <p>Selecione uma conversa na lista lateral</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ChatListItem({ chat, isSelected, onClick }: { chat: Chat; isSelected: boolean; onClick: () => void }) {
  const statusColors: Record<string, string> = {
    'iniciada': 'bg-blue-500',
    'interesse em compra': 'bg-amber-500',
    'finalizada': 'bg-green-500',
  };

  const lastMessage = chat.messages[chat.messages.length - 1];

  return (
    <div
      onClick={onClick}
      className={`p-4 border-b border-gray-700 cursor-pointer hover:bg-gray-700/50 ${isSelected ? 'bg-gray-700' : ''}`}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center font-bold">
          {chat.client_name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-white truncate">{chat.client_name}</p>
            {chat.is_favorite && <span className="text-amber-400">★</span>}
          </div>
          <p className="text-xs text-gray-400 truncate">
            {lastMessage?.text || 'Sem mensagens'}
          </p>
        </div>
        <div className={`w-2 h-2 rounded-full ${statusColors[chat.status]}`} />
      </div>
    </div>
  );
}

function ChatHeader({ chat, users, onUpdateStatus, onAssign, onToggleAi, onUpdateSector, onToggleFavorite, onToggleArchive, onToggleBlock, onAddTag, onDeleteTag }: any) {
  const [newTag, setNewTag] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);

  return (
    <div className="border-b border-gray-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gray-600 rounded-full flex items-center justify-center font-bold text-lg">
            {chat.client_name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-white">{chat.client_name}</h3>
              <button
                onClick={() => onToggleFavorite(chat.id, !chat.is_favorite)}
                className={`text-lg ${chat.is_favorite ? 'text-amber-400' : 'text-gray-500'}`}
              >
                {chat.is_favorite ? '★' : '☆'}
              </button>
            </div>
            <p className="text-sm text-gray-400">+{chat.client_phone}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-400">IA:</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={chat.ai_active}
                onChange={(e) => onToggleAi(chat.id, e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs">
        <select
          value={chat.assigned_to || ''}
          onChange={(e) => onAssign(chat.id, e.target.value || null)}
          className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white"
        >
          <option value="">Fila de Espera</option>
          {users.map((u: any) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>

        <select
          value={chat.sector || ''}
          onChange={(e) => onUpdateSector(chat.id, e.target.value || null)}
          className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white"
        >
          <option value="">Sem Setor</option>
          <option value="sales">Vendas</option>
          <option value="support">Suporte</option>
          <option value="finance">Financeiro</option>
        </select>

        <select
          value={chat.status}
          onChange={(e) => onUpdateStatus(chat.id, e.target.value)}
          className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white"
        >
          <option value="iniciada">Iniciada</option>
          <option value="interesse em compra">Interesse em Compra</option>
          <option value="finalizada">Finalizada</option>
        </select>

        <button
          onClick={() => onToggleArchive(chat.id, !chat.is_archived)}
          className="px-3 py-1 bg-gray-700 border border-gray-600 rounded text-white hover:bg-gray-600"
        >
          {chat.is_archived ? 'Desarquivar' : 'Arquivar'}
        </button>

        <button
          onClick={() => onToggleBlock(chat.id, !chat.is_blocked)}
          className={`px-3 py-1 border rounded ${chat.is_blocked ? 'border-green-500 text-green-400' : 'border-red-500 text-red-400'}`}
        >
          {chat.is_blocked ? 'Desbloquear' : 'Bloquear'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        {chat.tags.map((tag: string) => (
          <span key={tag} className="px-2 py-1 bg-indigo-500/20 text-indigo-300 rounded text-xs flex items-center gap-1">
            {tag}
            <button onClick={() => onDeleteTag(chat.id, tag)} className="hover:text-red-400">×</button>
          </span>
        ))}
        {showTagInput ? (
          <input
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newTag) {
                onAddTag(chat.id, newTag);
                setNewTag('');
                setShowTagInput(false);
              }
            }}
            onBlur={() => setShowTagInput(false)}
            placeholder="Nome da tag"
            className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white w-24"
            autoFocus
          />
        ) : (
          <button
            onClick={() => setShowTagInput(true)}
            className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-gray-400 hover:text-white"
          >
            + Tag
          </button>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: any }) {
  const isClient = message.sender === 'client';
  const isSystem = message.sender === 'system';
  const isNote = message.is_note;

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <div className="bg-gray-700/50 text-gray-400 px-4 py-2 rounded-lg text-xs max-w-md text-center">
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isClient ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-md rounded-lg px-4 py-2 ${
          isNote
            ? 'bg-amber-500/20 border border-amber-500/30 text-amber-200'
            : isClient
            ? 'bg-gray-700 text-white'
            : 'bg-indigo-600 text-white'
        }`}
      >
        {message.media_url && (
          <div className="mb-2">
            {message.media_type === 'image' && (
              <img src={message.media_url} alt="Media" className="rounded max-w-full" />
            )}
            {message.media_type === 'audio' && (
              <audio controls src={message.media_url} className="w-full" />
            )}
            {message.media_type === 'video' && (
              <video controls src={message.media_url} className="rounded max-w-full" />
            )}
            {message.media_type === 'document' && (
              <a href={message.media_url} target="_blank" rel="noopener noreferrer" className="text-blue-300 underline">
                📎 {message.file_name || 'Documento'}
              </a>
            )}
          </div>
        )}
        <p className="text-sm whitespace-pre-wrap">{message.text}</p>
        <p className={`text-xs mt-1 ${isNote ? 'text-amber-400' : 'text-gray-400'}`}>
          {new Date(message.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          {message.is_ai && ' 🤖'}
          {isNote && ' 📝'}
        </p>
      </div>
    </div>
  );
}
