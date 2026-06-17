const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./index');

const JWT_OPTIONS = {
  algorithm: 'HS256',
  issuer: 'adapter-connect',
  audience: 'adapter-connect-api'
};

function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { ...JWT_OPTIONS, expiresIn: '24h' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET, JWT_OPTIONS);
  } catch (error) {
    return null;
  }
}

module.exports = {
  generateToken,
  verifyToken
};
