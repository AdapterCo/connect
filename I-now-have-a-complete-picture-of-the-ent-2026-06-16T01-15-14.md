I now have a complete picture of the entire project. Let me compile the comprehensive analysis.

---

# 🔍 Análise Crítica Completa — AdapterConnect

## Visão Geral do Projeto

Sistema CRM multi-tenant para WhatsApp com atendente virtual IA (Gemini/OpenAI/Grok), integração Mercado Pago, catálogo de produtos, pedidos, impressão térmica via rede, e um painel React no frontend. Stack: Node.js + Express + Prisma + PostgreSQL + Socket.IO + React/Vite/Tailwind.

---

## 🚨 CRÍTICO — Segurança

### 1. Credenciais reais expostas no repositório
O `.env` contém tokens reais do Mercado Pago commitados:
```
PLATFORM_MP_ACCESS_TOKEN=APP_USR-3530813807978546-032811-813bf92f74abb563325732f66b580a9b-1686419322
```
O `.env.example` **também contém a mesma credencial real** — defeats the purpose. O `.gitignore` lista `.env`, mas os arquivos já foram commitados no histórico do Git. **Estas credenciais devem ser revogadas imediatamente.**

### 2. JWT_SECRET nunca foi alterado para produção
```javascript
// .env
JWT_SECRET=change-this-to-a-strong-random-secret
```
O fallback no código é pior ainda (`src/config/index.js:8`):
```javascript
JWT_SECRET: process.env.JWT_SECRET || 'crm-super-secret-key-123'
```
**Qualquer pessoa que conheça o fallback consegue forjar tokens JWT para qualquer usuário, incluindo superadmin.**

### 3. ENCRYPTION_KEY com fallback hardcoded
```javascript
ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || 'default-secret-key-32-chars-long!'
```
Chaves de API (Gemini, OpenAI, Grok) são criptografadas com esta chave. Se o env não estiver setado, qualquer um pode descriptografar.

### 4. auth_info_baileys/ contém sessões WhatsApp no repo
A pasta `auth_info_baileys/` com dados de sessão do WhatsApp está presente (e a `auth_info_baileys_inst_default/` também). Isso permite clonar sessões de WhatsApp de clientes.

### 5. Password Reset Token retornado na resposta da API
`passwordResetController.js:38-43`:
```javascript
res.json({
  success: true,
  message: 'Token de recuperação gerado.',
  reset_url: resetUrl,
  token  // ← TOKEN EXPOSTO! Qualquer chamador recebe o token
});
```
O token deveria ser enviado **apenas por email**, não retornado na resposta HTTP.

### 6. Socket.IO com CORS totalmente aberto
`socket.js:8`: `origin: '*'` — qualquer origem pode se conectar ao WebSocket e receber atualizações em tempo real de todas as empresas.

### 7. Webhooks sem verificação de assinatura
- `paymentController.handleWebhook` — não verifica assinatura do Mercado Pago
- `billingController.handleBillingWebhook` — mesmo problema
- Qualquer pessoa pode enviar payloads falsos para manipular status de pagamentos/faturas.

### 8. bcrypt.compareSync bloqueia o event loop
`authController.js:20`:
```javascript
const isPasswordValid = bcrypt.compareSync(password, user.password);
```
Deve usar `await bcrypt.compare()` (async). Em alta concorrência, isso trava o server.

### 9. Endpoints de billing sem autenticação
`billingRoutes.js` — rotas sem `authenticateToken`:
- `GET /plans`
- `GET /checkout/config`
- `GET /checkout/:invoiceId`
- `POST /checkout/:invoiceId/payment`
- `GET /checkout/:invoiceId/status`

O endpoint de checkout expõe dados de empresa/assinatura para qualquer pessoa com um invoiceId.

### 10. SSRF potencial no printService
`printService.js` conecta TCP a IPs arbitrários configurados pelo usuário via `sendEscPosData(ip, port, data)`. Sem validação de IP, um atacante pode configurar IP interno (ex: `169.254.169.254` para AWS metadata) para exfiltrar dados.

### 11. express-mono-sanitize inútil com PostgreSQL
O pacote `express-mongo-sanitize` está instalado mas o banco é PostgreSQL/Prisma. Não faz nada.

### 12. Token JWT armazenado em localStorage (Frontend)
`authStore.ts:24`: `localStorage.getItem('crm_token')` — vulnerável a XSS. Deveria usar httpOnly cookies.

---

## ⚠️ ALTO — Arquitetura e Design

### 13. Frontend dual: HTML legado + React
Existem **dois frontends** simultâneos:
- `public/` — HTML monolítico (54KB `index.html`, `login.html`) servido como estático pelo Express
- `frontend/` — React/TypeScript/Vite/Tailwind

O `Dockerfile` faz `COPY --from=frontend-build /app/frontend/dist ./public`, **sobrescrevendo o frontend legado**. Mas em desenvolvimento, ambos existem. Isso gera confusão, risco de endpoints duplicados e superfície de ataque desnecessária.

### 14. Sem transações de banco de dados
Nenhuma operação usa transações Prisma (`prisma.$transaction`). Exemplo: `createOrder` cria a ordem e seus itens em queries separadas — se falhar no meio, fica com dados inconsistentes.

### 15. Estado em memória — perda total no restart
`whatsappService.js:18`: `const activeConnections = {}` — todas as conexões WhatsApp são perdidas no restart. Não há persistência, reconnection strategy, nem graceful handoff.

### 16. Arquitetura baseada em polling
```javascript
// server.js
setInterval(() => {
  schedulerService.checkScheduledMessages()  // a cada 10 segundos
}, 10000);

setInterval(() => {
  mercadoPagoService.checkAllPendingPayments()  // a cada 60 segundos
}, 60000);
```
`checkAllPendingPayments()` carrega **TODOS os chats com TODAS as mensagens** do banco a cada minuto. Escala terrivelmente.

### 17. Sem graceful shutdown
`server.js` não captura SIGTERM/SIGINT. No Docker, o container mata o processo abruptamente, perdendo conexões WebSocket e operações em andamento.

### 18. initializeDatabase() re-seed planos em cada startup
`database.js` faz `upsert` nos planos Essencial, Profissional e Empresarial **em cada inicialização do servidor**. Se um admin alterar preços/configurações manualmente, são sobrescritos no próximo deploy.

### 19. IDs gerados com Date.now()
```javascript
// instanceController.js:33
const newId = 'inst_' + Date.now();
// scheduleController.js:23
id: 'sch_' + Date.now() + '_' + Math.floor(Math.random() * 1000)
```
Não é collision-safe. O schema Prisma define `@default(uuid())` mas o código ignora e gera seus próprios IDs.

### 20. Sem paginação em endpoints críticos
`Chat.findAll()`, `User.findAll()`, `Log.findAll()`, `ScheduledMessage.findAllPending()` retornam **todos os registros**. Com milhares de chats/mensagens, isso causa timeout e memory leak.

### 21. Log rotation frágil
`Log.add()` conta registros em cada escrita e deleta os mais antigos se passar de 100. Isso é ineficiente (2 queries extras por log) e sujeito a race conditions.

---

## 🔶 MÉDIO — Qualidade de Código

### 22. Sem testes (zero)
Não há nenhum arquivo de teste. O `package.json` nem tem script de teste. Zero cobertura.

### 23. Sem TypeScript no backend
Backend é 100% JavaScript sem tipos. Frontend é TypeScript. Inconsistente.

### 24. Tratamento de erros genérico e inconsistente
Alguns controllers retornam `{ error: 'msg' }`, outros `{ success: true, data }`, outros `{ message }`. Não há middleware centralizado de erro.

### 25. companyMiddleware.js não é usado em lugar algum
O middleware existe mas não é importado em nenhuma rota.

### 26. helpers.js essencialmente vazio
Contém apenas `sleep()`. Não há utilidades reais.

### 27. logger.js é um wrapper trivial
```javascript
function info(message, prefix = 'LOG') {
  console.log(`[${prefix}] ${message}`);
}
```
Sem níveis de log, sem formatação estruturada, sem rotação, sem persistência.

### 28. companyController.js expõe apenas 1 rota
Define `getPlanInfo` mas toda a lógica de empresa está espalhada em `superadminController.js`.

### 29. Código duplicado entre controllers
A busca de `settings` com fallback para `comp_default` está em `settingsController.js`, `paymentController.js`, `chatController.js` e `whatsappService.js`. Deveria estar num service.

### 30. AI Service com mock frágil
`aiService.js` tem um
