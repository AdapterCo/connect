const managers = user => ['admin', 'supervisor'].includes(user.role);
function scope(user) {
  if (!user.company_id || !user.id) throw new Error('Usuário sem empresa.');
  return { company_id: user.company_id, ...(!managers(user) ? { seller_id: user.id } : {}) };
}
function money(value, field) {
  const text = String(value ?? '');
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(text)) throw new Error(`${field}: informe um valor positivo com até duas casas decimais.`);
  return text;
}
function validate(body, user) {
  const data = {};
  for (const [key, max] of Object.entries({ name: 160, serial: 80, color: 60, memory: 60 })) {
    if (key === 'memory' && !body[key]) { data[key] = null; continue; }
    if (typeof body[key] !== 'string' || !body[key].trim() || body[key].trim().length > max) throw new Error(`Campo inválido: ${key}.`);
    data[key] = body[key].trim();
  }
  data.serial = data.serial.toUpperCase();
  data.price = money(body.price, 'Valor');
  data.down_payment = money(body.down_payment ?? 0, 'Entrada');
  if (Number(data.price) <= 0 || Number(data.down_payment) > Number(data.price)) throw new Error('Valor deve ser maior que zero e entrada não pode superar o valor.');
  if (!['cash', 'pix', 'card', 'boleto'].includes(body.payment_method)) throw new Error('Forma de pagamento inválida.');
  if (!['new', 'used', 'refurbished'].includes(body.condition)) throw new Error('Estado inválido.');
  if (typeof body.seller_id !== 'string' || !body.seller_id) throw new Error('Selecione um vendedor.');
  if (!managers(user) && body.seller_id !== user.id) throw new Error('Você só pode registrar seus próprios produtos.');
  return { ...data, seller_id: body.seller_id, payment_method: body.payment_method, condition: body.condition };
}
function period(query) {
  const range = {};
  for (const key of ['from', 'to']) {
    if (!query[key]) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(query[key])) throw new Error('Período inválido.');
    const date = new Date(`${query[key]}T00:00:00-03:00`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== query[key]) throw new Error('Data inválida.');
    if (key === 'to') date.setUTCDate(date.getUTCDate() + 1);
    range[key === 'from' ? 'gte' : 'lt'] = date;
  }
  if (range.gte && range.lt && range.gte >= range.lt) throw new Error('Período invertido.');
  return Object.keys(range).length ? { sold_at: range } : {};
}
module.exports = { managers, scope, validate, period };
