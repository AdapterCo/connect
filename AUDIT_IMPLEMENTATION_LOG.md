# Registro de Implementacao da Auditoria

Data: 2026-06-17

## Escopo Implementado

Este registro documenta as melhorias aplicadas apos o plano de melhoria dos scores de seguranca, LGPD/GDPR, infraestrutura, DevSecOps e SaaS.

## Fase 1 - Docker, Healthcheck e Ambiente

Alteracoes:
- Criado `scripts/docker-entrypoint.sh` para corrigir ownership/permissoes dos volumes `auth_info_baileys` e `public/uploads` antes de iniciar o app.
- Dockerfile passou a usar o entrypoint e derrubar privilegios para o usuario `node` na execucao real do app.
- Adicionado endpoint `GET /health`.
- Adicionado `healthcheck` no `docker-compose.yml` e `stack.yml`.
- Validacao de `DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY` e `DOMAIN` em producao.
- Aviso de seguranca quando `MP_WEBHOOK_SECRET` nao estiver configurado.

Arquivos:
- `Dockerfile`
- `scripts/docker-entrypoint.sh`
- `docker-compose.yml`
- `stack.yml`
- `app.js`
- `src/config/index.js`

## Fase 2 - LGPD/GDPR e Retencao

Alteracoes:
- Criados endpoints LGPD para exportacao, anonimizacao e exclusao de dados por cliente/chat.
- Criado servico de privacidade com escopo obrigatorio por `company_id`.
- Criada politica de retencao opt-in via variaveis de ambiente.
- Retencao automatica diaria quando `RETENTION_ENABLED=true`.

Endpoints:
- `GET /api/privacy/clients/:chatId/export`
- `POST /api/privacy/clients/:chatId/anonymize`
- `DELETE /api/privacy/clients/:chatId`

Variaveis:
- `RETENTION_ENABLED=false`
- `AUDIT_LOG_RETENTION_DAYS=365`
- `SYSTEM_LOG_RETENTION_DAYS=180`
- `MESSAGE_RETENTION_DAYS=0`

Arquivos:
- `src/routes/privacyRoutes.js`
- `src/controllers/privacyController.js`
- `src/services/privacyService.js`
- `src/services/retentionService.js`
- `server.js`

## Fase 3 - RBAC e Sessoes

Alteracoes:
- Criado middleware RBAC central.
- Rotas sensiveis protegidas por nivel minimo de papel.
- Adicionado `session_version` ao usuario para revogacao de JWTs antigos.
- Login inclui `session_version` no token.
- Middleware de autenticacao valida `session_version` no banco.
- Reset de senha incrementa `session_version` e derruba sessoes antigas.
- Endpoint para revogar sessoes de usuario.

Endpoint:
- `POST /api/users/:id/revoke-sessions`

Arquivos:
- `src/middleware/rbacMiddleware.js`
- `src/middleware/authMiddleware.js`
- `src/controllers/authController.js`
- `src/controllers/passwordResetController.js`
- `src/controllers/userController.js`
- `src/routes/userRoutes.js`
- `prisma/schema.prisma`
- `prisma/migrations/20260617190000_add_user_session_version/migration.sql`

## Fase 4 - DevSecOps

Alteracoes:
- Criado check de sintaxe para todos os JS.
- Criado agregador local de checks DevSecOps.
- Mantido smoke test de seguranca.
- Adicionado script SCA para vulnerabilidades altas.

Comandos:

```bash
npm run check:all-js
npm run security:smoke
npm run security:audit
npm run devsecops:local
npx prisma validate
```

Arquivos:
- `scripts/check-all-js.js`
- `scripts/devsecops-local.js`
- `scripts/security-smoke-test.js`
- `package.json`

## Fase 5 - Infraestrutura e Operacao

Alteracoes:
- Compose/Stack com healthcheck.
- Compose/Stack com variaveis de webhook secret e retencao.
- Documentacao de deploy seguro atualizada no relatorio.

## Validacao Esperada

Local:

```bash
npm.cmd run check:all-js
npm.cmd run security:smoke
npx.cmd prisma validate
```

Docker:

```bash
docker compose build --no-cache app
docker compose run --rm app npm run security:smoke
docker compose up -d app
docker compose ps
curl -fsS http://127.0.0.1:3009/health
```

## Riscos Residuais

- `mercadopago@2.x` ainda carrega alerta moderado transitivo em `uuid`; upgrade para `mercadopago@3.x` deve ser tratado em tarefa separada com testes de pagamento.
- MFA ainda nao foi implementado; requer decisao de canal TOTP/e-mail e UX.
- Least privilege no PostgreSQL requer alteracao operacional no banco e credenciais.
- Backups e alertas dependem da infraestrutura do servidor.

---

## Ciclo 3 — Aplicacao de Correções do Relatório Supremo (2026-06-19)

Correções aplicadas com base no relatório `auditoria_score_report.md` gerado via parametro `auditoria.md`.

### [U3] Dockerfile — USER node
- `Dockerfile` linha 25: `USER root` substituído por `USER node`.
- Container agora declara explicitamente usuario nao-root. CIS Docker Benchmark 4.1.
- Smoke-test atualizado para assertar `USER node` e rejeitar `USER root`.

### [U2] MP_WEBHOOK_SECRET obrigatorio em producao
- `src/config/index.js`: `console.warn` substituido por `throw new Error` fatal.
- Em producao, o app nao sobe sem `MP_WEBHOOK_SECRET` configurado.
- OWASP API8, PCI-DSS 4.0 Req. 10.

### [U1] Limpeza de admin_password apos ativacao do SignupCheckout
- `src/services/billingService.js` funcao `activateSignupCheckout`:
  - Apos criar o tenant, `admin_password` e `payer_email` sao zerados na tabela.
  - Minimizacao de dados pos-ativacao. LGPD Art. 46, OWASP A02.

### [A4] Timeout em chamadas a IA
- `src/services/aiService.js`:
  - OpenAI: `timeout: 30_000, maxRetries: 2` no construtor.
  - Grok: `AbortController` com 30s de timeout no `fetch`.
  - OWASP API10, DoS por hold de resposta.

### [A5] Anti-user enumeration documentado
- `src/controllers/authController.js`: comentario explicito sobre mensagens identicas.
- Previne regressao futura. OWASP A07.

### [A6] CSP — sdk.mercadopago.com adicionado ao script-src
- `app.js`: SDK do Mercado Pago adicionado ao CSP.
- Comentario de aviso SRI para novos dominios externos.

### [M1] Secret Scan local
- `scripts/secret-scan.js`: detecta API keys, tokens e credenciais hardcoded.
- Integrado ao pipeline `npm run devsecops:local`.
- Comando: `npm run secret:scan`.

### [M5] Script de migracao de criptografia CBC -> GCM
- `scripts/migrate-crypto.js`: re-encripta campos legados CBC para GCM.
- Suporte a `--dry-run`.
- Comandos: `npm run crypto:migrate:dry` e `npm run crypto:migrate`.

### [M5] Deadline de migracao documentado
- `src/utils/crypto.js`: comentario com instrucao de migracao e referencia ao script.

### [Env] .env.example atualizado
- Placeholders fracos (`kkk...`) removidos.
- Cada variavel tem descricao, instrucao e formato esperado.
- `PORT` corrigido para 3009 (porta real do Dockerfile).

### Validacao
- `node scripts/check-all-js.js`: 72 arquivos OK.
- `node scripts/security-smoke-test.js`: passed.
- `node scripts/secret-scan.js`: nenhum segredo detectado.

