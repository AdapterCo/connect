FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:20-bookworm-slim
WORKDIR /app

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY --chown=node:node . .
COPY --chown=node:node --from=frontend-build /app/frontend/dist ./public

RUN npx prisma generate

RUN mkdir -p /app/public/uploads /app/auth_info_baileys && chown -R node:node /app

USER node

EXPOSE 3009

CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
