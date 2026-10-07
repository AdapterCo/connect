// Serialize lifecycle operations per line, while other lines remain independent.
function createLifecycle() {
  const queues = new Map(), tokens = new Map();
  return {
    renew(id) { const token = {}; tokens.set(id, token); return token; },
    current(id, token) { return tokens.get(id) === token; },
    run(id, work) {
      const task = (queues.get(id) || Promise.resolve()).catch(() => {}).then(work);
      queues.set(id, task);
      task.finally(() => { if (queues.get(id) === task) queues.delete(id); }).catch(() => {});
      return task;
    }
  };
}

function writeFence(isCurrent) {
  const pending = new Set();
  let closed = false;
  return {
    write(work) {
      if (closed || !isCurrent()) return Promise.resolve();
      const task = Promise.resolve().then(() => { if (!closed && isCurrent()) return work(); });
      pending.add(task);
      task.finally(() => pending.delete(task)).catch(() => {});
      return task;
    },
    async close() { closed = true; await Promise.allSettled([...pending]); }
  };
}

function disconnectPolicy(code, reasons) {
  if (code === reasons.loggedOut) return 'reset';
  if ([reasons.connectionReplaced, reasons.forbidden, reasons.multideviceMismatch].filter(value => value !== undefined).includes(code)) return 'stop';
  return 'retry';
}

module.exports = { createLifecycle, writeFence, disconnectPolicy };
