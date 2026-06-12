# Análise Completa do Projeto Adapter Connect

## Visão Geral

O **Adapter Connect** é um **CRM multi-tenant para WhatsApp** com atendente virtual por IA e integração com Mercado Pago para cobranças. Trata-se de uma aplicação fullstack com arquitetura cliente-servidor, projetada para operar como SaaS (Software as a Service).

---

## Stack Tecnológica

| Camada | Tecnologias |
|--------|-------------|
| **Backend** | Node.js + Express.js |
| **Banco de Dados** | PostgreSQL + Prisma ORM |
| **Frontend** | React 19 + TypeScript + Vite 8 + Tailwind CSS 4 |
| **WhatsApp** | Baileys (@whiskeysockets/baileys) |
| **IA** | Google Gemini, OpenAI, xAI Grok (mock incluído) |
| **Pagamentos** | Mercado Pago SDK |
| **Real-time** | Socket.IO |
| **Estado (Frontend)** | Zustand |
| **Gráficos** | Recharts |
| **DnD (Kanban)** | @hello-pangea/dnd |
| **Deploy** | Docker + Docker Compose + Traefik (reverse proxy com HTTPS) |

---

## Arquitetura do Projeto

```
AdapterConnect1/
├── backend (Node.js/Express)
│   ├── src/
│   │   ├── config/        → Configurações (DB, Auth JWT, Socket, variáveis)
│   │   ├── controllers/   → 15 controllers (lógica de negócio)
│   │   ├── middleware/     → 7 middlewares (auth, rate-limit, validação, etc.)
│   │   ├── models/        → 7 models (Chat, Company, Instance, Log, Metrics, etc.)
│   │   ├── routes/        → 14 arquivos de rotas
│   │   ├── services/      → 7 services (WhatsApp, IA, Billing, Mercado Pago, etc.)
│   │   └── utils/         → Utilitários (crypto, logger, cleanJson, helpers)
│   ├── prisma/
│   │   └── schema.prisma  → Schema do banco (10.9KB, extenso)
│   └── public/uploads/    → Diretório de uploads
├── frontend/              → App React separada
│   ├── src/
│   │   ├── components/    → Layout, Sidebar
│   │   ├── hooks/         → useSocket
│   │   ├── pages/         → 15 páginas
│   │   ├── services/      → api.ts (axios)
│   │   ├── stores/        → authStore, appStore (Zustand)
│   │   ├── types/         → TypeScript types
│   │   └── utils/
│   └── dist/              → Build de produção
├── docker-compose.yml     → Serviços: app + PostgreSQL + Traefik
├── Dockerfile             → Multi-stage build (frontend + backend)
├── app.js                 → Express app (rotas, middleware, upload)
└── server.js              → Entry point (HTTP server, Socket.IO, WhatsApp init)
```

---

## Modelagem de Banco de Dados (Prisma Schema)

O schema define **~20+ tabelas** (truncado na leitura mas com 10.9KB de conteúdo). Os modelos principais são:

| Modelo | Descrição |
|--------|-----------|
| **Plan** | Planos de assinatura (Free, Pro, Enterprise) com limites |
| **Company** | Empresas (multi-tenant) — slug único, plano, configurações Mercado Pago |
| **User** | Usuários vinculados a empresas, com roles (superadmin/admin/supervisor/seller/support) |
| **Instance** | Instâncias WhatsApp por empresa |
| **Chat** | Conversas com clientes — status, tags, setor, atribuição, flags IA |
| **Message** | Mensagens dos chats — sender, texto, media, pagamentos agendados |
| **Settings** | Configurações por empresa (IA provider, keys criptografadas, prompt) |
| **Metrics** | Métricas de atendimento |
| **Log** | Logs de sistema |
| **ScheduledMessage** | Mensagens agendadas |
| **Subscription** | Assinaturas de empresas a planos |
| **Product/Catalog** | Catálogo de produtos |
| **Order** | Pedidos |

---

## Funcionalidades Principais

### 1. Autenticação & Autorização
- **JWT-based auth** com tokens Bearer
- **Roles hierárquicas**: `superadmin` → `admin` → `supervisor` → `seller` → `support` → `other`
- Middleware de autenticação (`authMiddleware.js`), superadmin (`superadminMiddleware.js`), e company active check (`companyMiddleware.js` + `planMiddleware.js`)
- Recuperação de senha com控制（ForgotPassword / ResetPassword）

### 2. Multi-Tenant
- Cada empresa tem seu próprio `company_id` isolando dados
- Planos com limites (instâncias, usuários, preços)
- Middleware verifica se empresa está ativa e se assinatura não expirou
- Controle de limite de usuários e instâncias por plano

### 3. WhatsApp (Baileys)
- Múltiplas instâncias por empresa
- Conexão via QR Code (scan pelo WhatsApp)
- Gerenciamento de conexão: auto-reconexão, desconexão, status
- Envio e recebimento de mensagens em tempo real via Socket.IO
- Download de mídia (imagens, áudios, documentos)
- Histórico de mensagens persistido

### 4. Atendente Virtual IA
- Suporte a **3 providers**: Google Gemini, OpenAI, xAI Grok (+ mock para testes)
- Prompt de sistema configurável por empresa (SettingsAI)
- Inclusão automática do catálogo de produtos no contexto da IA
- Histórico de conversa enviado para contexto
- Resposta estruturada em JSON com: `message`, `status`, `trigger_billing`, `billing_item`, `billing_value`
- Modo mock para desenvolvimento/testes

### 5. CRM & Pipeline
- **Funil de vendas** com status: `iniciada` → `interesse em compra` → `finalizada`
- **Pipeline Kanban** com drag-and-drop (@hello-pangea/dnd)
- Tags, favoritos, arquivamento, bloqueio de conversas
- Atribuição de atendentes a conversas
- Setores: `sales`, `support`, `finance`

### 6. Catálogo de Produtos
- CRUD completo de categorias e produtos
- Produtos com nome, descrição, preço, imagem, status ativo/inativo
- API dedicada para o catálogo
- Catálogo integrado ao prompt da IA

### 7. Cobranças & Mercado Pago
- Integração com Mercado Pago para pagamentos
- Criação de preferências de pagamento
- Webhook de confirmação de pagamento
- Verificação periódica de pagamentos pendentes (a cada 30s via `mercadoPagoService`)
- Possibilidade de cobrança automática acionada pela IA
- Página de Billing no frontend

### 8. Agendamento de Mensagens
- Agendamento de envio futuro de mensagens
- Verificação periódica a cada 10 segundos via `schedulerService`
- UI dedicada para gerenciamento

### 9. Super Admin
- Painel administrativo global para gerenciar todas as empresas
- Gerenciamento de planos, empresas e configurações de sistema
- Rota dedicada com middleware `requireSuperAdmin`

### 10. Relatórios & Métricas
- Dashboard com métricas de atendimento
- Página de Reports com gráficos (Recharts)
- Logs de sistema com paginação

### 11. Configurações
- **SettingsAI**: Configuração de provider IA, chaves de API (criptografadas), prompt de sistema
- **SettingsMP**: Configuração de Mercado Pago (tokens, webhooks)
- **Team**: Gerenciamento de equipe/usuários

---

## Middlewares

| Middleware | Função |
|-----------|--------|
| `authMiddleware.js` | Verifica JWT Bearer token |
| `superadminMiddleware.js` | Exige role `superadmin` |
| `planMiddleware.js` | Verifica empresa ativa, assinatura válida, limites de usuários/instâncias |
| `companyMiddleware.js` | Verifica company_id do usuário |
| `auditMiddleware.js` | Registra ações para auditoria |
| `rateLimitMiddleware.js` | Rate limiting (general, auth, api, upload) |
| `validationMiddleware.js` | Sanitização de body (express-mongo-sanitize) |

---

## Frontend (React + TypeScript)

### Rotas

| Rota | Página | Descrição |
|------|--------|-----------|
| `/login` | Login | Autenticação |
| `/forgot-password` | ForgotPassword | Solicitação de redefinição |
| `/reset-password` | ResetPassword | Redefinição de senha |
| `/` | Dashboard | Painel principal com métricas |
| `/chats` | Chats | Lista de conversas WhatsApp |
| `/kanban` | Kanban | Pipeline de vendas |
| `/whatsapp` | WhatsApp | Gerenciamento de instâncias |
| `/settings-ai` | SettingsAI | Configurações de IA |
| `/settings-mp` | SettingsMP | Configurações Mercado Pago |
| `/team` | Team | Gerenciamento de equipe |
| `/reports` | Reports | Relatórios e gráficos |
| `/logs` | Logs | Logs do sistema |
| `/super-admin` | SuperAdmin | Painel Super Admin |
| `/billing` | Billing | Gerenciamento de cobranças |
| `/catalog` | Catalog | Catálogo de produtos |

### Estado Global (Zustand)
- **authStore**: Gerencia autenticação, token, usuário logado
- **appStore**: Estado global da aplicação

### Comunicação em Tempo Real
- `useSocket` hook para conexão Socket.IO
- Eventos: mensagens de chat, status de WhatsApp, notificações

---

## Infraestrutura & Deploy

### Docker Compose
- **db**: PostgreSQL 14 Alpine com volume persistido
- **app**: Aplicação Node.js com build multi-stage
- **Traefik**: Reverse proxy com auto-HTTPS via Let's Encrypt

### Dockerfile (Multi-stage)
1. **Stage 1** (`frontend-build`): Node 20 Alpine — compila o frontend React
2. **Stage 2** (`production`): Node 20 Bookworm Slim — instala dependências, copia build do frontend para `public/`, gera Prisma client, roda migrations e inicia o servidor

### Variáveis de Ambiente
- `PORT`, `NODE_ENV`, `JWT_SECRET`, `DATABASE_URL`, `ENCRYPTION_KEY`, `DOMAIN`

---

## Segurança

- **Helmet** para headers HTTP de segurança
- **Rate limiting** em endpoints (geral, auth, API, upload)
- **Sanitização** de body com `express-mongo-sanitize`
- **JWT** para autenticação (tokens Bearer)
- **Criptografia** de chaves sensíveis (API keys da IA, tokens MP) via `crypto.js` com ENCRYPTION_KEY
- **Roles e permissões** hierárquicas com middleware dedicados
- CORS configurado
- Socket.IO com autenticação por token

---

## Observações e Pontos de Atenção

1. **Credenciais padrão inseguras**: O seed cria `admin/admin123` — deve ser alterado em produção
2. **JWT secret default**: `crm-super-secret-key-123` no config — perigoso se não sobrescrito
3. **CORS `origin: '*'`** no Socket.IO — aceitável para dev, restritivo em produção
4. **`.env` commitado** no repositório (252B) — deveria estar no `.gitignore` (mas está listado lá, então pode ser um placeholder)
5. **Sem testes automatizados** detectados (sem diretório `tests/`, `__tests__/`, nem script de test no package.json)
6. **Prisma migrations** presentes no diretório `prisma/migrations/`
7. **Frontend build** (`dist/`) está commitado no repositório — normal para deploy via Docker
8. **Peso do projeto**: Backend robusto com ~50K+ de código fonte, frontend com ~100K+ nas páginas principais

---

## Resumo

O Adapter Connect é um **CRM SaaS completo e funcional** para atendimento via WhatsApp, com arquitetura multi-tenant bem estruturada. Possui integração com múltiplos providers de IA, Mercado Pago para pagamentos, pipeline de vendas Kanban, catálogo de produtos, e deploy containerizado com HTTPS automático. O código está organizado em camadas claras (controllers → models → services) com middlewares de segurança adequados. A principal lacuna identificada é a ausência de testes automatizados.
