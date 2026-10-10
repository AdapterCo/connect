# Adapter Connect

CRM WhatsApp multi-tenant para lojas, com atendente virtual IA, rodizio de vendedores e registro de vendas. A assinatura da plataforma e cobrada via Mercado Pago.

## Stack

- Backend: Node.js 24 + Express + Prisma + PostgreSQL
- Frontend: React + TypeScript + Vite + Tailwind CSS
- WhatsApp: Baileys
- IA: Google Gemini / OpenAI / Groq
- Assinaturas da plataforma: Mercado Pago (confirmacao por consulta a API, sem webhook)
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

O frontend roda em `http://localhost:5173` com proxy para o backend em `http://localhost:3000` (use `BACKEND_URL` para outra porta).

Na primeira inicializacao, defina `SUPERADMIN_PASSWORD` para criar o superadmin (opcional: sem ela, nenhuma conta e criada). Nenhuma conta com senha padrao e criada. Os planos nascem inativos com preco 0; ative-os de duas formas: definindo `PLAN_*_PRICE` no `.env` (o plano nasce ativo e vendavel no primeiro boot, sem nenhum login) ou pelo painel do superadmin.

## Testes e validacao

```bash
npm test
npm run check:all-js
npm run security:smoke
npm run secret:scan
npx prisma validate
npm run security:audit
cd frontend && npm run lint && npm run build
```

Os testes HTTP usam um banco em memoria (`tests/helpers/memory-prisma.js`); migracoes e transacoes precisam ser validadas tambem com PostgreSQL.

## Deploy Docker

```bash
cp .env.example .env
# Edite .env com credenciais reais (DB_PASSWORD, JWT_SECRET, ENCRYPTION_KEY, SUPERADMIN_PASSWORD...)
docker compose up -d --build
```

Valide no Docker:

```bash
docker compose build --no-cache app
docker compose run --rm app npm run security:smoke
docker compose up -d app
docker compose ps
```

Healthcheck (inclui o banco):

```bash
curl -fsS http://127.0.0.1:3009/health
```

Operacao:

- Rode **uma unica replica** do app: rodizio de vendedores, agendamentos, cobrancas, presenca e sockets do WhatsApp ficam em memoria no processo.
- Faca backup do Postgres e dos volumes `auth_data` (sessoes do WhatsApp) e `uploads_data` (midias).
- A sessao do painel usa o cookie HttpOnly `crm_session`; o token nao fica acessivel ao JavaScript.

Documentos historicos de auditoria: `SECURITY_AUDIT_REPORT.md`, `AUDIT_IMPLEMENTATION_LOG.md`, `auditoria.md` e `REVISAO-CRM.md`. Trechos sobre webhook de pagamento estao superados: o webhook foi removido.

## Variaveis de Ambiente

| Variavel | Descricao |
| --- | --- |
| `PORT` | Porta do servidor |
| `NODE_ENV` | `development` ou `production` |
| `JWT_SECRET` | Segredo JWT com 32+ caracteres aleatorios |
| `DATABASE_URL` | URL do PostgreSQL |
| `DB_PASSWORD` | Senha do Postgres no Docker (obrigatoria; em volume existente, a senha original) |
| `ENCRYPTION_KEY` | Chave de criptografia com 32+ caracteres aleatorios |
| `SUPERADMIN_USERNAME` | Usuario do superadmin criado na inicializacao (padrao `superadmin`) |
| `SUPERADMIN_PASSWORD` | Senha (8+ caracteres) do superadmin; necessaria so para cria-lo |
| `PLAN_ESSENCIAL_PRICE`, `PLAN_PROFISSIONAL_PRICE`, `PLAN_EMPRESARIAL_PRICE` | Preco mensal de cada plano; definido, o plano nasce ativo no primeiro boot (self-service sem superadmin) |
| `PLATFORM_MP_ACCESS_TOKEN` | Access token do Mercado Pago da plataforma (cobranca e confirmacao das assinaturas) |
| `PLATFORM_MP_PUBLIC_KEY` | Public key do Mercado Pago da plataforma (checkout de cartao) |
| `DOMAIN` | Dominio publico de producao |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Servidor de e-mail para o link de recuperacao de senha (sem `SMTP_HOST` o e-mail nao e enviado) |
| `APP_URL` | URL publica do painel usada nos links de e-mail (padrao `https://DOMAIN`) |
| `MEDIA_QUOTA_MB` | Limite de midia por empresa em MB (padrao 1024) |
| `VISION_ENABLED` | Analise de imagens recebidas com a chave Gemini da empresa (`false` por padrao) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Chaves das notificacoes push; sem elas um par e gerado e salvo no banco |
| `UPLOAD_DIR` | Pasta das midias (padrao `public/uploads`) |
| `WHATSAPP_LOG_LEVEL` | Nivel de log da conexao WhatsApp (padrao `silent`) |
| `RETENTION_ENABLED` | Ativa rotina de retencao LGPD/GDPR (`false` por padrao) |
| `AUDIT_LOG_RETENTION_DAYS` | Retencao de logs de auditoria |
| `SYSTEM_LOG_RETENTION_DAYS` | Retencao de logs operacionais |
| `MESSAGE_RETENTION_DAYS` | Retencao/anonimizacao de mensagens; `0` desativa |

## Funcionalidades

- Multi-tenant com perfis admin, supervisor e vendedor
- Conexao WhatsApp com multiplas instancias
- Atendente virtual com IA (limite de respostas por conversa e transferencia para humano)
- Funil de vendas com Kanban pessoal e rodizio automatico entre vendedores online
- Produtos e registro de vendas por vendedor, com metricas
- Agendamento de mensagens (API)
- Gestao de equipe e revogacao de sessoes
- Relatorios e metricas
- Logs e auditoria
- Endpoints LGPD/GDPR (exportar, anonimizar e excluir dados do cliente, incluindo midias)
- Assinatura da plataforma via Mercado Pago (Pix e cartao)
