const crypto = require('crypto');

function requestId(req, res, next) {
  const incoming = req.get('x-request-id');
  const id = incoming && /^[a-zA-Z0-9._:-]{8,128}$/.test(incoming)
    ? incoming
    : crypto.randomUUID();

  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
}

function noStoreApi(req, res, next) {
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
}

function requireJsonContentType(req, res, next) {
  const methodsWithBody = ['POST', 'PUT', 'PATCH'];
  if (
    req.path.startsWith('/api/')
    && methodsWithBody.includes(req.method)
    && !req.is('multipart/form-data')
    && !req.is('application/json')
    && Number(req.get('content-length') || 0) > 0
  ) {
    return res.status(415).json({ error: 'Content-Type deve ser application/json.' });
  }
  next();
}

module.exports = {
  requestId,
  noStoreApi,
  requireJsonContentType
};
