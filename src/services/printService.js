const net = require('net');
const { prisma } = require('../config/database');
const Log = require('../models/Log');

function cleanAccents(text) {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ç/g, 'c')
    .replace(/Ç/g, 'C');
}

function sendEscPosData(ip, port, dataBuffer) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(8000); // 8 seconds timeout

    socket.connect(port, ip, () => {
      socket.write(dataBuffer, () => {
        socket.destroy();
        resolve(true);
      });
    });

    socket.on('error', (err) => {
      socket.destroy();
      reject(err);
    });

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Tempo limite de conexão esgotado'));
    });
  });
}

async function printOrder(orderId) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        chat: {
          select: { client_name: true, client_phone: true }
        },
        items: {
          include: {
            product: {
              include: {
                category: {
                  select: { id: true, name: true, printer_id: true }
                }
              }
            },
            addons: {
              include: {
                addon: { select: { name: true, price: true } }
              }
            }
          }
        }
      }
    });

    if (!order) {
      console.error(`[Impressão] Pedido ${orderId} não encontrado.`);
      return;
    }

    const companyId = order.company_id;

    const allPrinters = await prisma.printer.findMany({
      where: { company_id: companyId, is_active: true }
    });

    if (allPrinters.length === 0) {
      await Log.add(`[Impressão] Nenhuma impressora ativa configurada para a empresa.`, companyId);
      return;
    }

    const defaultPrinter = allPrinters[0];

    const printerGroups = {};

    for (const item of order.items) {
      const category = item.product.category;
      let targetPrinterId = category?.printer_id;
      let printer = allPrinters.find(p => p.id === targetPrinterId);

      if (!printer) {
        printer = defaultPrinter;
      }

      if (!printerGroups[printer.id]) {
        printerGroups[printer.id] = {
          printer,
          items: []
        };
      }

      printerGroups[printer.id].items.push(item);
    }

    let printSuccessCount = 0;
    const printErrors = [];

    for (const printerId of Object.keys(printerGroups)) {
      const { printer, items } = printerGroups[printerId];
      
      const ESC = '\x1b';
      const GS = '\x1d';
      
      let bytes = [];
      
      // Inicializar
      bytes.push(0x1b, 0x40);
      
      // Beep de Alerta (BEL)
      bytes.push(0x07);
      
      // Centralizar e Negrito
      bytes.push(0x1b, 0x61, 0x01);
      bytes.push(0x1b, 0x45, 0x01);
      
      // Título do Pedido em tamanho duplo
      bytes.push(0x1d, 0x21, 0x11);
      bytes.push(...Buffer.from(cleanAccents(`PEDIDO #${order.id.slice(-6).toUpperCase()}\n\n`), 'latin1'));
      
      // Resetar tamanho e Negrito desativado
      bytes.push(0x1d, 0x21, 0x00);
      bytes.push(0x1b, 0x45, 0x00);
      
      // Alinhamento à esquerda
      bytes.push(0x1b, 0x61, 0x00);
      
      bytes.push(...Buffer.from(cleanAccents(`Cliente: ${order.chat.client_name}\n`), 'latin1'));
      bytes.push(...Buffer.from(cleanAccents(`Telefone: ${order.chat.client_phone}\n`), 'latin1'));
      bytes.push(...Buffer.from(cleanAccents(`Data: ${new Date(order.created_at).toLocaleString('pt-BR')}\n`), 'latin1'));
      bytes.push(...Buffer.from(`--------------------------------\n`, 'latin1'));
      
      // Seção de Itens específicos desta impressora
      bytes.push(0x1b, 0x45, 0x01); // Negrito ativado
      bytes.push(...Buffer.from(cleanAccents(`ITENS (Setor: ${printer.name}):\n\n`), 'latin1'));
      bytes.push(0x1b, 0x45, 0x00); // Negrito desativado
      
      for (const item of items) {
        bytes.push(...Buffer.from(cleanAccents(`${item.quantity}x ${item.product.name}\n`), 'latin1'));
        if (item.notes) {
          bytes.push(...Buffer.from(cleanAccents(`   Obs: ${item.notes}\n`), 'latin1'));
        }
        for (const addonItem of item.addons) {
          bytes.push(...Buffer.from(cleanAccents(`   + ${addonItem.addon.name}\n`), 'latin1'));
        }
        bytes.push(...Buffer.from(`   Subtotal: R$ ${item.total.toFixed(2)}\n\n`, 'latin1'));
      }
      
      bytes.push(...Buffer.from(`--------------------------------\n`, 'latin1'));
      
      // Informações gerais do pedido
      bytes.push(0x1b, 0x45, 0x01); // Negrito ativado
      bytes.push(...Buffer.from(`Total do Pedido: R$ ${order.total.toFixed(2)}\n`, 'latin1'));
      bytes.push(0x1b, 0x45, 0x00); // Negrito desativado
      
      bytes.push(...Buffer.from(cleanAccents(`Pagamento: ${order.payment_method || 'Nao definido'} (${order.payment_status})\n`), 'latin1'));
      if (order.notes) {
        bytes.push(...Buffer.from(cleanAccents(`Obs. Geral: ${order.notes}\n`), 'latin1'));
      }
      
      // Feed lines
      bytes.push(...Buffer.from(`\n\n\n\n`, 'latin1'));
      
      // Corte de papel (GS V 66 0)
      bytes.push(0x1d, 0x56, 0x42, 0x00);
      
      const bufferToSend = Buffer.from(bytes);
      
      try {
        await sendEscPosData(printer.ip_address, printer.port, bufferToSend);
        printSuccessCount++;
        await Log.add(`[Impressão] Cupom impresso com sucesso em: ${printer.name} (${printer.ip_address})`, companyId);
      } catch (err) {
        printErrors.push(`${printer.name}: ${err.message}`);
        await Log.add(`[Impressão] Erro ao imprimir em ${printer.name} (${printer.ip_address}): ${err.message}`, companyId);
      }
    }

    if (printSuccessCount > 0) {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          printed: true,
          printed_at: new Date()
        }
      });
    }

    if (printErrors.length > 0) {
      throw new Error(`Falhas na impressão: ${printErrors.join(', ')}`);
    }

  } catch (error) {
    console.error(`Error printing order ${orderId}:`, error);
    throw error;
  }
}

module.exports = {
  printOrder
};
