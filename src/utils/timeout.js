function withTimeout(promise, ms) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Tempo limite excedido.')), ms); })]).finally(() => clearTimeout(timer));
}
module.exports = { withTimeout };
