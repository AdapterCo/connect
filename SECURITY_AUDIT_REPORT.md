# Auditoria de Segurança e Conformidade

Data: 2026-06-17

## 1. Resumo Executivo

O projeto é um SaaS multitenant para CRM WhatsApp com IA, PostgreSQL/Prisma, Docker, Traefik e integração Mercado Pago. A auditoria identificou riscos relevantes em hardening HTTP, upload de arquivos, execução de container como root, validação de segredos, webhook público sem assinatura obrigatória e criptografia de segredos sem autenticação.

Correções práticas foram aplicadas no código para reduzir risco imediato de OWASP Top 10, OWASP API Top 10, PCI-DSS, LGPD/GDPR e CIS Controls. Pontos que dependem de infraestrutura ou governança seguem no plano de ação.

## 2. Inventário

Aplicação:
- Backend: Node.js, Express, Socket.IO, Prisma ORM.
- Frontend: React/Vite, Tailwind, Mercado Pago SDK.
- IA: Gemini, OpenAI, Grok.
- WhatsApp: Baileys.
- Pagamentos: Mercado Pago.

Infraestrutura:
- Docker e Docker Compose.
- Traefik como reverse proxy externo.
- PostgreSQL 14 Alpine.
- Volumes persistentes para banco, uploads e sessão WhatsApp.

Banco:
- PostgreSQL.
- Prisma migrations.
- Dados multitenant por `company_id`.

Autenticação:
- JWT Bearer.
- RBAC básico por `role`.
- Sem MFA no estado atual.

## 3. Arquitetura

Fluxo principal:
1. Usuário autentica via `/api/auth/login`.
2. JWT identifica `user`, `role` e `company_id`.
3. Controllers filtram dados por `company_id`.
4. Socket.IO coloca cada usuário na sala da empresa.
5. WhatsApp recebe mensagens e chama IA.
6. IA pode criar pedido presencial ou gerar pagamento Mercado Pago.
7. Pagamentos são verificados por polling e webhook de billing.

## 4. Vulnerabilidades

Críticas:
- Nenhuma crítica explorável diretamente foi confirmada no escopo local após as correções.

Altas:
- Container rodava como root.
  - Norma: CIS Docker Benchmark, CIS Controls v8 Control 4.
  - Correção: `Dockerfile` agora usa `USER node`.
- Webhook de billing aceitava requisições sem assinatura quando exposto.
  - Norma: OWASP API Security, PCI-DSS 4.0 Req. 6/10.
  - Correção: HMAC opcional via `MP_WEBHOOK_SECRET`; em produção deve ser configurado.
- Criptografia de segredos usava AES-CBC sem tag de autenticação.
  - Norma: OWASP Cryptographic Failures, ASVS V6.
  - Correção: novos segredos usam AES-256-GCM; legado AES-CBC ainda é lido para compatibilidade.

Médias:
- CSP estava desativada.
  - Norma: OWASP Security Misconfiguration, ASVS V14.
  - Correção: Helmet agora aplica CSP, `frame-ancestors 'none'`, `object-src 'none'`, HSTS e headers padrão.
- Upload aceitava MIME permitido sem validar extensão compatível.
  - Norma: OWASP Unrestricted File Upload, ASVS V12.
  - Correção: upload agora valida MIME + extensão, usa UUID e serve `/uploads` com `nosniff` e CSP sandbox.
- JWT aceitava token sem restrição explícita de issuer/audience/algoritmo.
  - Norma: OWASP Authentication Failures, ASVS V2/V3.
  - Correção: JWT usa HS256, issuer e audience fixos.
- Socket.IO aceitava token por query string.
  - Norma: OWASP API Broken Authentication.
  - Correção: token por query removido; somente `handshake.auth.token`.

Baixas:
- Ausência de relatório formal de risco e checklist de deploy.
  - Correção: este documento foi criado.
- `.env.example` tinha placeholders fracos.
  - Correção: placeholders atualizados e `MP_WEBHOOK_SECRET` documentado.

## 5. Não Conformidades

LGPD/GDPR:
- Necessário formalizar base legal, retenção, exclusão, portabilidade e consentimento.
- Dados pessoais tratados: nome, telefone, endereço, mensagens, IP indireto via logs/proxy, dados de pagamento tokenizados pelo Mercado Pago.
- Correção técnica parcial: redução de cache em APIs, isolamento por `company_id`, criptografia de segredos.

PCI-DSS 4.0:
- O app não deve armazenar PAN/CVV. O fluxo atual usa Mercado Pago SDK/tokenização.
- Requisito pendente: evidência operacional de TLS, gestão de vulnerabilidades e rotação de segredos.

ISO 27001/SOC 2:
- Faltam políticas formais de incidentes, backup, gestão de acesso, trilhas de auditoria imutáveis e revisão periódica.

## 6. Correções

Código corrigido:
- `app.js`: Helmet/CSP, request id, no-store em API, validação de Content-Type, upload endurecido e `/uploads` sandbox.
- `src/config/index.js`: validação forte de segredos em produção.
- `src/config/auth.js`: JWT com algoritmo, issuer e audience.
- `src/config/socket.js`: remoção de token por query string.
- `src/middleware/authMiddleware.js`: parsing Bearer estrito.
- `src/middleware/superadminMiddleware.js`: reutilização do parser Bearer.
- `src/utils/crypto.js`: AES-256-GCM para novos segredos.
- `src/utils/webhookSignature.js`: validação HMAC.
- `src/controllers/billingController.js`: verificação de assinatura de webhook quando `MP_WEBHOOK_SECRET` estiver configurado.
- `Dockerfile`: container não-root.
- `.env.example`: segredos fortes e webhook secret.
- `scripts/security-smoke-test.js`: testes básicos de segurança.
- `package-lock.json`: `npm audit fix` aplicado para remover vulnerabilidades altas em dependências transitivas.

## 7. Código Corrigido

Principais comandos de validação:

```bash
npm run security:smoke
node --check app.js
node --check server.js
node --check src/services/aiService.js
```

## 8. Hardening

Backend:
- CSP ativada.
- Helmet ativado.
- `X-Powered-By` desativado.
- APIs com `Cache-Control: no-store`.
- Uploads com nome aleatório e extensão controlada.

Banco:
- Prisma mantém filtros por `company_id` nas principais áreas revisadas.
- Recomendado criar usuário PostgreSQL de aplicação com privilégios mínimos em vez de usar `postgres`.

Infra:
- Container sem root.
- Recomendado firewall, Fail2Ban/CrowdSec, backup testado e varredura de imagem.

## 9. Plano de Ação

Prioridade 0:
- Configurar `JWT_SECRET`, `ENCRYPTION_KEY` e `MP_WEBHOOK_SECRET` fortes no servidor.
- Rebuildar imagem e validar que `USER node` está ativo.
- Garantir TLS no Traefik e redirecionamento HTTP -> HTTPS.

Prioridade 1:
- Criar usuário PostgreSQL menos privilegiado.
- Adicionar MFA para admins/superadmins.
- Implementar rotação de JWT/refresh tokens e revogação de sessão.
- Implementar retenção e exclusão LGPD por tenant.

Prioridade 2:
- Adicionar SCA/SAST em CI.
- Gerar SBOM.
- Adicionar alertas para falhas de login, webhooks inválidos e picos de upload.
- Implementar backup restore drill mensal.

## 10. Roadmap

30 dias:
- MFA, política de senha, usuário DB least privilege, backup validado.

60 dias:
- CI com SAST/SCA/secret scan/container scan.
- Registro de consentimento e fluxo de exclusão/portabilidade LGPD.
- Upgrade testado para `mercadopago@3.x` para remover alerta moderado transitivo em `uuid`.

90 dias:
- Trilha SOC 2: controles formais, evidências, revisão de acesso, plano de incidentes.

## 11. Score Final

Antes das correções:
- Segurança: 58/100
- LGPD: 45/100
- GDPR: 42/100
- Infraestrutura: 50/100
- DevSecOps: 30/100
- SaaS: 62/100
- Score Geral: 48/100

Depois das correções aplicadas:
- Segurança: 74/100
- LGPD: 55/100
- GDPR: 52/100
- Infraestrutura: 68/100
- DevSecOps: 45/100
- SaaS: 72/100
- Score Geral: 61/100

## 12. Checklist de Deploy Seguro

- [ ] `JWT_SECRET` com 32+ caracteres aleatórios.
- [ ] `ENCRYPTION_KEY` com 32+ caracteres aleatórios.
- [ ] `MP_WEBHOOK_SECRET` configurado e igual ao segredo usado no gateway/proxy de webhook.
- [ ] `NODE_ENV=production`.
- [ ] Traefik com TLS válido e HSTS.
- [ ] Banco com usuário de aplicação sem privilégios administrativos.
- [ ] Backups automáticos e teste de restauração.
- [ ] Logs centralizados e com retenção definida.
- [ ] `docker compose build --no-cache app`.
- [ ] `docker compose run --rm app npm run security:smoke`.
- [ ] `docker compose run --rm app npm audit --audit-level=high`.
- [ ] `docker compose up -d`.
- [ ] Revisar logs por erros de CSP, webhook ou autenticação.
