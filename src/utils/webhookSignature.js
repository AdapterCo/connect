const crypto = require('crypto');

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'hex');
  const right = Buffer.from(String(b || ''), 'hex');
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

function parseMercadoPagoSignature(signature) {
  return String(signature || '')
    .split(',')
    .map((part) => part.trim().split('='))
    .reduce((acc, [key, value]) => {
      if (key && value) acc[key] = value;
      return acc;
    }, {});
}

function verifyMercadoPagoSignature({ payload, requestId, signature, secret }) {
  const parsed = parseMercadoPagoSignature(signature);
  const paymentId = payload?.data?.id || payload?.id;

  if (!parsed.ts || !parsed.v1 || !requestId || !paymentId) {
    return false;
  }

  const manifest = `id:${paymentId};request-id:${requestId};ts:${parsed.ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  return safeEqual(expected, parsed.v1);
}

function verifyRawBodySignature({ rawBody, signature, secret }) {
  const normalizedSignature = String(signature || '').replace(/^sha256=/i, '').trim();
  if (!rawBody || !normalizedSignature || normalizedSignature.includes('=')) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  return safeEqual(expected, normalizedSignature);
}

function verifyHmacSignature({ rawBody, payload, requestId, signature, secret }) {
  if (!secret) return true;
  if (!rawBody || !signature) return false;

  return verifyMercadoPagoSignature({ payload, requestId, signature, secret })
    || verifyRawBodySignature({ rawBody, signature, secret });
}

module.exports = {
  verifyHmacSignature
};
