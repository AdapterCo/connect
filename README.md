# Adapter Connect

CRM WhatsApp multi-tenant com atendente virtual IA e integracao Mercado Pago.

## Stack

- Backend: Node.js + Express + Prisma + PostgreSQL
- Frontend: React + TypeScript + Vite + Tailwind CSS
- WhatsApp: Baileys
- IA: Google Gemini / OpenAI / xAI Grok
- Pagamentos: Mercado Pago
- Real-time: Socket.IO
- Deploy: Docker + Traefik

## Desenvolvimento

Backend:

```bash
npm install
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

O frontend roda em `http://localhost:5173` com proxy para o backend.

## Deploy Docker

```bash
cp .env.example .env
# Edite .env com credenciais reais
docker compose up -d --build
```

## Auditoria e Deploy Seguro

Valide antes de publicar:

```bash
npm run check:all-js
npm run security:smoke
npx prisma validate
npm run security:audit
```

Valide no Docker:

```bash
docker compose build --no-cache app
docker compose run --rm app npm run security:smoke
docker compose up -d app
docker compose ps
```

Healthcheck:

```bash
curl -fsS http://127.0.0.1:3009/health
```

Documentos de auditoria:

- `SECURITY_AUDIT_REPORT.md`
- `AUDIT_IMPLEMENTATION_LOG.md`

## Variaveis de Ambiente

| Variavel | Descricao |
| --- | --- |
| `PORT` | Porta do servidor |
| `NODE_ENV` | `development` ou `production` |
| `JWT_SECRET` | Segredo JWT com 32+ caracteres aleatorios |
| `DATABASE_URL` | URL do PostgreSQL |
| `ENCRYPTION_KEY` | Chave de criptografia com 32+ caracteres aleatorios |
| `DOMAIN` | Dominio publico de producao |
| `MP_WEBHOOK_SECRET` | Segredo HMAC para webhooks de pagamento |
| `RETENTION_ENABLED` | Ativa rotina de retencao LGPD/GDPR (`false` por padrao) |
| `AUDIT_LOG_RETENTION_DAYS` | Retencao de logs de auditoria |
| `SYSTEM_LOG_RETENTION_DAYS` | Retencao de logs operacionais |
| `MESSAGE_RETENTION_DAYS` | Retencao/anonimizacao de mensagens; `0` desativa |

## Funcionalidades

- Multi-tenant
- Conexao WhatsApp com multiplas instancias
- Atendente virtual com IA
- CRM com funil de vendas
- Pipeline Kanban
- Cobrancas Mercado Pago
- Agendamento de mensagens
- Gestao de equipe
- Relatorios e metricas
- Logs em tempo real
- Auditoria e endpoints LGPD/GDPR
