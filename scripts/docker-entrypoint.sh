#!/bin/sh
set -eu

mkdir -p /app/auth_info_baileys /app/public/uploads

if [ "$(id -u)" = "0" ]; then
  chown -R node:node /app/auth_info_baileys /app/public/uploads
  chmod -R u+rwX,g+rwX /app/auth_info_baileys /app/public/uploads
  exec su node -s /bin/sh -c 'exec "$@"' -- "$@"
fi

exec "$@"
