const mercadopago = require('mercadopago');
const { prisma } = require('../config/database');
const Chat = require('../models/Chat');
const Log = require('../models/Log');
const { decrypt } = require('../utils/crypto');

async function createMercadoPagoPreference(chatId, item, value, settings, orderData = null) {
  const mpEnabled = settings.mp_enabled;
  const accessToken = settings.mp_access_token;

  if (!mpEnabled || !accessToken || accessToken.trim() === '' || accessToken === 'mock') {
    throw new Error('Módulo Mercado Pago inativo ou credenciais ausentes.');
  }

  const client = new mercadopago.MercadoPagoConfig({ accessToken: accessToken });
  const preference = new mercadopago.Preference(client);
  
  // Gerar ID único para external_reference (será usado para buscar pagamentos)
  const externalRef = `chat_${chatId}_${Date.now()}`;
  
  const metadata = {
    chat_id: chatId
  };
  
  // Se houver dados do pedido, salvar na metadata para recriar Order quando pago
  if (orderData) {
    metadata.order_items = orderData.items;
    metadata.delivery_address = orderData.delivery_address;
    metadata.delivery_notes = orderData.delivery_notes;
  }
  
  const response = await preference.create({
    body: {
      items: [
        {
          title: item,
          quantity: 1,
          unit_price: Number(value),
          currency_id: 'BRL'
        }
      ],
      external_reference: externalRef,
      metadata: metadata
    }
  });

  return {
    id: response.id,
    url: response.init_point,
    external_reference: externalRef
  };
}

async function checkAllPendingPayments() {
  try {
    console.log('[MP Polling] Iniciando verificação de pagamentos pendentes...');
    
    // PERFORMANCE: Filtrar diretamente no banco apenas chats com mensagens de pagamento pendentes
    // Evita table scan completo em toda a tabela de chats
    const chats = await prisma.chat.findMany({
      where: {
        messages: {
          some: {
            payment_status: 'pending',
            payment_id: { not: null }
          }
        }
      },
      include: {
        messages: {
          where: {
            payment_status: 'pending',
            payment_id: { not: null }
          }
        },
        company: true
      }
    });

    console.log(`[MP Polling] Encontrados ${chats.length} chats com pagamentos pendentes`);

    if (chats.length === 0) {
      return;
    }

    for (const chat of chats) {
      const companyId = chat.company_id || 'comp_default';
      const company = chat.company;

      if (!company) {
        console.log(`[MP Polling] Chat ${chat.id} sem empresa associada, pulando...`);
        continue;
      }

      if (!company.mp_access_token) {
        console.log(`[MP Polling] Empresa ${companyId} sem mp_access_token, pulando...`);
        continue;
      }

      if (!company.mp_enabled) {
        console.log(`[MP Polling] Empresa ${companyId} com mp_enabled=false, pulando...`);
        continue;
      }

      // FIX: Descriptografar mp_access_token antes de usar na API
      const accessToken = decrypt(company.mp_access_token);
      
      // Detectar se token parece estar criptografado (formato hex:hex) ou plaintext
      const isEncrypted = /^[0-9a-f]+:[0-9a-f]+$/i.test(company.mp_access_token);
      console.log(`[MP Polling] Empresa ${companyId}: token ${isEncrypted ? 'criptografado' : 'plaintext'}, descriptografado com ${accessToken ? accessToken.length : 0} chars`);
      
      if (!accessToken || accessToken.trim() === '') {
        console.log(`[MP Polling] Empresa ${companyId} token descriptografado vazio, pulando...`);
        continue;
      }

      const pendingMessages = chat.messages; // Já filtrado pelo where acima
      console.log(`[MP Polling] Chat ${chat.id} (${chat.client_name}): ${pendingMessages.length} mensagens pendentes`);

      for (const msg of pendingMessages) {
        try {
          // Verificar se a cobrança tem mais de 1 hora
          const messageAge = Date.now() - new Date(msg.timestamp).getTime();
          const oneHour = 60 * 60 * 1000; // 1 hora em ms
          
          if (messageAge > oneHour) {
            console.log(`[MP Polling] Cobrança ${msg.payment_id} expirada (mais de 1h), marcando como expired`);
            await prisma.message.update({
              where: { id: msg.id },
              data: { payment_status: 'expired' }
            });
            
            // Notificar cliente que o link expirou
            await Chat.addMessage(chat.id, {
              sender: 'system',
              text: `⏰ O link de pagamento expirou após 1 hora. Se ainda tiver interesse, solicite um novo link.`,
              timestamp: new Date(),
              is_ai: false
            });
            
            const { getActiveConnections } = require('./whatsappService');
            const conn = getActiveConnections()[chat.instance_id || 'inst_default'];
            if (conn && conn.connectionStatus === 'open' && conn.sock) {
              try {
                await conn.sock.sendMessage(chat.id, {
                  text: `⏰ *Link Expirado*\n\nO link de pagamento expirou após 1 hora. Se ainda tiver interesse, solicite um novo link.`
                });
              } catch (err) {
                console.error('[MP Polling] Falha ao enviar mensagem de expiração:', err);
              }
            }
            continue;
          }
          
          console.log(`[MP Polling] Verificando external_reference: ${msg.payment_id}`);
          
          const response = await fetch(`https://api.mercadopago.com/v1/payments/search?external_reference=${msg.payment_id}`, {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });

          console.log(`[MP Polling] API respondeu com status: ${response.status}`);

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[MP Polling] Erro na API: ${response.status} - ${errorText}`);
            continue;
          }

          const data = await response.json();
          const payments = data.results || [];
          console.log(`[MP Polling] Encontrados ${payments.length} pagamentos para external_reference ${msg.payment_id}`);

          const approvedPayment = payments.find(p => p.status === 'approved');

          if (approvedPayment) {
            console.log(`[MP Polling] ✅ Pagamento APROVADO encontrado! ID: ${approvedPayment.id}, Valor: ${approvedPayment.transaction_amount}`);
            
            await prisma.message.update({
              where: { id: msg.id },
              data: { payment_status: 'approved' }
            });

            const approvedValue = approvedPayment.transaction_amount;
            const approvedItem = approvedPayment.description || 'Produto';
            
             const oldStatus = chat.status;
            await Chat.update(chat.id, { status: 'finalizada' }, companyId);

            // Buscar metadata do pagamento para recuperar itens do pedido
            const paymentMetadata = approvedPayment.metadata || {};
            const orderItems = paymentMetadata.order_items || [];
            const deliveryAddress = paymentMetadata.delivery_address || null;
            const deliveryNotes = paymentMetadata.delivery_notes || null;

            // Find and auto-print pending order in this chat
            let pendingOrder = await prisma.order.findFirst({
              where: { chat_id: chat.id, status: 'pending' },
              orderBy: { created_at: 'desc' }
            });

            // Se não existir pedido pendente e houver itens na metadata, criar Order
            if (!pendingOrder && orderItems.length > 0) {
              console.log(`[MP Polling] Criando pedido a partir da metadata do pagamento...`);
              
              // Buscar produtos do catálogo pelo nome
              const catalogController = require('../controllers/catalogController');
              const catalogCategories = await catalogController.getCatalogForAI(companyId);
              const allProducts = [];
              catalogCategories.forEach(cat => {
                cat.products.forEach(prod => allProducts.push(prod));
              });
              
              let subtotal = 0;
              const itemsToCreate = [];
              
              for (const item of orderItems) {
                const product = allProducts.find(p => 
                  p.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === 
                  (item.product_name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                );
                
                if (product) {
                  let unitPrice = product.price;
                  let variantId = null;
                  
                  if (item.variant_name && product.variants) {
                    const variant = product.variants.find(v => 
                      v.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === 
                      item.variant_name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                    );
                    if (variant) {
                      unitPrice += variant.price_diff;
                      variantId = variant.id;
                    }
                  }
                  
                  let addonsTotal = 0;
                  const itemAddons = [];
                  if (item.addon_names && item.addon_names.length > 0 && product.addons) {
                    for (const addonName of item.addon_names) {
                      const addon = product.addons.find(a => 
                        a.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === 
                        addonName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                      );
                      if (addon) {
                        addonsTotal += addon.price;
                        itemAddons.push({ addon_id: addon.id, quantity: 1 });
                      }
                    }
                  }
                  
                  unitPrice += addonsTotal;
                  const quantity = item.quantity || 1;
                  const itemTotal = unitPrice * quantity;
                  subtotal += itemTotal;
                  
                  itemsToCreate.push({
                    product_id: product.id,
                    variant_id: variantId,
                    quantity,
                    unit_price: unitPrice,
                    total: itemTotal,
                    notes: item.notes || null,
                    addons: itemAddons.length > 0 ? { create: itemAddons } : undefined
                  });
                }
              }
              
              if (itemsToCreate.length > 0) {
                const total = subtotal;
                const notes = [
                  deliveryAddress ? `Endereço: ${deliveryAddress}` : null,
                  deliveryNotes ? `Obs: ${deliveryNotes}` : null
                ].filter(Boolean).join(' | ') || null;
                
                pendingOrder = await prisma.order.create({
                  data: {
                    chat_id: chat.id,
                    status: 'preparing',
                    subtotal,
                    discount: 0,
                    total,
                    payment_method: 'mercadopago',
                    payment_status: 'paid',
                    notes,
                    company_id: companyId,
                    items: { create: itemsToCreate }
                  }
                });
                
                console.log(`[MP Polling] Pedido ${pendingOrder.id} criado com ${itemsToCreate.length} itens, R$ ${total.toFixed(2)}`);
                
                // Disparar impressão
                try {
                  const printService = require('./printService');
                  await printService.printOrder(pendingOrder.id);
                  console.log(`[MP Polling] Impressão disparada para pedido ${pendingOrder.id}`);
                } catch (printErr) {
                  console.error('[MP Polling] Falha ao imprimir:', printErr);
                }
              }
            } else if (pendingOrder) {
              console.log(`[MP Polling] Atualizando pedido ${pendingOrder.id} para paid/preparing`);
              await prisma.order.update({
                where: { id: pendingOrder.id },
                data: { payment_status: 'paid', status: 'preparing' }
              });

              try {
                const printService = require('./printService');
                await printService.printOrder(pendingOrder.id);
                console.log(`[MP Polling] Impressão disparada para pedido ${pendingOrder.id}`);
              } catch (printErr) {
                console.error('[MP Polling] Falha ao imprimir:', printErr);
              }
            } else {
              console.log(`[MP Polling] Nenhum pedido pendente encontrado para chat ${chat.id}`);
            }

            const confirmMsg1 = {
              sender: 'system',
              text: `✅ Pagamento REAL de R$ ${Number(approvedValue).toFixed(2)} recebido com sucesso via Mercado Pago! (Item: ${approvedItem})`,
              timestamp: new Date(),
              is_ai: false
            };

            const confirmMsg2 = {
              sender: 'system',
              text: `🤖 Atendente IA: Alterando status do cliente de '${oldStatus}' para 'finalizada'.`,
              timestamp: new Date(),
              is_ai: false
            };

            await Chat.addMessage(chat.id, confirmMsg1);
            await Chat.addMessage(chat.id, confirmMsg2);
            
            await Log.add(`Mercado Pago REAL (Auto-Sincronização): Pagamento APROVADO para ${chat.client_name}. Status atualizado para 'finalizada'.`, companyId);

            const { getActiveConnections } = require('./whatsappService');
            const conn = getActiveConnections()[chat.instance_id || 'inst_default'];
            if (conn && conn.connectionStatus === 'open' && conn.sock) {
              try {
                const targetJid = chat.id;
                await conn.sock.sendMessage(targetJid, { 
                  text: `✅ *Pagamento Aprovado!*\n\nConfirmamos o recebimento de R$ ${Number(approvedValue).toFixed(2)} pelo item *${approvedItem}*. Obrigado!` 
                });
                console.log(`[MP Polling] Mensagem de confirmação enviada para ${chat.client_name}`);
              } catch (err) {
                console.error('[MP Polling] Falha ao enviar mensagem WhatsApp:', err);
              }
            } else {
              console.log(`[MP Polling] WhatsApp não conectado para instância ${chat.instance_id}, mensagem não enviada`);
            }
          } else {
            console.log(`[MP Polling] Nenhum pagamento aprovado encontrado para external_reference ${msg.payment_id}`);
            if (payments.length > 0) {
              console.log(`[MP Polling] Status dos pagamentos: ${payments.map(p => p.status).join(', ')}`);
            }
          }
        } catch (err) {
          console.error(`[MP Polling] Erro ao verificar pagamento ${msg.payment_id}:`, err);
        }
      }
    }
    
    console.log('[MP Polling] Verificação concluída');
  } catch (error) {
    console.error('[MP Polling] Erro geral:', error);
  }
}

module.exports = {
  createMercadoPagoPreference,
  checkAllPendingPayments
};
