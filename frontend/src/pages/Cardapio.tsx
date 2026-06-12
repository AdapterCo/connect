import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

interface Variant {
  id: string;
  name: string;
  price_diff: number;
}

interface Addon {
  id: string;
  name: string;
  price: number;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  variants: Variant[];
  addons: Addon[];
}

interface Category {
  id: string;
  name: string;
  products: Product[];
}

interface Company {
  name: string;
  logo_url: string | null;
  primary_color: string | null;
  phone: string | null;
}

interface CartItem {
  product: Product;
  selectedVariant: Variant | null;
  selectedAddons: Addon[];
  quantity: number;
  notes: string;
  itemTotal: number;
}

export default function Cardapio() {
  const { slug } = useParams<{ slug: string }>();
  const [company, setCompany] = useState<Company | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  
  // Customization Modal
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [modalVariant, setModalVariant] = useState<Variant | null>(null);
  const [modalAddons, setModalAddons] = useState<Addon[]>([]);
  const [modalNotes, setModalNotes] = useState('');
  const [modalQty, setModalQty] = useState(1);

  // Cart & Checkout Screen
  const [showCheckout, setShowCheckout] = useState(false);
  const [showCart, setShowCart] = useState(false);
  
  // Checkout Form
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [deliveryType, setDeliveryType] = useState<'delivery' | 'pickup'>('delivery');
  const [address, setAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Pix');
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!slug) return;
    setIsLoading(true);
    axios.get(`/api/catalog/public/${slug}`)
      .then(res => {
        setCompany(res.data.company);
        setCategories(res.data.categories);
        setError('');
      })
      .catch(() => {
        setError('Cardápio não encontrado ou indisponível.');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [slug]);

  // Handle customizations
  const openCustomizer = (product: Product) => {
    setSelectedProduct(product);
    setModalVariant(product.variants.length > 0 ? product.variants[0] : null);
    setModalAddons([]);
    setModalNotes('');
    setModalQty(1);
  };

  const toggleAddonSelection = (addon: Addon) => {
    if (modalAddons.find(a => a.id === addon.id)) {
      setModalAddons(modalAddons.filter(a => a.id !== addon.id));
    } else {
      setModalAddons([...modalAddons, addon]);
    }
  };

  const calculateModalItemTotal = () => {
    if (!selectedProduct) return 0;
    let base = selectedProduct.price;
    if (modalVariant) base += modalVariant.price_diff;
    const addonsTotal = modalAddons.reduce((sum, a) => sum + a.price, 0);
    return (base + addonsTotal) * modalQty;
  };

  const addToCart = () => {
    if (!selectedProduct) return;
    const newItem: CartItem = {
      product: selectedProduct,
      selectedVariant: modalVariant,
      selectedAddons: [...modalAddons],
      quantity: modalQty,
      notes: modalNotes,
      itemTotal: calculateModalItemTotal()
    };
    setCart([...cart, newItem]);
    setSelectedProduct(null);
    setShowCart(true);
  };

  const removeFromCart = (index: number) => {
    setCart(cart.filter((_, idx) => idx !== index));
  };

  const getCartSubtotal = () => {
    return cart.reduce((sum, item) => sum + item.itemTotal, 0);
  };

  const handleFinishOrder = () => {
    if (!company || !company.phone) {
      alert('Esta empresa não tem telefone do WhatsApp configurado para receber pedidos.');
      return;
    }

    if (!name || !phone) {
      alert('Por favor, preencha seu nome e telefone.');
      return;
    }

    if (deliveryType === 'delivery' && !address) {
      alert('Por favor, preencha o endereço de entrega.');
      return;
    }

    // Format WhatsApp message
    let msg = `*🛍️ NOVO PEDIDO - CARDÁPIO DIGITAL*\n`;
    msg += `--------------------------------\n\n`;
    
    cart.forEach(item => {
      msg += `*${item.quantity}x ${item.product.name}*\n`;
      if (item.selectedVariant) {
        msg += `   _Opção: ${item.selectedVariant.name}_\n`;
      }
      item.selectedAddons.forEach(a => {
        msg += `   _+ Adicional: ${a.name} (+R$ ${a.price.toFixed(2)})_\n`;
      });
      if (item.notes) {
        msg += `   _Obs: ${item.notes}_\n`;
      }
      msg += `   *Subtotal: R$ ${item.itemTotal.toFixed(2)}*\n\n`;
    });

    msg += `--------------------------------\n`;
    msg += `*Total do Pedido: R$ ${getCartSubtotal().toFixed(2)}*\n\n`;
    
    msg += `*Dados do Cliente:*\n`;
    msg += `👤 Nome: ${name}\n`;
    msg += `📱 Telefone: ${phone}\n`;
    msg += `🛵 Tipo: ${deliveryType === 'delivery' ? 'Entrega em Domicílio' : 'Retirada no Balcão'}\n`;
    if (deliveryType === 'delivery') {
      msg += `📍 Endereço: ${address}\n`;
    }
    msg += `💳 Pagamento: ${paymentMethod}\n`;

    const cleanPhone = company.phone.replace(/\D/g, '');
    const encodedText = encodeURIComponent(msg);
    const waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;

    // Open WhatsApp
    window.open(waUrl, '_blank');
  };

  const primaryHex = company?.primary_color || '#4f46e5';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white px-4">
        <div className="text-5xl mb-4">⚠️</div>
        <p className="text-lg text-gray-300 text-center">{error || 'Cardápio não encontrado.'}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex justify-center pb-24">
      {/* Mobile Frame Container */}
      <div className="w-full max-w-lg bg-gray-900 min-h-screen relative shadow-2xl flex flex-col">
        
        {/* Header Cover */}
        <div className="h-36 relative overflow-hidden" style={{ backgroundColor: primaryHex + '22' }}>
          <div className="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent"></div>
          {/* Logo / Company Info */}
          <div className="absolute bottom-4 left-4 right-4 flex items-center gap-3">
            {company.logo_url ? (
              <img src={company.logo_url} alt={company.name} className="w-14 h-14 rounded-full border-2 border-gray-800 bg-gray-950 object-cover" />
            ) : (
              <div className="w-14 h-14 rounded-full border-2 border-gray-800 bg-indigo-600 flex items-center justify-center font-bold text-xl text-white">
                {company.name.charAt(0)}
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold text-white leading-tight">{company.name}</h1>
              <p className="text-xs text-green-400 font-semibold flex items-center gap-1">🟢 Aberto para Pedidos</p>
            </div>
          </div>
        </div>

        {/* Menu Listings */}
        <div className="flex-1 p-4 space-y-8 overflow-y-auto">
          {categories.map(cat => (
            <div key={cat.id}>
              <h2 className="text-lg font-bold text-gray-100 border-b border-gray-800 pb-2 mb-4">
                {cat.name}
              </h2>
              <div className="space-y-4">
                {cat.products.map(prod => (
                  <div 
                    key={prod.id} 
                    onClick={() => openCustomizer(prod)}
                    className="flex gap-3 bg-gray-800/40 hover:bg-gray-800/80 border border-gray-800 p-3 rounded-xl cursor-pointer transition"
                  >
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-100 text-sm md:text-base">{prod.name}</h3>
                      {prod.description && (
                        <p className="text-xs text-gray-400 mt-1 line-clamp-2">{prod.description}</p>
                      )}
                      <p className="text-sm font-bold mt-2" style={{ color: primaryHex }}>
                        R$ {prod.price.toFixed(2)}
                      </p>
                    </div>
                    {prod.image_url && (
                      <img src={prod.image_url} alt={prod.name} className="w-20 h-20 rounded-lg object-cover bg-gray-950 border border-gray-700" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Floating Cart Button */}
        {cart.length > 0 && !showCart && !showCheckout && (
          <div className="fixed bottom-4 left-4 right-4 max-w-lg mx-auto z-40">
            <button 
              onClick={() => setShowCart(true)}
              className="w-full text-white font-bold py-3 px-6 rounded-xl shadow-lg flex items-center justify-between transition transform hover:scale-[1.02]"
              style={{ backgroundColor: primaryHex }}
            >
              <span>🛒 Ver Carrinho ({cart.length})</span>
              <span>R$ {getCartSubtotal().toFixed(2)}</span>
            </button>
          </div>
        )}

        {/* Product customization modal */}
        {selectedProduct && (
          <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
            <div className="bg-gray-900 w-full max-w-lg rounded-t-2xl md:rounded-2xl max-h-[85vh] flex flex-col border border-gray-800">
              <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900 rounded-t-2xl">
                <h3 className="font-bold text-white text-base md:text-lg">{selectedProduct.name}</h3>
                <button onClick={() => setSelectedProduct(null)} className="text-gray-400 hover:text-white text-lg">✕</button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {selectedProduct.image_url && (
                  <img src={selectedProduct.image_url} alt={selectedProduct.name} className="w-full h-48 rounded-xl object-cover bg-gray-950" />
                )}
                {selectedProduct.description && (
                  <p className="text-sm text-gray-400 bg-gray-800/30 p-3 rounded-xl border border-gray-800">{selectedProduct.description}</p>
                )}

                {/* Variants */}
                {selectedProduct.variants.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Selecione o tamanho / opção</h4>
                    <div className="space-y-2">
                      {selectedProduct.variants.map(v => (
                        <label key={v.id} className="flex items-center justify-between p-3 bg-gray-800 border border-gray-700 rounded-xl cursor-pointer">
                          <div className="flex items-center gap-2">
                            <input 
                              type="radio" 
                              name="variant" 
                              checked={modalVariant?.id === v.id}
                              onChange={() => setModalVariant(v)}
                              className="text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm text-white font-medium">{v.name}</span>
                          </div>
                          <span className="text-xs font-semibold text-gray-400">
                            {v.price_diff !== 0 ? `(${v.price_diff >= 0 ? '+' : ''}R$ ${v.price_diff.toFixed(2)})` : 'Padrão'}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Addons */}
                {selectedProduct.addons.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Deseja adicionar complementos?</h4>
                    <div className="space-y-2">
                      {selectedProduct.addons.map(a => {
                        const isSelected = !!modalAddons.find(ma => ma.id === a.id);
                        return (
                          <label key={a.id} className="flex items-center justify-between p-3 bg-gray-800 border border-gray-700 rounded-xl cursor-pointer">
                            <div className="flex items-center gap-2">
                              <input 
                                type="checkbox" 
                                checked={isSelected}
                                onChange={() => toggleAddonSelection(a)}
                                className="rounded text-indigo-600 focus:ring-indigo-500"
                              />
                              <span className="text-sm text-white font-medium">{a.name}</span>
                            </div>
                            <span className="text-xs font-bold text-indigo-400">+ R$ {a.price.toFixed(2)}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Notes */}
                <div>
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Alguma observação?</h4>
                  <textarea 
                    value={modalNotes}
                    onChange={(e) => setModalNotes(e.target.value)}
                    placeholder="Ex: sem cebola, ponto da carne, etc."
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                    rows={2}
                  />
                </div>
              </div>

              {/* Add to Cart Actions */}
              <div className="p-4 border-t border-gray-800 flex gap-3 items-center bg-gray-900 rounded-b-2xl">
                <div className="flex items-center border border-gray-700 rounded-lg">
                  <button 
                    onClick={() => setModalQty(Math.max(1, modalQty - 1))}
                    className="px-3 py-1 text-gray-400 hover:text-white font-bold text-lg"
                  >
                    -
                  </button>
                  <span className="px-3 py-1 font-bold text-sm text-white">{modalQty}</span>
                  <button 
                    onClick={() => setModalQty(modalQty + 1)}
                    className="px-3 py-1 text-gray-400 hover:text-white font-bold text-lg"
                  >
                    +
                  </button>
                </div>

                <button 
                  onClick={addToCart}
                  className="flex-1 text-white font-bold py-2.5 px-4 rounded-xl shadow flex justify-between items-center"
                  style={{ backgroundColor: primaryHex }}
                >
                  <span>Adicionar</span>
                  <span>R$ {calculateModalItemTotal().toFixed(2)}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Cart Panel overlay */}
        {showCart && (
          <div className="fixed inset-0 bg-black/75 z-50 flex justify-end">
            <div className="w-full max-w-lg bg-gray-900 h-full flex flex-col border-l border-gray-800">
              <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-950">
                <h3 className="font-bold text-white flex items-center gap-2">🛒 Seu Carrinho</h3>
                <button onClick={() => setShowCart(false)} className="text-gray-400 hover:text-white">Voltar</button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {cart.map((item, idx) => (
                  <div key={idx} className="p-3 bg-gray-800 border border-gray-700 rounded-xl">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-sm text-white">{item.quantity}x {item.product.name}</h4>
                        {item.selectedVariant && (
                          <p className="text-xs text-gray-400 mt-0.5">Opção: {item.selectedVariant.name}</p>
                        )}
                        {item.selectedAddons.length > 0 && (
                          <p className="text-xs text-gray-400">Adicionais: {item.selectedAddons.map(a => a.name).join(', ')}</p>
                        )}
                        {item.notes && <p className="text-[10px] text-amber-300 italic mt-1 bg-gray-900/40 p-1.5 rounded">Obs: {item.notes}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold" style={{ color: primaryHex }}>R$ {item.itemTotal.toFixed(2)}</p>
                        <button 
                          onClick={() => removeFromCart(idx)}
                          className="text-xs text-red-400 hover:text-red-300 mt-2 font-medium"
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {cart.length === 0 && (
                  <div className="text-center py-16 text-gray-500">
                    <p className="text-5xl mb-3">🛒</p>
                    <p className="text-sm">Seu carrinho está vazio.</p>
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-gray-800 bg-gray-950">
                <div className="flex justify-between text-base font-bold text-white mb-4">
                  <span>Subtotal:</span>
                  <span>R$ {getCartSubtotal().toFixed(2)}</span>
                </div>
                <button 
                  disabled={cart.length === 0}
                  onClick={() => { setShowCart(false); setShowCheckout(true); }}
                  className="w-full text-white font-bold py-3 rounded-xl disabled:opacity-50 transition"
                  style={{ backgroundColor: primaryHex }}
                >
                  Continuar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Checkout overlay */}
        {showCheckout && (
          <div className="fixed inset-0 bg-black/75 z-50 flex justify-end">
            <div className="w-full max-w-lg bg-gray-900 h-full flex flex-col border-l border-gray-800">
              <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-950">
                <h3 className="font-bold text-white">📝 Finalizar Pedido</h3>
                <button onClick={() => { setShowCheckout(false); setShowCart(true); }} className="text-gray-400 hover:text-white">Voltar</button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-5">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Seu Nome *</label>
                  <input 
                    type="text" 
                    value={name} 
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Digite seu nome completo"
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Telefone / WhatsApp *</label>
                  <input 
                    type="text" 
                    value={phone} 
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Ex: (11) 99999-9999"
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Como deseja receber seu pedido?</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => setDeliveryType('delivery')}
                      className={`py-2 px-4 rounded-xl border text-sm font-semibold transition ${deliveryType === 'delivery' ? 'text-white border-indigo-500 bg-indigo-600/10' : 'text-gray-400 border-gray-700 bg-gray-800/50'}`}
                    >
                      🛵 Entrega
                    </button>
                    <button 
                      onClick={() => setDeliveryType('pickup')}
                      className={`py-2 px-4 rounded-xl border text-sm font-semibold transition ${deliveryType === 'pickup' ? 'text-white border-indigo-500 bg-indigo-600/10' : 'text-gray-400 border-gray-700 bg-gray-800/50'}`}
                    >
                      🛍️ Retirada
                    </button>
                  </div>
                </div>

                {deliveryType === 'delivery' && (
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Endereço de Entrega *</label>
                    <textarea 
                      value={address} 
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Rua, número, complemento e bairro"
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                      rows={3}
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Forma de Pagamento</label>
                  <select 
                    value={paymentMethod} 
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Pix">Pix (Recomendado)</option>
                    <option value="Cartao de Credito">Cartão de Crédito (na Entrega)</option>
                    <option value="Dinheiro">Dinheiro</option>
                  </select>
                </div>
              </div>

              <div className="p-4 border-t border-gray-800 bg-gray-950">
                <div className="flex justify-between text-base font-bold text-white mb-4">
                  <span>Total do Pedido:</span>
                  <span>R$ {getCartSubtotal().toFixed(2)}</span>
                </div>
                <button 
                  onClick={handleFinishOrder}
                  className="w-full text-white font-bold py-3.5 rounded-xl shadow-lg flex items-center justify-center gap-2 transition transform hover:scale-[1.01]"
                  style={{ backgroundColor: '#25D366' }} // WhatsApp Green
                >
                  🟢 Enviar Pedido via WhatsApp
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
