# Auditoria do Adapter Connect — 01/10/2026

## Conclusão e alcance

Há falhas relevantes de autorização, cadastro com pagamento, confiabilidade de mensagens e tratamento de dados pessoais. A prioridade é corrigir a autorização por telefone e a sobrescrita de cadastro pendente. Testes verdes e ausência de alertas no npm audit não eliminam essas falhas de lógica.

Foram inventariados backend, frontend, testes, schema e migrações, scripts, documentação e arquivos de deploy; revisados os caminhos de autenticação, acesso a conversas/instâncias/mídias, cobrança, agendamento, IA, fluxos, privacidade e operação. A análise combina inspeção estática, execução dos checks existentes e duas reproduções isoladas em memória. Não é certificação de segurança nem prova de ausência de outros defeitos. Não foram realizados testes em produção, pagamentos reais, chamadas de IA, pareamento de WhatsApp ou aplicação de migrações no banco real. O ambiente de implantação e o histórico completo de segredos do Git não foram auditados.

Nenhuma correção de código, commit ou push foi realizada. Este documento é o entregável da revisão.

## Verificações executadas

| Verificação | Resultado | Limite da evidência |
| --- | --- | --- |
| `npm.cmd test` | 74 testes passaram; zero falhas | Muitos testes substituem Prisma/serviços por mocks |
| `npm.cmd run check:all-js` | 77 arquivos JS válidos | Verifica sintaxe, não comportamento |
| `npm.cmd run security:smoke` | Passou | Cobertura limitada ao script existente |
| `npm.cmd run secret:scan` | 76 arquivos; nenhuma ocorrência | Não inclui frontend, histórico Git e diversos formatos |
| `npx.cmd --no-install prisma validate` | Schema válido | Não executa migrações nem valida dados existentes |
| `npm.cmd audit --json` — raiz | Zero vulnerabilidades reportadas | Base de advisories do registry consultado |
| `npm.cmd audit --json` — frontend | Zero vulnerabilidades reportadas | Não avalia regras de negócio ou imagem Docker |
| Frontend `npm.cmd run lint` | **Falhou:** `_user` não utilizado em `src/pages/Team.tsx:69` | Um erro reportado |
| Frontend `npm.cmd run build` | TypeScript e Vite concluíram | Sem teste de navegação/interações no navegador |
| Reprodução isolada: checkout | Sobrescrita e desvinculação do pagamento confirmadas | Controller real; dados sintéticos e Prisma em memória |
| Reprodução isolada: acesso por telefone | Instância de outro usuário retornada como acessível | Função real; consulta simulada com semântica do filtro OR |

No PowerShell, `npm` inicialmente foi bloqueado pela política de execução do `npm.ps1`; os checks foram executados com `npm.cmd`, sem alterar essa política.

## Achados de segurança e funcionamento

As prioridades são P0 (correção imediata), P1 (antes de depender do fluxo em produção), P2 (próxima rodada) e P3 (manutenção). “Estática” significa caminho identificado no código, sem exploração no ambiente real; “risco” exige reprodução adicional, sobretudo em PostgreSQL/concor­rência.

### 01 — P0: telefone editável concede acesso a instâncias de outros usuários

**Evidência:** `src/controllers/userController.js:134`, `src/models/Instance.js:85`, `src/models/Chat.js:33`. Qualquer usuário pode alterar seu próprio telefone. `getUserInstanceIds` aceita instâncias pelo vínculo `user_id` **ou** pela coincidência do telefone, mesmo quando já vinculadas a outra pessoa. `GET /api/instances` fornece os números da empresa a usuários autenticados.

**Impacto:** um atendente pode declarar o número de uma instância alheia e passar a ver conversas dessa instância dentro dos filtros de setor. Para instâncias sem dono, a consulta ainda grava automaticamente o vínculo no banco. É escalada de acesso dentro da empresa, não prova de acesso entre empresas. A reprodução isolada confirmou o retorno de uma instância cujo `user_id` pertencia a outro usuário.

**Correção:** autorização exclusivamente por vínculo explícito aprovado por gestor; telefone como dado de contato, com comprovação de posse se usado como identidade. Remover mutações de vínculo de consultas de acesso. Adicionar regressão com instância vinculada e sem vínculo.

### 02 — P0: cadastro público sobrescreve checkout pendente sem comprovar autoria

**Evidência:** `src/routes/authRoutes.js:18`, `src/controllers/authController.js:285`. `register-tenant` procura checkout pendente por slug **ou** username e atualiza dados do administrador, hash da senha, plano, valor, e-mail e referência de pagamento sem autenticação ou token de retomada.

**Impacto:** terceiros que conhecem um slug ou username podem substituir o cadastro pendente e desligar a referência do pagamento existente. A reprodução confirmou HTTP lógico 201, troca de administrador e `mp_payment_id = null`. Há risco de desvio da identidade ativada e perda de conciliação, especialmente com pagamento concorrente; essa última corrida exige teste integrado.

**Correção:** segredo de retomada independente, vinculado ao checkout; rejeitar colisões sem esse segredo. Dados de identidade/valor imutáveis após iniciar pagamento. Reservas únicas e expiração explícita.

### 03 — P1: conexões em tempo real mantêm permissões antigas

**Evidência estática:** `src/config/socket.js:66`, `:85`, `:107`; `src/controllers/userController.js:190`; `src/controllers/instanceController.js`, `assignInstance`. Setor e IDs de instâncias são capturados na conexão. Alterar setor, telefone ou vínculo da instância não atualiza nem encerra os sockets existentes.

**Impacto:** usuário removido de um setor/instância pode continuar recebendo eventos das conversas anteriormente permitidas até reconectar ou expirar o token.

**Correção:** invalidar/recarregar autorização dos sockets em toda mudança relevante e remover conversas do estado do frontend. Testar revogação com conexão aberta. Referência: [OWASP WebSocket Security](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html).

### 04 — P1: empresa suspensa continua com sockets e automações

**Evidência estática:** `src/config/socket.js:66` autentica usuário sem `checkCompanyActive`; `src/services/whatsappService.js:1459` executa fluxo antes da consulta à empresa, e `:1470` consulta a empresa sem bloquear IA por inatividade/expiração. `src/services/schedulerService.js:19` não verifica o plano.

**Impacto:** suspensão bloqueia várias APIs HTTP, mas não interrompe consistentemente recebimento de eventos, fluxos, IA e agendamentos. Pode consumir recursos após suspensão.

**Correção:** política única de empresa ativa no handshake e nos workers, com encerramento imediato das sessões/automação ao suspender. Definir explicitamente se captura passiva de mensagens continua.

### 05 — P1: não há ciclo completo de renovação de assinatura

**Evidência estática:** `src/services/billingService.js:532` apenas muda assinaturas expiradas para `past_due` e desativa a empresa; não gera a próxima fatura. `authController.js:57` recusa login da empresa expirada. `frontend/src/pages/Billing.tsx` só permite pagar se já existe `mp_payment_url`.

**Impacto:** após o primeiro período, o cliente pode ficar sem caminho autônomo de renovação. Uma fatura criada tem URL nula até a criação do pagamento, e a tela de faturamento não oferece esse checkout.

**Correção:** gerar fatura renovável, oferecer checkout pelo ID e permitir acesso restrito ao faturamento quando vencido. Testar cadastro → pagamento → expiração → renovação.

### 06 — P1: confirmação de Pix depende do navegador continuar consultando

**Evidência estática:** `src/services/billingService.js:498`, `server.js:38`, `src/routes/billingRoutes.js`. Há polling por checkout, mas nenhum worker de reconciliação de pagamentos pendentes; o worker de cobrança só verifica expiração.

**Impacto:** cliente paga e fecha a página; a ativação pode continuar pendente até nova consulta. Não é necessário introduzir webhook para resolver.

**Correção:** reconciliação periódica persistente com API do Mercado Pago, tentativas, backoff e alerta para pagamentos sem ativação.

### 07 — P1: múltiplas tentativas de pagamento substituem a referência anterior

**Evidência estática/risco concorrente:** `src/services/billingService.js:346`, `:412`, `:484`. Checkout/fatura tem somente um `mp_payment_id`, sobrescrito a cada tentativa. Confirmação procura pela referência atualmente armazenada.

**Impacto:** pagamento de uma tentativa anterior pode ser aprovado sem ser encontrado; requisições concorrentes podem reescrever estado que já avançou. Cartões diferentes usam chaves de idempotência diferentes.

**Correção:** tabela de tentativas de pagamento, relação imutável com cobrança, claim condicional e reconciliação de todas as tentativas. Simular duas tentativas com aprovações fora de ordem.

### 08 — P1: criação de assinatura não é atômica

**Evidência estática:** `src/services/billingService.js:38`. Cria assinatura, altera empresa e cria fatura em operações separadas. A busca de assinatura existente ocorre antes das gravações.

**Impacto:** falha intermediária deixa empresa desativada ou assinatura pendente sem fatura; duas chamadas simultâneas podem criar duplicatas.

**Correção:** transação, trava/isolamento adequado e restrição de uma assinatura corrente por empresa. Cobrir falha entre etapas e concorrência com PostgreSQL.

### 09 — P1: cancelamento não impede o estado de empresa ativa de permanecer

**Evidência estática:** `src/services/billingService.js:731`. Cancela apenas a assinatura; o worker de expiração seleciona exclusivamente `status: 'active'`. A empresa permanece `is_active: true` com a data antiga; APIs protegidas pela data bloqueiam depois, mas sockets/automações não.

**Impacto:** estados inconsistentes e continuidade de automação após término do período cancelado. A função também retorna o objeto anterior ao update.

**Correção:** definir cancelamento ao fim do período versus imediato; aplicar expiração à empresa independentemente do estado da assinatura e retornar estado atualizado.

### 10 — P1: agendamento é descartado mesmo quando o envio falha

**Evidência estática:** `src/services/schedulerService.js:22`, `:81`. Registra mensagem antes de enviar; erro ou WhatsApp desconectado resulta em log e exclusão do agendamento.

**Impacto:** perda definitiva de envio programado e histórico que contém mensagem não entregue. Um crash entre envio e exclusão também pode causar duplicação na retomada.

**Correção:** estados pending/processing/sent/failed, tentativas persistentes, claim, confirmação de envio e recuperação de jobs. Duplicação exige estratégia explícita de idempotência.

### 11 — P1: anonimização preserva identificador pessoal do WhatsApp

**Evidência estática:** `src/services/privacyService.js:78`, `prisma/schema.prisma:121`. Limpa nome e `client_phone`, mas não `remote_jid`, que pode conter número telefônico ou identificador associado ao cliente.

**Impacto:** o registro continua identificável. Logs anteriores com nome/telefone e agendamentos associados também não são tratados pelo serviço de anonimização.

**Correção:** inventário dos campos identificadores; limpar/substituir JID, cancelar agendamentos e definir tratamento de logs e backups. Caso seja preciso manter bloqueio por identificador, tratá-lo como pseudonimização, com finalidade e acesso restritos. Esta é avaliação técnica de dados, não parecer jurídico.

### 12 — P1: retenção remove referências de mídia, mas deixa arquivos no disco

**Evidência estática:** `src/services/retentionService.js:46`. Zera URL e nome da mídia no banco sem remover arquivo. Também não limpa `sender_id`, notas e variáveis pessoais de fluxos.

**Impacto:** acúmulo de arquivos e retenção física além do prazo configurado; arquivos enviados pelo próprio usuário ainda podem ser acessíveis pelo prefixo de proprietário.

**Correção:** coletar referências antes de limpar, excluir quando não compartilhadas, limpar dados correlatos conforme política e executar coleta de órfãos.

### 13 — P1: entrada de mídia via WhatsApp não tem limite local de tamanho

**Evidência estática:** `src/services/whatsappService.js:711`, `:850`. Baixa para buffer completo e grava sem validar tamanho, quota ou conteúdo. O limite de 10 MB do Multer não cobre esse caminho.

**Impacto:** grandes arquivos e concorrência podem pressionar memória/disco. A transcrição ainda duplica o conteúdo em base64.

**Correção:** limite de tamanho por arquivo e tenant, streaming com interrupção, limites de concorrência, validação de formato e descarte controlado.

### 14 — P2: upload HTTP confia no MIME declarado e na extensão

**Evidência estática:** `app.js:153` (`fileFilter`). Verifica apenas `file.mimetype` e extensão; não inspeciona assinatura/conteúdo. Não há quota total, expiração de uploads sem uso ou verificação antimalware.

**Impacto:** arquivos com conteúdo diferente do declarado são aceitos; arquivos permitidos também podem carregar conteúdo malicioso. Há autenticação e CSP restritiva ao servir mídia, portanto não foi demonstrada execução remota ou XSS por esse caminho.

**Correção:** detectar tipo real, validar formatos, quota e limpeza de órfãos; avaliar antivírus para documentos. Referência: [OWASP File Upload](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).

### 15 — P2: autorização de conversas diverge entre lista, detalhe e mídia

**Evidência estática:** `src/models/Chat.js:47` usa instância **ou** atribuição pessoal; `src/middleware/accessMiddleware.js:18` usa só instância quando existe vínculo; `src/utils/media.js:9` usa só atribuição para não gestores.

**Impacto:** conversa aparece na lista/socket e falha ao abrir; usuário permitido pela instância pode não carregar anexos. As divergências também dificultam verificar segurança.

**Correção:** centralizar predicado de acesso e reutilizar em HTTP, sockets, mídia e agendamento. Cobrir combinações de setor, dono e instância.

### 16 — P2: vínculo de instância aceita usuário sem conferir a empresa

**Evidência estática:** `src/models/Instance.js:71`, `src/controllers/instanceController.js` (`createInstance`, `assignInstance`), `prisma/schema.prisma:113`. O FK valida apenas ID do usuário, sem FK composta por tenant, e os controllers não verificam sua empresa.

**Impacto:** gestor que conhece outro ID pode gravar vínculo entre tenants, violando integridade e provocando atribuições inconsistentes. Não foi demonstrado vazamento completo entre empresas.

**Correção:** validar usuário no mesmo tenant e criar relação composta equivalente à usada em produtos/Kanban.

### 17 — P2: troca de instância pode enviar pelo número errado

**Evidência estática:** `src/controllers/chatController.js:190` altera a instância da conversa para a primeira do usuário e `findOpenConnectionForCompany` pode escolher qualquer conexão aberta da empresa.

**Impacto:** resposta pode sair por outro número; identidade da conversa deixa de refletir sua origem. A troca também pode colidir com a chave única tenant/instância/JID.

**Correção:** escolher conexão explicitamente, preservar instância de origem e tratar ausência de conexão com erro acionável, sem troca silenciosa.

### 18 — P2: logout limpa cookie, mas não revoga o token nem encerra sockets

**Evidência estática:** `src/controllers/authController.js:126`. Altera presença para offline sem incrementar `session_version` ou chamar `disconnectUser`.

**Impacto:** cópia prévia do token continua válida; conexões existentes em outras abas podem continuar recebendo eventos. O frontend encerra sua conexão ao desmontar, mas isso não substitui invalidação no servidor.

**Correção:** definir logout da sessão atual ou de todas; implementar revogação adequada e encerramento correspondente.

### 19 — P2: pausa do rodízio por WhatsApp não valida intenção nem lead específico

**Evidência estática:** `src/services/whatsappService.js:554`. Qualquer evento do telefone de um membro da equipe procura o lead pendente mais recente e registra confirmação, antes de validar conteúdo. `Chat.update` não copia explicitamente `sales_reply_due_at` para `data` (`src/models/Chat.js:147`).

**Impacto:** confirmação pode ocorrer por mensagem sem intenção; a rotina pode anunciar pausa sem limpar o prazo. Não há vínculo inequívoco com o lead que o vendedor pretendia aceitar.

**Correção:** resposta interativa/comando com ID e prazo, validação do vendedor/lead e update condicional real. Testar com dois leads e evento sem conteúdo.

### 20 — P2: início de WhatsApp tem janela para dois sockets concorrentes

**Evidência estática/risco:** `src/services/whatsappService.js:87`. Verifica estado antes de `await useMultiFileAuthState` e só depois marca `connecting`.

**Impacto:** dois pedidos simultâneos podem ultrapassar a guarda, criar sockets e escrever as mesmas credenciais.

**Correção:** promessa/mutex por instância registrado antes do primeiro await e removido em finally; cobrir duplo clique e reconexão simultânea.

### 21 — P2: fluxos ativos podem ser editados durante execução sem versão

**Evidência estática:** `src/services/flowService.js:368` lê o grafo atual; sessão armazena apenas ID e nó atual. `src/routes/flowRoutes.js:58` substitui grafo de fluxo ativo. Ativação concorrente também não tem exclusividade assegurada por restrição no banco.

**Impacto:** sessão pode apontar para nó removido ou mudar de comportamento no meio. Duas primeiras ativações simultâneas exigem validação de concorrência em PostgreSQL.

**Correção:** publicar versões imutáveis, prender sessão à versão e garantir fluxo ativo único por tenant com lock/restrição.

### 22 — P2: falta timeout explícito na consulta de pagamento e transcrição

**Evidência estática:** `src/services/billingService.js:583` faz fetch sem AbortSignal; `src/services/audioTranscriptionService.js:90` chama geração e tenta modelos em sequência sem orçamento explícito de tempo.

**Impacto:** chamadas lentas mantêm requests/processamento ocupados e atrasam atendimento. Limites internos do SDK/transporte não substituem orçamento definido pela aplicação.

**Correção:** timeout, cancelamento quando possível, limite total de tentativas e concorrência; métricas de latência/falha.

### 23 — P2: paginação e agregação insuficientes

**Evidência estática:** `src/models/Chat.js:83` carrega histórico inteiro; `findForList` limita mensagens a 50 por conversa, mas não número de conversas. `src/services/metricsService.js:6` carrega todos os chats e mensagens e processa métricas em memória. `src/routes/productRoutes.js:33` lista todos os produtos.

**Impacto:** crescimento do tenant aumenta consumo de memória, tamanho de payload e latência. WhatsApp ainda emite listas completas em mensagens recebidas (`whatsappService.js:1444`).

**Correção:** cursores, histórico paginado, agregações SQL e eventos incrementais; teste de carga com volume representativo.

### 24 — P2: limites de usuários/instâncias sujeitos a concorrência

**Evidência estática/risco:** `src/middleware/planMiddleware.js:31`, `:61`. Contagem e criação acontecem separadamente, diferentemente da transação serializável de produtos.

**Impacto:** requisições paralelas podem ultrapassar plano.

**Correção:** transação com bloqueio/isolamento e teste integrado concorrente. Mesma revisão para o limite de fluxos.

### 25 — P2: erros e exclusões podem retornar sucesso enganoso

**Evidência estática:** `src/models/Chat.js` (`remove`) e `src/models/Instance.js:28` capturam falha e retornam false; controllers ignoram retorno. Remoção de mídia ocorre antes da exclusão/transação do registro.

**Impacto:** UI recebe sucesso mesmo se conversa/instância continua no banco; uma falha no banco após unlink deixa mensagem referenciando arquivo ausente.

**Correção:** propagar falhas, verificar contagens e usar fila/outbox de exclusão de arquivos após commit com retomada.

### 26 — P2: cobrança usa Float e cálculo mensal com overflow

**Evidência estática:** `prisma/schema.prisma` usa Float para preço de plano, fatura e signup; `src/services/billingService.js:70`, `:249`, `:664` usa `setMonth(+1)`.

**Impacto:** centavos dependem de ponto flutuante. Em datas como 31 de janeiro, somar mês pode avançar para março, em vez de último dia de fevereiro. Renovação paga antecipadamente calcula período a partir de agora, não do fim atual.

**Correção:** Decimal/centavos inteiros, comparação exata e regra explícita de aniversário mensal; preservar período já pago. Validar fuso e dias 28–31.

### 27 — P2: testes em memória dão garantias menores que aparentam

**Evidência:** `tests/helpers/memory-prisma.js:11`. Matcher retorna true para objetos que não reconhece; não implementa fielmente OR, AND, comparações de datas e filtros relacionais. `findMany` ignora ordenação, select, include e take; `$transaction` é simples chamada sem rollback/isolamento.

**Impacto:** aprovação de testes não comprova autorização com consultas complexas, FK, migração ou concorrência. Isso não invalida todos os 74 testes; limita o que eles demonstram.

**Correção:** integração com PostgreSQL isolado para tenant, relações, limites, pagamento e transações; manter testes unitários focados.

### 28 — P2: inicialização falha sem derrubar processo e readiness é incompleta

**Evidência estática:** `server.js:51` abre HTTP antes do seed/inicialização e apenas registra a falha. `/health` testa SELECT 1, sem saber se seed/workers iniciaram.

**Impacto:** processo pode parecer saudável com banco acessível, mas sem workers ou configuração inicial válida; supervisor não reinicia automaticamente.

**Correção:** inicializar antes de aceitar tráfego ou readiness baseada no estado de boot; encerrar com código não zero em falha irrecuperável. Shutdown também deve aguardar jobs em execução antes de desconectar Prisma.

### 29 — P2: scan de segredos tem cobertura restrita e imprime linha sensível

**Evidência:** `scripts/secret-scan.js:18`, `:42`, `:74`. Não percorre frontend, histórico, YAML/JSON fora do escopo; quando encontra padrão, imprime até 120 caracteres da linha.

**Impacto:** falso senso de cobertura e possibilidade de registrar credencial em log de execução/CI. Nesta execução não houve ocorrência nem exposição pelo script.

**Correção:** scanner de segredos com histórico e formatos completos, allowlist revisável e saída sempre mascarada.

### 30 — P2: endurecimento adicional de WebSocket e uploads

**Evidência estática:** `src/config/socket.js:55` configura CORS, mas não valida Origin explicitamente no upgrade; `app.js:160` permite upload de usuário autenticado sem checar empresa ativa. Rate limits HTTP são por IP; sockets não têm limite explícito de conexões por usuário.

**Impacto:** superfícies de abuso e inconsistência após suspensão. Cookie SameSite Strict reduz ataques entre sites, mas não prova que toda origem do mesmo site seja confiável. Não foi reproduzido hijacking.

**Correção:** allowlist de Origin no handshake, limite de conexões, estado de empresa e quota por tenant para uploads. Seguir [OWASP WebSocket Security](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html).

### 31 — P3: erro confirmado de lint no frontend

**Evidência executada:** `frontend/src/pages/Team.tsx:69`, variável `_user` não utilizada. Build passa, lint falha.

**Correção:** remover variável ou utilizá-la conforme a intenção; pipeline deve executar lint e build separadamente e falhar no lint.

### 32 — P3: estados de erro e reconexão da interface incompletos

**Evidência estática:** `frontend/src/pages/Billing.tsx` registra erro no console e pode apresentar lista vazia como se carregada; `frontend/src/hooks/useSocket.ts` não trata connect_error nem sincroniza dados explicitamente ao reconectar; `frontend/src/stores/authStore.ts` desiste de autenticar se `crm_user` foi apagado mesmo com cookie válido, e trata qualquer erro de /me como logout.

**Impacto:** falha temporária parece ausência de dados ou perda de sessão; eventos perdidos na desconexão podem deixar estado antigo até novo fetch.

**Correção:** estados visíveis de erro/retry, ressincronização na reconexão, distinguir 401 de indisponibilidade e consultar /me independentemente do marcador local.

### 33 — P1: exclusão de empresa deixa conexões e arquivos persistentes

**Evidência estática:** `src/controllers/superadminController.js`, `deleteCompany`, faz apenas `prisma.company.delete`. Não encerra sockets do painel, conexões WhatsApp ou remove diretórios de credenciais e uploads da empresa.

**Impacto:** cascatas do banco não limpam volumes nem conexões em memória. Sockets do painel já autenticados continuam vivos até expiração e a sessão WhatsApp pode continuar conectada, tentando processar eventos para uma empresa inexistente.

**Correção:** rotina de desativação e exclusão coordenada: encerrar conexões, impedir reconexão, excluir dados relacionais e enfileirar limpeza dos arquivos com rastreamento de falhas.

### 34 — P2: migração de limpeza finaliza conversas por critério amplo

**Evidência estática:** `prisma/migrations/20261001000100_cleanup_duplicate_leads/migration.sql` finaliza qualquer conversa em interesse quando existe outra do mesmo telefone e empresa em instância com usuário vinculado. Não exige que a outra esteja ativa, seja posterior ou represente o mesmo atendimento.

**Impacto:** pode encerrar atendimento legítimo apenas por histórico do mesmo telefone. Altera status e prazo sem registrar métrica de conclusão ou auditoria da decisão.

**Correção:** executar SELECT de prévia e revisão em cópia do banco; restringir critério e registrar IDs/estados anteriores para restauração. Não aplicar automaticamente sem avaliar os dados atingidos.

## Lista do que falta ou precisa ser comprovado

Itens abaixo são lacunas identificadas nos arquivos disponíveis ou verificações não executadas. Ausência no repositório não comprova ausência na infraestrutura externa.

### Segurança e dados

- [ ] Centralizar autorização por tenant, setor, instância, dono e estado da empresa.
- [ ] Remover identidade/autorização derivada de telefone não verificado.
- [ ] Implementar retomada segura de checkout e reserva de identidade.
- [ ] Testar revogação de acesso com socket aberto e logout.
- [ ] Revisar FK compostas por tenant; categorias também aceitam `printer_id` sem validar empresa.
- [ ] Validar conteúdo real de arquivos, quotas e descarte de órfãos, incluindo entrada WhatsApp.
- [ ] Completar anonimização e retenção de JID, mídias, notas, respostas de fluxos e agendamentos.
- [ ] Definir retenção de logs com dados de clientes; a transcrição copia parte do áudio para log operacional.
- [ ] Revisar recuperação de senha: alteração de e-mail não exige confirmação de senha ou verificação de endereço; implementar quando necessária à política de conta.
- [ ] Avaliar MFA para superadmin/admin e proteção por conta além de IP.
- [ ] Finalizar migração de criptografia legada: `decrypt` ainda aceita CBC e texto sem prefixo; executar dry-run/migração em ambiente controlado antes de remover suporte.
- [ ] Executar scanner de segredos completo e auditá-lo para não imprimir valores.

### Cobrança

- [ ] Criar fluxo de renovação acessível após expiração, incluindo checkout de fatura sem URL.
- [ ] Reconciliar pagamentos pendentes sem depender do navegador.
- [ ] Persistir todas as tentativas, impedir reescrita de cobrança paga e tratar aprovação fora de ordem.
- [ ] Tornar criação de assinatura atômica e impedir duplicatas concorrentes.
- [ ] Definir política para cancelamento, estorno, chargeback e pagamento duplicado. Hoje `confirmPayment` trata approved/rejected; cobranças pagas deixam de ser consultadas por polling.
- [ ] Definir calendário mensal e preservar saldo de período pago.
- [ ] Validar parcelas, token, método e identificação com tipos/limites antes de chamar o SDK.
- [ ] Usar representação monetária exata em schema e cálculos.
- [ ] Testar todos esses cenários com sandbox de pagamento e PostgreSQL, sem cartão real.

### WhatsApp, IA e atendimento

- [ ] Corrigir fila de agendamentos com tentativas, confirmação e recuperação após restart.
- [ ] Tornar vínculo e número de envio explícitos, sem fallback silencioso.
- [ ] Serializar inicialização da conexão; aplicar backoff nas reconexões.
- [ ] Testar reconexão, mensagens duplicadas e idempotência de IDs em diferentes instâncias. `getMessage` busca apenas ID da mensagem, sem restringir instância/tenant.
- [ ] Validar confirmação de atendimento por comando/lead específico e corrigir prazo do rodízio.
- [ ] Versionar fluxos publicados e garantir exclusividade sob concorrência.
- [ ] Definir limite de custo/con­corrência para IA e transcrição por tenant, com observabilidade.
- [ ] Testar comportamento de resposta de IA concorrente com intervenção humana; garantir envio/registro coerentes quando WhatsApp cai.
- [ ] Definir como tratar mensagens temporárias/view-once: o código as desempacota e persiste; documentar essa escolha de retenção.
- [ ] Executar smoke externo de WhatsApp e IA somente em ambiente de teste autorizado; não executado nesta auditoria.

### Frontend e produto

- [ ] Corrigir lint e incluir testes de interface/end-to-end; não há suite de testes do frontend nos scripts disponíveis.
- [ ] Oferecer renovação, pagamento e cancelamento na tela de faturamento.
- [ ] Expor agendamento no painel, se parte do produto desejado: documentação atual anuncia apenas API.
- [ ] Expor exportação/anonimização/exclusão de privacidade no painel, se necessário ao operador; hoje existem endpoints.
- [ ] Melhorar edição de setor na gestão de equipe: já existe via `prompt`; usar controle com opções válidas e feedback consistente.
- [ ] Mostrar falhas de carregamento e envio com retry e estado de entrega.
- [ ] Ressincronizar após reconexão e corrigir diferenças entre acesso de lista/detalhe/mídia.
- [ ] Implementar paginação e busca no servidor para históricos grandes.
- [ ] Fazer QA de acessibilidade: labels associados a inputs, navegação por teclado, foco, contraste e leitura de erros; sem avaliação visual nesta auditoria.
- [ ] Validar responsividade de chat, Kanban, editor de fluxo e tabelas com dispositivos reais.
- [ ] Revisar código legado de delivery (orders, printers, variants/addons e funções de catálogo desativadas), planejando migração de dados antes de remover.

### Banco, testes e operação

- [ ] Testar migração de banco vazio e atualização de banco com dados antigos; verificar efeitos da migração `20261001000100_cleanup_duplicate_leads` antes de produção.
- [ ] Testar rollback das operações e concorrência com PostgreSQL real; mocks atuais não garantem esses comportamentos.
- [ ] Criar CI com teste, sintaxe, lint, build, validação Prisma, scanner e audit. Não foi encontrado workflow versionado no inventário.
- [ ] Executar teste de carga e revisar índices compostos com EXPLAIN. Histórico por chat/timestamp, logs por empresa/data e filtros de chat merecem medição.
- [ ] Definir liveness/readiness e alertas para workers parados, fila atrasada, pagamento não conciliado e WhatsApp desconectado.
- [ ] Automatizar backup de PostgreSQL e volumes, criptografia de backups, retenção e **teste de restauração**. README recomenda backup, sem rotina versionada identificada.
- [ ] Documentar RPO/RTO, recuperação de credenciais WhatsApp e rotação de segredos.
- [ ] Validar build Docker e imagem final; audit npm não analisa pacotes do SO.
- [ ] Validar Compose/Swarm com Traefik e rede externa; no exemplo não há porta publicada, portanto curl ao host na porta 3009 não funciona automaticamente.
- [ ] Acrescentar readiness do banco, limites de CPU/memória/disco e estratégia para falhas no boot.
- [ ] Reduzir privilégio do usuário de banco para operação e separar credencial de migração: Compose usa `postgres` na aplicação.
- [ ] Definir autenticação/ACL e proteção dos volumes de sessões WhatsApp; a criptografia de settings não cifra esses arquivos automaticamente.
- [ ] Fixar estratégia de versão/imagem e atualização; evitar depender exclusivamente de `connect-app:latest` no Swarm.
- [ ] Manter uma réplica enquanto o estado de conexão/filas permanecer em memória; escalar exige coordenação distribuída e estratégia para sessões WhatsApp.

## Ordem sugerida de execução

1. **Conter acesso indevido:** achados 01–04; adicionar regressões de autorização e revogação.
2. **Proteger receita e onboarding:** achados 02 e 05–09; pagamentos como tentativas persistentes e renovação completa.
3. **Garantir entrega e privacidade:** achados 10–14, 17 e 19; fila recuperável, anonimização e limpeza de mídia.
4. **Eliminar inconsistências:** achados 15–18 e 20–27, com testes integrados.
5. **Operação e experiência:** achados 28–32, CI, observabilidade, backup/restauração e QA de interface.

Cada correção deve ter critério de aceite ligado ao cenário do achado. Um novo ciclo de revisão deve executar os testes existentes e os novos casos integrados, sem considerar apenas build ou npm audit como aprovação de produção.
