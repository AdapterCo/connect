# Adapter Connect

CRM WhatsApp multi-tenant com atendente virtual IA e integração Mercado Pago.

## Stack

- **Backend**: Node.js + Express + Prisma + PostgreSQL
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **WhatsApp**: Baileys
- **IA**: Google Gemini / OpenAI / xAI Grok
- **Pagamentos**: Mercado Pago
- **Real-time**: Socket.IO
- **Deploy**: Docker + Traefik

## Desenvolvimento

### Backend
```bash
npm install
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

O frontend vai rodar em `http://localhost:5173` com proxy para o backend.

## Deploy (Docker)

```bash
cp .env.example .env
# Editar .env com suas credenciais
docker compose up -d --build
```

## Credenciais padrão

- **Usuário**: admin
- **Senha**: admin123

> ⚠️ **IMPORTANTE**: Altere a senha do usuário admin imediatamente após o primeiro login. Para definir uma senha personalizada no primeiro acesso, adicione a variável `DEFAULT_ADMIN_PASSWORD` no arquivo `.env`.

## Variáveis de ambiente

| Variável | Descrição |
|----------|-----------|
| `PORT` | Porta do servidor (padrão: 3000) |
| `NODE_ENV` | Ambiente (development/production) |
| `JWT_SECRET` | Secret para JWT |
| `DATABASE_URL` | URL do PostgreSQL |
| `ENCRYPTION_KEY` | Chave de 32 chars para criptografia |
| `DOMAIN` | Domínio de produção |

## Funcionalidades

- ✅ Multi-tenant (multi-empresa)
- ✅ Conexão WhatsApp (múltiplas instâncias)
- ✅ Atendente virtual com IA (Gemini/OpenAI/Grok)
- ✅ CRM com funil de vendas
- ✅ Pipeline Kanban
- ✅ Cobranças Mercado Pago
- ✅ Agendamento de mensagens
- ✅ Gestão de equipe
- ✅ Relatórios e métricas
- ✅ Logs em tempo real

## Próximos passos

- [ ] Painel Super Admin
- [ ] Sistema de planos com limites
- [ ] Cobrança recorrente
- [ ] Recuperação de senha
- [ ] Rate limiting
- [ ] Validação de input
