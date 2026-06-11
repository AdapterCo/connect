function info(message, prefix = 'LOG') {
  console.log(`[${prefix}] ${message}`);
}

function error(message, err) {
  console.error(`[ERROR] ${message}`, err || '');
}

module.exports = {
  info,
  error
};
