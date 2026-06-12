import { useEffect, useState } from 'react';
import api from '../services/api';

interface Printer {
  id: string;
  name: string;
  ip_address: string;
  port: number;
  is_active: boolean;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  sort_order: number;
  _count: { products: number };
  printer_id?: string | null;
  printer?: { id: string; name: string } | null;
}

interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
  category: { id: string; name: string };
  variants: { id: string; name: string; price_diff: number }[];
  addons: { id: string; name: string; price: number }[];
  _count: { orderItems: number };
}

export default function Catalog() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [showPrinterForm, setShowPrinterForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingPrinter, setEditingPrinter] = useState<Printer | null>(null);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterActive, setFilterActive] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchCategories();
    fetchProducts();
    fetchPrinters();
  }, []);

  const fetchPrinters = async () => {
    try {
      const res = await api.get('/printers');
      setPrinters(res.data);
    } catch (err) {}
  };

  useEffect(() => {
    fetchProducts();
  }, [filterCategory, filterActive, search]);

  const fetchCategories = async () => {
    const res = await api.get('/catalog/categories');
    setCategories(res.data);
  };

  const fetchProducts = async () => {
    const params: Record<string, string> = {};
    if (filterCategory) params.category_id = filterCategory;
    if (filterActive !== '') params.is_active = filterActive;
    if (search) params.search = search;
    const res = await api.get('/catalog/products', { params });
    setProducts(res.data);
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta categoria?')) return;
    try {
      await api.delete(`/catalog/categories/${id}`);
      fetchCategories();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao excluir categoria.');
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir/desativar este produto?')) return;
    try {
      await api.delete(`/catalog/products/${id}`);
      fetchProducts();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao excluir produto.');
    }
  };

  const handleToggleActive = async (type: 'category' | 'product', id: string, currentActive: boolean) => {
    try {
      await api.put(`/catalog/${type}s/${id}`, { is_active: !currentActive });
      if (type === 'category') fetchCategories();
      else fetchProducts();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao atualizar.');
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Catálogo de Produtos</h2>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowCategoryForm(true); setEditingCategory(null); }}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-600"
          >
            ➕ Nova Categoria
          </button>
          <button
            onClick={() => { setShowProductForm(true); setEditingProduct(null); }}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
          >
            ➕ Novo Produto
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Buscar produto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
        >
          <option value="">Todas as Categorias</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
        <select
          value={filterActive}
          onChange={(e) => setFilterActive(e.target.value)}
          className="bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
        >
          <option value="">Todos</option>
          <option value="true">Ativos</option>
          <option value="false">Inativos</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map(product => (
          <div key={product.id} className={`bg-gray-800 border rounded-xl p-4 ${product.is_active ? 'border-gray-700' : 'border-red-500/30 opacity-60'}`}>
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <h3 className="font-bold text-white">{product.name}</h3>
                <p className="text-xs text-gray-400">{product.category.name}</p>
              </div>
              <span className={`px-2 py-1 rounded text-xs ${product.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                {product.is_active ? 'Ativo' : 'Oculto'}
              </span>
            </div>
            
            {product.description && (
              <p className="text-sm text-gray-400 mb-2 line-clamp-2">{product.description}</p>
            )}
            
            <p className="text-xl font-bold text-indigo-400 mb-3">
              R$ {product.price.toFixed(2)}
            </p>

            {product.variants.length > 0 && (
              <div className="mb-2">
                <p className="text-xs text-gray-500 mb-1">Variações:</p>
                <div className="flex flex-wrap gap-1">
                  {product.variants.map(v => (
                    <span key={v.id} className="px-2 py-0.5 bg-gray-700 text-gray-300 rounded text-xs">
                      {v.name} {v.price_diff !== 0 && `(${v.price_diff >= 0 ? '+' : ''}${v.price_diff.toFixed(2)})`}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {product.addons.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-gray-500 mb-1">Adicionais:</p>
                <div className="flex flex-wrap gap-1">
                  {product.addons.map(a => (
                    <span key={a.id} className="px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded text-xs">
                      {a.name} +R${a.price.toFixed(2)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2 border-t border-gray-700">
              <button
                onClick={() => handleToggleActive('product', product.id, product.is_active)}
                className={`flex-1 px-3 py-1 rounded text-xs font-medium ${product.is_active ? 'bg-amber-500/20 text-amber-400' : 'bg-green-500/20 text-green-400'}`}
              >
                {product.is_active ? 'Ocultar' : 'Ativar'}
              </button>
              <button
                onClick={() => { setEditingProduct(product); setShowProductForm(true); }}
                className="flex-1 px-3 py-1 bg-gray-700 text-white rounded text-xs font-medium hover:bg-gray-600"
              >
                Editar
              </button>
              <button
                onClick={() => handleDeleteProduct(product.id)}
                className="px-3 py-1 border border-red-500/30 text-red-400 rounded text-xs hover:bg-red-500/10"
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>

      {products.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p className="text-4xl mb-2">📦</p>
          <p>Nenhum produto encontrado.</p>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Categorias */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">Categorias</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {categories.map(cat => (
              <div key={cat.id} className={`bg-gray-800 border rounded-lg p-3 flex items-center justify-between ${cat.is_active ? 'border-gray-700' : 'border-red-500/30 opacity-60'}`}>
                <div>
                  <p className="font-medium text-white text-sm">{cat.name}</p>
                  <p className="text-xs text-gray-400">{cat._count.products} produto(s)</p>
                  {cat.printer && (
                    <p className="text-[10px] text-indigo-400 mt-1">🖨️ {cat.printer.name}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleToggleActive('category', cat.id, cat.is_active)}
                    className={`px-2 py-1 rounded text-xs ${cat.is_active ? 'text-amber-400' : 'text-green-400'}`}
                  >
                    {cat.is_active ? '👁️' : '👁️‍🗨️'}
                  </button>
                  <button
                    onClick={() => { setEditingCategory(cat); setShowCategoryForm(true); }}
                    className="px-2 py-1 text-gray-400 rounded text-xs hover:text-white"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDeleteCategory(cat.id)}
                    className="px-2 py-1 text-red-400 rounded text-xs hover:text-red-300"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Impressoras */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">Impressoras Térmicas</h3>
            <button
              onClick={() => { setShowPrinterForm(true); setEditingPrinter(null); }}
              className="px-2.5 py-1 bg-gray-800 border border-gray-700 text-gray-200 text-xs font-semibold rounded hover:bg-gray-700 transition"
            >
              ➕ Nova Impressora
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {printers.map(printer => (
              <div key={printer.id} className={`bg-gray-800 border rounded-lg p-3 flex items-center justify-between ${printer.is_active ? 'border-gray-700' : 'border-red-500/30 opacity-60'}`}>
                <div>
                  <p className="font-medium text-white text-sm">{printer.name}</p>
                  <p className="text-xs text-gray-400">{printer.ip_address}:{printer.port}</p>
                  <span className={`text-[10px] font-semibold ${printer.is_active ? 'text-green-400' : 'text-red-400'}`}>
                    {printer.is_active ? 'Ativa' : 'Inativa'}
                  </span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={async () => {
                      await api.put(`/printers/${printer.id}`, { is_active: !printer.is_active });
                      fetchPrinters();
                    }}
                    className={`px-2 py-1 rounded text-xs ${printer.is_active ? 'text-amber-400' : 'text-green-400'}`}
                  >
                    {printer.is_active ? '👁️' : '👁️‍🗨️'}
                  </button>
                  <button
                    onClick={() => { setEditingPrinter(printer); setShowPrinterForm(true); }}
                    className="px-2 py-1 text-gray-400 rounded text-xs hover:text-white"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm('Deseja excluir esta impressora?')) return;
                      await api.delete(`/printers/${printer.id}`);
                      fetchPrinters();
                    }}
                    className="px-2 py-1 text-red-400 rounded text-xs hover:text-red-300"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
            {printers.length === 0 && (
              <div className="col-span-2 text-center py-6 text-gray-500 text-xs">
                Nenhuma impressora configurada.
              </div>
            )}
          </div>
        </div>
      </div>

      {showCategoryForm && (
        <CategoryForm
          category={editingCategory}
          printers={printers}
          onClose={() => { setShowCategoryForm(false); setEditingCategory(null); }}
          onSave={() => { fetchCategories(); setShowCategoryForm(false); }}
        />
      )}

      {showPrinterForm && (
        <PrinterForm
          printer={editingPrinter}
          onClose={() => { setShowPrinterForm(false); setEditingPrinter(null); }}
          onSave={() => { fetchPrinters(); setShowPrinterForm(false); }}
        />
      )}

      {showProductForm && (
        <ProductForm
          product={editingProduct}
          categories={categories}
          onClose={() => { setShowProductForm(false); setEditingProduct(null); }}
          onSave={() => { fetchProducts(); setShowProductForm(false); }}
        />
      )}
    </div>
  );
}

function CategoryForm({ category, printers, onClose, onSave }: { category: Category | null; printers: Printer[]; onClose: () => void; onSave: () => void }) {
  const [name, setName] = useState(category?.name || '');
  const [sort_order, setSortOrder] = useState(category?.sort_order || 0);
  const [printer_id, setPrinterId] = useState(category?.printer_id || '');
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    try {
      const payload = { name, sort_order, printer_id: printer_id || null };
      if (category) {
        await api.put(`/catalog/categories/${category.id}`, payload);
      } else {
        await api.post('/catalog/categories', payload);
      }
      onSave();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao salvar categoria.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-bold text-white mb-4">{category ? 'Editar' : 'Nova'} Categoria</h3>
        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Nome</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
              placeholder="Ex: Pizzas, Bebidas, Sobremesas"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Ordem</label>
            <input
              type="number"
              value={sort_order}
              onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Impressora de Destino</label>
            <select
              value={printer_id}
              onChange={(e) => setPrinterId(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="">Nenhuma (Usa Padrão)</option>
              {printers.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.ip_address})</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700">
            Cancelar
          </button>
          <button onClick={handleSubmit} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductForm({ product, categories, onClose, onSave }: { product: Product | null; categories: Category[]; onClose: () => void; onSave: () => void }) {
  const [formData, setFormData] = useState({
    name: product?.name || '',
    description: product?.description || '',
    price: product?.price || 0,
    image_url: product?.image_url || '',
    is_active: product?.is_active ?? true,
    sort_order: product?.sort_order || 0,
    category_id: product?.category?.id || categories[0]?.id || ''
  });
  const [variants, setVariants] = useState<{ name: string; price_diff: number }[]>(
    product?.variants?.map(v => ({ name: v.name, price_diff: v.price_diff })) || []
  );
  const [addons, setAddons] = useState<{ name: string; price: number }[]>(
    product?.addons?.map(a => ({ name: a.name, price: a.price })) || []
  );
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    try {
      const data = { ...formData, price: parseFloat(String(formData.price)), variants, addons };
      if (product) {
        await api.put(`/catalog/products/${product.id}`, data);
      } else {
        await api.post('/catalog/products', data);
      }
      onSave();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao salvar produto.');
    }
  };

  const addVariant = () => setVariants([...variants, { name: '', price_diff: 0 }]);
  const removeVariant = (i: number) => setVariants(variants.filter((_, idx) => idx !== i));
  const updateVariant = (i: number, field: string, value: string | number) => {
    const updated = [...variants];
    if (field === 'price_diff') {
      updated[i] = { ...updated[i], price_diff: parseFloat(String(value)) || 0 };
    } else {
      updated[i] = { ...updated[i], name: String(value) };
    }
    setVariants(updated);
  };

  const addAddon = () => setAddons([...addons, { name: '', price: 0 }]);
  const removeAddon = (i: number) => setAddons(addons.filter((_, idx) => idx !== i));
  const updateAddon = (i: number, field: string, value: string | number) => {
    const updated = [...addons];
    if (field === 'price') {
      updated[i] = { ...updated[i], price: parseFloat(String(value)) || 0 };
    } else {
      updated[i] = { ...updated[i], name: String(value) };
    }
    setAddons(updated);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-white mb-4">{product ? 'Editar' : 'Novo'} Produto</h3>
        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
        
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm text-gray-400 mb-1">Nome *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          
          <div>
            <label className="block text-sm text-gray-400 mb-1">Preço (R$) *</label>
            <input
              type="number"
              step="0.01"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          
          <div>
            <label className="block text-sm text-gray-400 mb-1">Categoria *</label>
            <select
              value={formData.category_id}
              onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
            >
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          <div className="col-span-2">
            <label className="block text-sm text-gray-400 mb-1">Descrição</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-sm text-gray-400 mb-1">URL da Imagem</label>
            <input
              type="text"
              value={formData.image_url}
              onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
              placeholder="https://..."
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Ordem</label>
            <input
              type="number"
              value={formData.sort_order}
              onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="rounded"
              />
              Produto Ativo/Visível
            </label>
          </div>
        </div>

        <div className="mt-6 border-t border-gray-700 pt-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-white">Variações (tamanhos, sabores)</h4>
            <button onClick={addVariant} className="text-xs text-indigo-400 hover:text-indigo-300">+ Adicionar</button>
          </div>
          {variants.map((v, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <input
                type="text"
                value={v.name}
                onChange={(e) => updateVariant(i, 'name', e.target.value)}
                placeholder="Nome (ex: Grande)"
                className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-1 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
              <input
                type="number"
                step="0.01"
                value={v.price_diff}
                onChange={(e) => updateVariant(i, 'price_diff', e.target.value)}
                placeholder="Diferença R$"
                className="w-32 bg-gray-700 border border-gray-600 rounded px-3 py-1 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
              <button onClick={() => removeVariant(i)} className="text-red-400 hover:text-red-300 px-2">✕</button>
            </div>
          ))}
        </div>

        <div className="mt-4 border-t border-gray-700 pt-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-white">Adicionais (complementos)</h4>
            <button onClick={addAddon} className="text-xs text-indigo-400 hover:text-indigo-300">+ Adicionar</button>
          </div>
          {addons.map((a, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <input
                type="text"
                value={a.name}
                onChange={(e) => updateAddon(i, 'name', e.target.value)}
                placeholder="Nome (ex: Queijo extra)"
                className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-1 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
              <input
                type="number"
                step="0.01"
                value={a.price}
                onChange={(e) => updateAddon(i, 'price', e.target.value)}
                placeholder="Preço R$"
                className="w-32 bg-gray-700 border border-gray-600 rounded px-3 py-1 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
              <button onClick={() => removeAddon(i)} className="text-red-400 hover:text-red-300 px-2">✕</button>
            </div>
          ))}
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700">
            Cancelar
          </button>
          <button onClick={handleSubmit} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

function PrinterForm({ printer, onClose, onSave }: { printer: Printer | null; onClose: () => void; onSave: () => void }) {
  const [name, setName] = useState(printer?.name || '');
  const [ip_address, setIpAddress] = useState(printer?.ip_address || '');
  const [port, setPort] = useState(printer?.port || 9100);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    try {
      const payload = { name, ip_address, port: parseInt(String(port)) || 9100 };
      if (printer) {
        await api.put(`/printers/${printer.id}`, payload);
      } else {
        await api.post('/printers', payload);
      }
      onSave();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao salvar impressora.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-bold text-white mb-4">{printer ? 'Editar' : 'Nova'} Impressora</h3>
        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Nome da Impressora *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
              placeholder="Ex: Cozinha, Bar, Caixa"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Endereço IP (Rede) *</label>
            <input
              type="text"
              value={ip_address}
              onChange={(e) => setIpAddress(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
              placeholder="Ex: 192.168.1.200"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Porta TCP</label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(parseInt(e.target.value) || 9100)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700">
            Cancelar
          </button>
          <button onClick={handleSubmit} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
