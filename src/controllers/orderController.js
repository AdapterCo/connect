const { prisma } = require('../config/database');

async function createOrder(req, res) {
  try {
    const companyId = req.user.company_id;
    const { chat_id, items, notes, payment_method } = req.body;

    if (!chat_id) {
      return res.status(400).json({ error: 'Chat é obrigatório.' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Pedido deve ter pelo menos um item.' });
    }

    const chat = await prisma.chat.findFirst({
      where: { id: chat_id, company_id: companyId }
    });

    if (!chat) {
      return res.status(404).json({ error: 'Chat não encontrado.' });
    }

    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await prisma.product.findFirst({
        where: { id: item.product_id, company_id: companyId, is_active: true },
        include: { variants: true, addons: true }
      });

      if (!product) {
        return res.status(400).json({ error: `Produto ${item.product_id} não encontrado ou inativo.` });
      }

      let unitPrice = product.price;

      if (item.variant_id) {
        const variant = product.variants.find(v => v.id === item.variant_id);
        if (!variant) {
          return res.status(400).json({ error: `Variação não encontrada para ${product.name}.` });
        }
        unitPrice += variant.price_diff;
      }

      let addonsTotal = 0;
      const itemAddons = [];

      if (item.addons && Array.isArray(item.addons)) {
        for (const addonItem of item.addons) {
          const addon = product.addons.find(a => a.id === addonItem.addon_id);
          if (!addon) {
            return res.status(400).json({ error: `Adicional não encontrado para ${product.name}.` });
          }
          addonsTotal += addon.price * (addonItem.quantity || 1);
          itemAddons.push({
            addon_id: addon.id,
            quantity: addonItem.quantity || 1
          });
        }
      }

      unitPrice += addonsTotal;
      const quantity = item.quantity || 1;
      const itemTotal = unitPrice * quantity;

      orderItems.push({
        product_id: product.id,
        variant_id: item.variant_id || null,
        quantity,
        unit_price: unitPrice,
        total: itemTotal,
        notes: item.notes || null,
        addons: itemAddons
      });

      subtotal += itemTotal;
    }

    const total = subtotal;

    const order = await prisma.order.create({
      data: {
        chat_id,
        status: 'pending',
        subtotal,
        discount: 0,
        total,
        payment_method: payment_method || null,
        payment_status: 'pending',
        notes: notes || null,
        company_id: companyId,
        items: {
          create: orderItems.map(item => ({
            product_id: item.product_id,
            variant_id: item.variant_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total: item.total,
            notes: item.notes,
            addons: item.addons.length > 0 ? {
              create: item.addons
            } : undefined
          }))
        }
      },
      include: {
        items: {
          include: {
            product: { select: { name: true } },
            addons: {
              include: {
                addon: { select: { name: true, price: true } }
              }
            }
          }
        }
      }
    });

    res.status(201).json(order);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar pedido: ' + error.message });
  }
}

async function listOrders(req, res) {
  try {
    const companyId = req.user.company_id;
    const { status, chat_id, from, to, page = 1, limit = 50 } = req.query;

    const where = { company_id: companyId };
    if (status) where.status = status;
    if (chat_id) where.chat_id = chat_id;
    if (from || to) {
      where.created_at = {};
      if (from) where.created_at.gte = new Date(from);
      if (to) where.created_at.lte = new Date(to);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          chat: { select: { client_name: true, client_phone: true } },
          items: {
            include: {
              product: { select: { name: true } },
              addons: {
                include: {
                  addon: { select: { name: true } }
                }
              }
            }
          }
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.order.count({ where })
    ]);

    res.json({
      orders,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar pedidos.' });
  }
}

async function getOrder(req, res) {
  try {
    const companyId = req.user.company_id;
    const { id } = req.params;

    const order = await prisma.order.findFirst({
      where: { id, company_id: companyId },
      include: {
        chat: { select: { client_name: true, client_phone: true } },
        items: {
          include: {
            product: { select: { name: true } },
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
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar pedido.' });
  }
}

async function updateOrderStatus(req, res) {
  try {
    const companyId = req.user.company_id;
    const { id } = req.params;
    const { status, payment_status } = req.body;

    const order = await prisma.order.findFirst({
      where: { id, company_id: companyId }
    });

    if (!order) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    const updateData = {};
    if (status) updateData.status = status;
    if (payment_status) updateData.payment_status = payment_status;

    const updated = await prisma.order.update({
      where: { id },
      data: updateData,
      include: {
        items: {
          include: {
            product: { select: { name: true } },
            addons: {
              include: {
                addon: { select: { name: true } }
              }
            }
          }
        }
      }
    });

    if (status === 'preparing' || payment_status === 'paid') {
      try {
        const printService = require('../services/printService');
        await printService.printOrder(id);
      } catch (printErr) {
        console.error('Auto print failed:', printErr);
      }
    }

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar pedido: ' + error.message });
  }
}

async function deleteOrder(req, res) {
  try {
    const companyId = req.user.company_id;
    const { id } = req.params;

    const order = await prisma.order.findFirst({
      where: { id, company_id: companyId }
    });

    if (!order) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    await prisma.order.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir pedido.' });
  }
}

async function getOrderStats(req, res) {
  try {
    const companyId = req.user.company_id;
    const { from, to } = req.query;

    const dateFilter = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);

    const where = { company_id: companyId };
    if (Object.keys(dateFilter).length > 0) {
      where.created_at = dateFilter;
    }

    const [totalOrders, totalRevenue, avgOrderValue, statusCounts] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.aggregate({
        where: { ...where, payment_status: 'paid' },
        _sum: { total: true }
      }),
      prisma.order.aggregate({
        where: { ...where, payment_status: 'paid' },
        _avg: { total: true }
      }),
      prisma.order.groupBy({
        by: ['status'],
        where,
        _count: { id: true }
      })
    ]);

    res.json({
      totalOrders,
      totalRevenue: totalRevenue._sum.total || 0,
      avgOrderValue: avgOrderValue._avg.total || 0,
      statusCounts: statusCounts.reduce((acc, curr) => {
        acc[curr.status] = curr._count.id;
        return acc;
      }, {})
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar estatísticas.' });
  }
}

async function printOrderManual(req, res) {
  try {
    const companyId = req.user.company_id;
    const { id } = req.params;

    const order = await prisma.order.findFirst({
      where: { id, company_id: companyId }
    });

    if (!order) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    const printService = require('../services/printService');
    await printService.printOrder(id);

    res.json({ success: true, message: 'Impressão disparada com sucesso.' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao disparar impressão: ' + error.message });
  }
}

module.exports = {
  createOrder,
  listOrders,
  getOrder,
  updateOrderStatus,
  deleteOrder,
  getOrderStats,
  printOrderManual
};
