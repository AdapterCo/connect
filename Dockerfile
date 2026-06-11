FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN npx prisma generate

RUN mkdir -p /app/public/uploads /app/auth_info_baileys

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
