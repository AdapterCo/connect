import { useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { useAppStore } from '../stores/appStore';
import type { Chat } from '../types';

export default function Kanban() {
  const { chats, fetchChats, updateChatStatus } = useAppStore();

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  const columns: { id: Chat['status']; title: string; color: string }[] = [
    { id: 'iniciada', title: 'Iniciada / Novo', color: 'bg-blue-500' },
    { id: 'interesse em compra', title: 'Interesse em Compra', color: 'bg-amber-500' },
    { id: 'finalizada', title: 'Finalizada / Pago', color: 'bg-green-500' },
  ];

  const handleDragEnd = (result: any) => {
    if (!result.destination) return;
    const chatId = result.draggableId;
    const newStatus = result.destination.droppableId as Chat['status'];
    updateChatStatus(chatId, newStatus);
  };

  return (
    <div className="h-full overflow-hidden p-6">
      <h2 className="text-2xl font-bold mb-6">Pipeline (Kanban)</h2>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-3 gap-4 h-[calc(100%-4rem)]">
          {columns.map(column => {
            const columnChats = chats.filter(c => c.status === column.id);
            return (
              <div key={column.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex flex-col">
                <div className="flex items-center justify-between mb-4 pb-3 border-b-2" style={{ borderColor: `var(--status-${column.id})` }}>
                  <h3 className="font-bold text-white flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${column.color}`} />
                    {column.title}
                  </h3>
                  <span className="bg-gray-700 text-gray-300 text-xs font-bold px-2 py-1 rounded-full">
                    {columnChats.length}
                  </span>
                </div>

                <Droppable droppableId={column.id}>
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="flex-1 overflow-y-auto space-y-3"
                    >
                      {columnChats.map((chat, index) => (
                        <Draggable key={chat.id} draggableId={chat.id} index={index}>
                          {(provided) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className="bg-gray-700 border border-gray-600 rounded-lg p-3 cursor-move hover:border-indigo-500"
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center text-sm font-bold">
                                  {chat.client_name.charAt(0)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-white text-sm truncate">{chat.client_name}</p>
                                  <p className="text-xs text-gray-400">+{chat.client_phone.slice(-4)}</p>
                                </div>
                              </div>
                              {chat.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {chat.tags.slice(0, 3).map(tag => (
                                    <span key={tag} className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded text-xs">
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>
    </div>
  );
}
