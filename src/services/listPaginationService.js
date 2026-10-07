function pagination(query = {}) {
  const page = Math.max(1, Math.min(100000, Number.parseInt(query.page, 10) || 1));
  const take = 25;
  const search = typeof query.search === 'string' ? query.search.trim().slice(0, 160) : '';
  return { page, take, skip: (page - 1) * take, search };
}
module.exports = { pagination };
