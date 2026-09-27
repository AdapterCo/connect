(() => {
  const form = document.getElementById('product-form');
  const feedback = document.getElementById('product-feedback');
  const money = value => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const methods = { cash: 'Dinheiro', pix: 'Pix', card: 'Cartão', boleto: 'Boleto' };
  const conditions = { new: 'Novo', used: 'Usado', refurbished: 'Recondicionado' };
  let products = [];
  async function request(url, options = {}) {
    const res = await fetch('/api/products' + url, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('crm_token')}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao carregar dados.');
    return data;
  }
  function row(values) {
    const tr = document.createElement('tr');
    values.forEach(value => { const td = document.createElement('td'); td.textContent = value; tr.append(td); });
    return tr;
  }
  async function metrics() {
    const params = new URLSearchParams();
    if (document.getElementById('sales-from').value) params.set('from', document.getElementById('sales-from').value);
    if (document.getElementById('sales-to').value) params.set('to', document.getElementById('sales-to').value);
    const rows = await request('/metrics?' + params);
    const target = document.getElementById('sales-rows'); target.replaceChildren();
    rows.forEach(s => target.append(row([s.name, s.count, money(s.total), money(s.average), money(s.down_payment)])));
    document.getElementById('sales-summary').textContent = `${rows.reduce((n, s) => n + s.count, 0)} vendas • ${money(rows.reduce((n, s) => n + s.total, 0))} • Somente vendas concluídas. Datas no horário de Brasília.`;
  }
  function reset() { form.reset(); form.elements.id.value = ''; if (currentUser.role === 'seller') form.elements.seller_id.value = currentUser.id; }
  window.loadStore = async () => {
    try {
      const [items, sellers] = await Promise.all([request('/'), request('/sellers')]); products = items;
      const select = form.elements.seller_id;
      const previous = select.value; select.replaceChildren();
      sellers.forEach(s => select.add(new Option(s.name, s.id)));
      if (currentUser.role === 'seller') { select.value = currentUser.id; select.disabled = true; }
      else if (sellers.some(s => s.id === previous)) select.value = previous;
      const target = document.getElementById('product-rows'); target.replaceChildren();
      products.forEach(p => {
        const tr = row([p.name, p.serial, [p.color, p.memory, conditions[p.condition]].filter(Boolean).join(' / '), p.seller.name, money(p.price), `${methods[p.payment_method]} / ${money(p.down_payment)}`, p.status === 'sold' ? `Vendido em ${new Date(p.sold_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : 'Em estoque']);
        const actions = document.createElement('td');
        if (p.status === 'stock') {
          const edit = document.createElement('button'); edit.className = 'btn-secondary'; edit.textContent = 'Editar';
          edit.onclick = () => { for (const key of ['id', 'name', 'seller_id', 'price', 'down_payment', 'payment_method', 'serial', 'color', 'memory', 'condition']) form.elements[key].value = p[key] ?? ''; form.scrollIntoView({ behavior: 'smooth' }); };
          const sell = document.createElement('button'); sell.className = 'save-btn'; sell.textContent = 'Registrar venda';
          sell.onclick = async () => {
            if (!confirm(`Registrar venda de ${p.name} por ${money(p.price)} para ${p.seller.name}?`)) return;
            sell.disabled = true;
            try { await request(`/${encodeURIComponent(p.id)}/sell`, { method: 'POST' }); feedback.textContent = 'Venda registrada.'; await window.loadStore(); }
            catch (err) { feedback.textContent = err.message; sell.disabled = false; }
          };
          actions.append(edit, sell);
        }
        tr.append(actions); target.append(tr);
      });
      if (!products.length) target.append(row(['Nenhum produto cadastrado.']));
      await metrics();
    } catch (err) { feedback.textContent = err.message; }
  };
  form.onsubmit = async event => {
    event.preventDefault(); const button = form.querySelector('[type="submit"]'); button.disabled = true;
    const data = Object.fromEntries(new FormData(form)); data.seller_id = form.elements.seller_id.value;
    try { await request(data.id ? '/' + encodeURIComponent(data.id) : '/', { method: data.id ? 'PUT' : 'POST', body: JSON.stringify(data) }); reset(); feedback.textContent = 'Produto salvo.'; await window.loadStore(); }
    catch (err) { feedback.textContent = err.message; } finally { button.disabled = false; }
  };
  document.getElementById('product-reset').onclick = reset;
  document.getElementById('sales-refresh').onclick = () => metrics().catch(err => { feedback.textContent = err.message; });
})();
