FROM node:24-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY patches ./patches
# Com devDependencies: o postinstall roda o patch-package para aplicar a
# correcao do Baileys (Bad MAC) ainda no build da imagem.
RUN npm ci --include=dev

COPY --chown=node:node . .
COPY --chown=node:node --from=frontend-build /app/frontend/dist ./public

RUN npx prisma generate

RUN mkdir -p /app/public/uploads /app/auth_info_baileys \
    && chmod +x /app/scripts/docker-entrypoint.sh \
    && chown -R node:node /app

USER node

EXPOSE 3009

ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
