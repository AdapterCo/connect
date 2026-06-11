FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN npx prisma generate

RUN mkdir -p /app/public/uploads /app/auth_info_baileys

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
