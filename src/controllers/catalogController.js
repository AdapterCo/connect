const { prisma } = require('../config/database');

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function listCategories(req, res) {
  try {
    const companyId = req.user.company_id;
    const categories = await prisma.category.findMany({
      where: { company_id: companyId },
      include: {
        _count: { select: { products: true } },
        printer: { select: { id: true, name: true } }
      },
      orderBy: { sort_order: 'asc' }
    });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar categorias.' });
  }
}

async function createCategory(req, res) {
  try {
    const companyId = req.user.company_id;
    const { name, sort_order, printer_id } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Nome da categoria é obrigatório.' });
    }

    const slug = slugify(name);

    const existing = await prisma.category.findUnique({
      where: { company_id_slug: { company_id: companyId, slug } }
    });

    if (existing) {
      return res.status(400).json({ error: 'Já existe uma categoria com este nome.' });
    }

    const category = await prisma.category.create({
      data: {
        name: name.trim(),
        slug,
        sort_order: sort_order || 0,
        printer_id: printer_id || null,
        company_id: companyId
      }
    });

    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar categoria.' });
  }
}

async function updateCategory(req, res) {
  try {
    const companyId = req.user.company_id;
    const { id } = req.params;
    const { name, is_active, sort_order, printer_id } = req.body;

    const category = await prisma.category.findFirst({
      where: { id, company_id: companyId }
    });

    if (!category) {
      return res.status(404).json({ error: 'Categoria não encontrada.' });
    }

    const updateData = {};
    if (name !== undefined) {
      updateData.name = name.trim();
      updateData.slug = slugify(name);
    }
    if (is_active !== undefined) updateData.is_active = is_active;
    if (sort_order !== undefined) updateData.sort_order = sort_order;
    if (printer_id !== undefined) updateData.printer_id = printer_id || null;

    const updated = await prisma.category.update({
      where: { id },
      data: updateData
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar categoria.' });
  }
}

async function deleteCategory(req, res) {
  try {
    const companyId = req.user.company_id;
    const { id } = req.params;

    const category = await prisma.category.findFirst({
      where: { id, company_id: companyId },
      include: { _count: { select: { products: true } } }
    });

    if (!category) {
      return res.status(404).json({ error: 'Categoria não encontrada.' });
    }

    if (category._count.products > 0) {
      return res.status(400).json({ error: 'Não é possível excluir categoria com produtos vinculados.' });
    }

    await prisma.category.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir categoria.' });
  }
}

async function listProducts(req, res) {
  try {
    const companyId = req.user.company_id;
    const { category_id, is_active, search } = req.query;

    const where = { company_id: companyId };
    if (category_id) where.category_id = category_id;
    if (is_active !== undefined) where.is_active = is_active === 'true';
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const products = await prisma.product.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
        variants: true,
        addons: true,
        _count: { select: { orderItems: true } }
      },
      orderBy: [{ category: { sort_order: 'asc' } }, { sort_order: 'asc' }]
    });

    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar produtos.' });
  }
}

async function getProduct(req, res) {
  try {
    const companyId = req.user.company_id;
    const { id } = req.params;

    const product = await prisma.product.findFirst({
      where: { id, company_id: companyId },
      include: {
        category: true,
        variants: true,
        addons: true
      }
    });

    if (!product) {
      return res.status(404).json({ error: 'Produto não encontrado.' });
    }

    res.json(product);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar produto.' });
  }
}

async function createProduct(req, res) {
  try {
    const companyId = req.user.company_id;
    const { name, description, price, image_url, is_active, sort_order, category_id, variants, addons } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Nome do produto é obrigatório.' });
    }

    if (price === undefined || price < 0) {
      return res.status(400).json({ error: 'Preço deve ser um valor positivo.' });
    }

    if (!category_id) {
      return res.status(400).json({ error: 'Categoria é obrigatória.' });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { max_products: true }
    });

    const productCount = await prisma.product.count({
      where: { company_id: companyId }
    });

    const maxProducts = company?.max_products || 30;
    if (productCount >= maxProducts) {
      return res.status(403).json({
        error: `Limite de produtos atingido (${maxProducts}). Faça upgrade do seu plano para adicionar mais produtos.`
      });
    }

    const category = await prisma.category.findFirst({
      where: { id: category_id, company_id: companyId }
    });

    if (!category) {
      return res.status(400).json({ error: 'Categoria não encontrada.' });
    }

    const slug = slugify(name);

    const existing = await prisma.product.findUnique({
      where: { company_id_slug: { company_id: companyId, slug } }
    });

    if (existing) {
      return res.status(400).json({ error: 'Já existe um produto com este nome.' });
    }

    const product = await prisma.product.create({
      data: {
        name: name.trim(),
        slug,
        description: description?.trim() || null,
        price: parseFloat(price),
        image_url: image_url || null,
        is_active: is_active !== false,
        sort_order: sort_order || 0,
        category_id,
        company_id: companyId,
        variants: variants?.length ? {
          create: variants.map(v => ({
            name: v.name,
            price_diff: parseFloat(v.price_diff) || 0
          }))
        } : undefined,
        addons: addons?.length ? {
          create: addons.map(a => ({
            name: a.name,
            price: parseFloat(a.price) || 0
          }))
        } : undefined
      },
      include: {
        category: true,
        variants: true,
        addons: true
      }
    });

    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar produto: ' + error.message });
  }
}

async function updateProduct(req, res) {
  try {
    const companyId = req.user.company_id;
    const { id } = req.params;
    const { name, description, price, image_url, is_active, sort_order, category_id, variants, addons } = req.body;

    const product = await prisma.product.findFirst({
      where: { id, company_id: companyId }
    });

    if (!product) {
      return res.status(404).json({ error: 'Produto não encontrado.' });
    }

    const updateData = {};
    if (name !== undefined) {
      updateData.name = name.trim();
      updateData.slug = slugify(name);
    }
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (price !== undefined) updateData.price = parseFloat(price);
    if (image_url !== undefined) updateData.image_url = image_url || null;
    if (is_active !== undefined) updateData.is_active = is_active;
    if (sort_order !== undefined) updateData.sort_order = sort_order;
    if (category_id !== undefined) {
      const category = await prisma.category.findFirst({
        where: { id: category_id, company_id: companyId }
      });
      if (!category) {
        return res.status(400).json({ error: 'Categoria não encontrada.' });
      }
      updateData.category_id = category_id;
    }

    if (variants !== undefined || addons !== undefined) {
      await prisma.$transaction(async (tx) => {
        if (variants !== undefined) {
          await tx.productVariant.deleteMany({ where: { product_id: id } });
          if (variants.length > 0) {
            await tx.productVariant.createMany({
              data: variants.map(v => ({
                name: v.name,
                price_diff: parseFloat(v.price_diff) || 0,
                product_id: id
              }))
            });
          }
        }

        if (addons !== undefined) {
          await tx.productAddon.deleteMany({ where: { product_id: id } });
          if (addons.length > 0) {
            await tx.productAddon.createMany({
              data: addons.map(a => ({
                name: a.name,
                price: parseFloat(a.price) || 0,
                product_id: id
              }))
            });
          }
        }
      });
    }

    const updated = await prisma.product.update({
      where: { id },
      data: updateData,
      include: {
        category: true,
        variants: true,
        addons: true
      }
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar produto.' });
  }
}

async function deleteProduct(req, res) {
  try {
    const companyId = req.user.company_id;
    const { id } = req.params;

    const product = await prisma.product.findFirst({
      where: { id, company_id: companyId },
      include: { _count: { select: { orderItems: true } } }
    });

    if (!product) {
      return res.status(404).json({ error: 'Produto não encontrado.' });
    }

    if (product._count.orderItems > 0) {
      await prisma.product.update({
        where: { id },
        data: { is_active: false }
      });
      return res.json({ success: true, message: 'Produto desativado (possui pedidos vinculados).' });
    }

    await prisma.product.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir produto.' });
  }
}

async function getCatalogForAI(companyId) {
  const categories = await prisma.category.findMany({
    where: { company_id: companyId, is_active: true },
    include: {
      products: {
        where: { is_active: true },
        include: { variants: true, addons: true },
        orderBy: { sort_order: 'asc' }
      }
    },
    orderBy: { sort_order: 'asc' }
  });

  return categories.filter(c => c.products.length > 0);
}

function formatCatalogForPrompt(categories) {
  if (!categories || categories.length === 0) {
    return 'Nenhum produto cadastrado no catálogo.';
  }

  let catalog = '### 📋 Catálogo de Produtos:\n';
  
  categories.forEach(category => {
    catalog += `\n**${category.name}:**\n`;
    category.products.forEach(product => {
      catalog += `- **${product.name}**: R$ ${product.price.toFixed(2)}`;
      if (product.description) {
        catalog += ` - ${product.description}`;
      }
      catalog += '\n';
      
      if (product.variants.length > 0) {
        catalog += `  - Variações: ${product.variants.map(v => `${v.name} (${v.price_diff >= 0 ? '+' : ''}R$ ${v.price_diff.toFixed(2)})`).join(', ')}\n`;
      }
      
      if (product.addons.length > 0) {
        catalog += `  - Adicionais: ${product.addons.map(a => `${a.name} (+R$ ${a.price.toFixed(2)})`).join(', ')}\n`;
      }
    });
  });

  return catalog;
}

async function getPublicCatalog(req, res) {
  try {
    const { slug } = req.params;

    const company = await prisma.company.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        logo_url: true,
        primary_color: true,
        is_active: true,
        instances: {
          where: { status: 'connected' },
          select: { phone: true },
          take: 1
        }
      }
    });

    if (!company) {
      return res.status(404).json({ error: 'Cardapio nao encontrado.' });
    }

    if (!company.is_active) {
      return res.status(403).json({ error: 'Cardapio inativo no momento.' });
    }

    const categories = await prisma.category.findMany({
      where: { company_id: company.id, is_active: true },
      include: {
        products: {
          where: { is_active: true },
          include: {
            variants: { orderBy: { price_diff: 'asc' } },
            addons: { orderBy: { price: 'asc' } }
          },
          orderBy: { sort_order: 'asc' }
        }
      },
      orderBy: { sort_order: 'asc' }
    });

    const activeCategories = categories.filter(c => c.products.length > 0);

    res.json({
      company: {
        name: company.name,
        logo_url: company.logo_url,
        primary_color: company.primary_color,
        phone: company.instances[0]?.phone || null
      },
      categories: activeCategories
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao carregar cardapio publico: ' + error.message });
  }
}

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  getCatalogForAI,
  formatCatalogForPrompt,
  getPublicCatalog
};
