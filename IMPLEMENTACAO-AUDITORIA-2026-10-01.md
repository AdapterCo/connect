# Implementação da auditoria — 01/10/2026

Esta implementação usa a auditoria `AUDITORIA-PROJETO-2026-10-01.md` (título “Auditoria do Adapter Connect — 01/10/2026”) e as alegações do Gemini conferidas no código. As alterações estão no workspace. Não houve commit, push, deploy, pagamento, chamada real de IA ou aplicação de migração no banco existente. **Resposta da IA em áudio (TTS) foi excluída por solicitação do usuário.**

## Resultado por achado da auditoria

“Implementado” descreve o código; não equivale a homologação de produção. Os testes unitários têm mocks. A integração PostgreSQL foi adicionada à CI, mas ainda não foi executada neste ambiente.

| Item | Mudança e situação |
| --- | --- |
| 01 | Implementado: acesso a instâncias só por vínculo explícito; telefone não concede acesso nem altera dono. Regressão adicionada. |
| 02 | Implementado: checkout novo não sobrescreve colisões; reserva parcial única na migração; pagamentos existentes não são apagados por expiração de cadastro. Retomada no mesmo navegador via ID aleatório em sessionStorage. Retomada entre dispositivos com segredo separado continua pendente. |
| 03 | Implementado: revogação de sockets ao alterar permissões/vínculo; revalidação periódica a cada 30s; frontend limpa estado e revalida sessão em desconexão pelo servidor. Homologar com múltiplas abas. |
| 04 | Implementado: empresa ativa no socket, entrada WhatsApp, IA, fluxos e agendamentos; suspensão encerra sockets e conexões WhatsApp. Após renovação pode ser necessário reconectar no painel. |
| 05 | Implementado: fatura de renovação, administrador com acesso ao faturamento após vencimento, geração/consulta de Pix no painel e nova assinatura após cancelamento. Homologar ciclo completo no sandbox. |
| 06 | Implementado: reconciliação de tentativas persistidas a cada minuto, independente do navegador. Ainda precisa de observabilidade e política de alertas operacionais. |
| 07 | Implementado: PaymentAttempt mantém cada referência, idempotência por cobrança/método/token, confirmação de tentativas anteriores e update condicional de cobranças pagas. Testar falha após a API criar pagamento e antes de salvar seu ID. |
| 08 | Implementado: criação de assinatura/fatura em transação com lock da empresa; índice parcial único para assinatura corrente. |
| 09 | Implementado: cancelamento conserva período pago; expiração trata cancelados e devolve estado atualizado. Assinatura cancelada antiga não suspende empresa com entitlement renovado. Política de pagamentos tardios, duplicados, estornos e chargebacks ainda precisa ser fechada. |
| 10 | Implementado: claim condicional, retries/backoff, recuperação após restart, estados pending/processing/sent/failed, registro após envio. Falha de notificação não recoloca envio confirmado na fila. Garantia é pelo menos uma tentativa; queda entre envio externo e commit pode duplicar envio. |
| 11 | Implementado: anonimização limpa JID, mensagens/notas, remetente, mídia, variáveis de fluxo, notas de pedidos e agendamentos. Histórico operacional de logs com identificadores ainda exige revisão específica. |
| 12 | Implementado: outbox MediaDeletion na mesma transação; limpeza após commit e preservação de referências compartilhadas; retenção enfileira arquivos. Retenção processa até 1.000 mensagens por execução; ajustar frequência/backlog à escala. |
| 13 | Implementado: download em stream limitado a 10 MB, áudio declarado até 300s, assinatura de conteúdo, nomes UUID e quota por empresa. |
| 14 | Implementado: validação por assinatura do conteúdo em uploads HTTP. Office valida container ZIP/OLE, sem análise completa do conteúdo interno; não há antivírus. |
| 15 | Implementado: regra central de tenant/setor/atribuição/instância em lista, detalhe, Kanban, mídia e socket. |
| 16 | Implementado: validação do tenant ao vincular usuário, validação de impressora da categoria e FK adicional Instance/User na migração. Revisão de todas as relações do schema permanece pendente. |
| 17 | Implementado: preserva conexão original do chat; removidos troca silenciosa para chip do vendedor e fallback para qualquer conexão. Envio desconectado retorna erro. Não há migração automática de atendimento para outro número. |
| 18 | Implementado: logout incrementa session_version e encerra sockets; revoga todas as sessões do usuário. |
| 19 | Implementado: confirmação explícita `CONFIRMAR <chat_id>` com vendedor, lead e prazo; Chat.update agora persiste sales_reply_due_at. Homologar no WhatsApp real. |
| 20 | Implementado: promessa reservada por instância antes do primeiro await; reconexão exponencial com jitter até cerca de 60s. |
| 21 | Implementado: snapshot do grafo na sessão; lock na criação/ativação; índice parcial para fluxo ativo único. Sessões antigas recebem snapshot do grafo disponível no momento da migração. |
| 22 | Implementado: timeout na API de pagamento/SDK e geração Gemini; transcrição limita tentativas a dois modelos e uma operação simultânea por empresa. Timeout não garante cancelamento de todo trabalho remoto. |
| 23 | Parcial: histórico HTTP paginado em 50 com cursor timestamp/ID, eventos incrementais e payload limitado, relatórios agregados no PostgreSQL. Lista de chats/produtos e algumas leituras internas ainda precisam de paginação; testar carga/EXPLAIN. |
| 24 | Implementado: limites de usuários, instâncias e fluxos protegidos por lock de empresa na criação. Teste concorrente PostgreSQL preparado. |
| 25 | Implementado: erros de exclusão propagados em modelos de chat/instância/agendamento; mídia excluída via outbox. Cancelar agendamento em processamento retorna conflito. Homologar falhas e concorrência na exclusão de instâncias. |
| 26 | Implementado: Decimal(12,2) para cobrança, comparação em centavos, mês com clamp UTC e preservação de período pago. Migração necessária. |
| 27 | Parcial: regressões adicionais e integração PostgreSQL para tenant, rollback, claims, limites e métricas; mocks continuam sem semântica completa de Prisma e sem rollback real. |
| 28 | Implementado: inicialização antes de HTTP, exit não zero em falha, shutdown aguarda jobs em andamento com timeout geral. Health continua consultando banco; alertas de workers não foram implementados. |
| 29 | Implementado: scanner inclui arquivos rastreados, frontend, CI, formatos adicionais e histórico opcional; saída oculta valores. **Histórico revelou tokens com formato real: exige revogação/rotação externa.** Scanner é heurístico. |
| 30 | Implementado: Origin no handshake, até 10 sockets por usuário, empresa ativa em upload/arquivos e quota por tenant. Limites por memória pressupõem uma réplica. |
| 31 | Implementado: lint corrigido e incluído na CI. |
| 32 | Implementado: erro/retry no faturamento, ressincronização do socket, consulta /me sem marcador local e distinção entre sessão inválida e indisponibilidade. Testes de interface reais permanecem pendentes. |
| 33 | Implementado: encerra sockets/WhatsApp, remove sessões e enfileira mídia ao excluir empresa. Limpeza de órfãos trata uploads antigos sem referência. Homologar interrupção no meio dessa operação. |
| 34 | Pendente de dados: migração histórica destrutiva não foi reescrita. `docs/audit-preflight.sql` oferece SELECT de prévia. Restauração de chats já finalizados por ela depende de backup/estados anteriores; não se pode inferir a intenção pelo telefone. |

## Sugestões do Gemini

- Rodízio, visibilidade Kanban, isolamento de instâncias e polling: corrigidos. O alerta de IDOR genérico desconsiderava ownChat; a regra foi centralizada para evitar divergências.
- Conectar/desconectar chip continua autorizado somente a gestores, conforme a política existente; isso não foi tratado como vulnerabilidade.
- Mantido índice global `[status, sales_reply_due_at]`, adequado ao worker global. Acrescentados índices chat/timestamp e empresa/timestamp para mensagens e logs. Não foi acrescentado o índice tenant-first sem medir uso.
- Limites de áudio e reconexão com backoff: implementados.
- TTS: excluído a pedido do usuário.
- Visão: imagens JPEG/PNG/WebP até 5 MB podem ser descritas usando a chave Gemini já configurada na empresa, se `VISION_ENABLED=true`. Padrão desativado, saída até 512 tokens, timeout e concorrência de uma análise por empresa. Fotos de comprovantes não são tratadas como confirmação de pagamento. Vídeo não foi implementado. Testes usam SDK simulado.
- Alertas: som e notificação do navegador mediante ativação pelo usuário. **Não é Web Push com service worker**; não funciona com o painel fechado.
- Respostas prontas: salvas por usuário/empresa no navegador, seleção no composer e filtragem quando digita `/`. Não há compartilhamento entre navegadores nem catálogo central de templates.
- Kanban: filtros por tag, responsável e datas no quadro carregado.
- Transferência: motivo opcional em nota interna; ainda usa prompt simples, sem modal elaborado.
- Relatórios: CSV de indicadores, percentual de finalização e atendentes, com proteção contra fórmulas de planilha. Percentual de finalização não é conversão comercial de vendas. PDF não foi implementado.
- Agendamentos: criação, consulta de estado e cancelamento no painel. Privacidade: exportação JSON, anonimização e exclusão com confirmação.

## Validação executada

- `npm.cmd test`: **92 testes passaram**. Incluem regressões de autorização, checkout, logout, datas, arquivo falsificado, fila, anonimização, exclusão e expiração, além de visão simulada.
- `npm.cmd run check:all-js`: sintaxe válida nos 84 arquivos verificados.
- `npm.cmd run security:smoke`: passou.
- Prisma validate: passou. Client gerado no workspace.
- Frontend lint e build: passaram (verificação final de build registrada ao encerrar o trabalho).
- `npm.cmd audit --json`: zero vulnerabilidades reportadas nos dois projetos. A primeira tentativa falhou por rede; consulta posterior concluída.
- Scanner atual: 174 arquivos, sem ocorrência no conteúdo atual. Histórico: seis correspondências de padrões em dois commits; padrões sobrepostos podem apontar para o mesmo token. **Scan histórico falha intencionalmente e a CI continuará acusando esse problema.**
- Integração PostgreSQL, migração real, Docker, navegador, múltiplas abas, dispositivos móveis e provedores externos não foram homologados aqui. Não há Docker/psql disponível neste ambiente. A CI contém PostgreSQL isolado para executar os testes preparados; o workflow ainda não foi executado no GitHub.

## Pendências para implantação

1. Revogar/rotacionar no Mercado Pago as credenciais expostas nos commits `e240baf7b67cd612c4d8f5474f4a8a4ef0f1fa33` e `dcd49a37bbe6e6ee26f3feaab3003c33dafd1580`. Os locais são `.env.example` e um documento histórico removido. Não tente validar esses tokens com pagamentos reais. Após confirmação de revogação, decidir limpeza coordenada do histórico ou allowlist estrita revisada; nenhuma reescrita foi feita.
2. Fazer backup de banco e volumes e comprovar restauração. Rodar `docs/audit-preflight.sql` em cópia do banco. Resolver vínculos cruzados e duplicatas de checkout/assinatura/fluxo antes da nova migração, sem apagar cobranças indiscriminadamente.
3. Conferir se `20261001000100_cleanup_duplicate_leads` já foi aplicada. `migrate deploy` executa todas as migrações pendentes, inclusive essa limpeza antiga; **não executá-lo cegamente num banco com atendimentos existentes**. Homologar em cópia, revisar IDs e preservar estados anteriores. Depois disso, aplicar `20261001000200_audit_hardening` e gerar Prisma Client antes de iniciar esta versão. A migração nova é transacional. FK e índices parciais adicionais são SQL explícito e devem ser preservados em migrações futuras.
4. Executar CI e os testes PostgreSQL preparados. O teste exige `TEST_DATABASE_URL` de banco isolado cujo nome contenha `test`; não reutiliza a URL de produção automaticamente. Testar primeiro a cadeia de migrações em banco vazio e depois em cópia de dados antigos.
5. Homologar Pix, pagamento fora de ordem, concorrência/duplicidade e renovação no sandbox; definir estorno/chargeback, pagamento duplicado e cancelamento com pagamento em andamento. Hoje esses estados são persistidos na tentativa, mas não têm política automática completa para entitlement/reembolso.
6. Homologar pareamento/reconexão, resposta de vendedor, timeout e confirmação por comando, falha de envio, fila após restart e revogação com abas abertas. As mudanças foram testadas sem conectar WhatsApp real.
7. Configurar `MEDIA_QUOTA_MB` (padrão 1024), retenção e capacidade de disco. Limpeza de órfãos tem carência de 24h e roda diariamente. Quota consulta arquivos e referências e pressupõe uma réplica; arquivos legados sem dono/referência não podem ser atribuídos com precisão a tenant. Validar uploads Office com política de antivírus se necessários.
8. Escolher retenção de logs e variáveis, orçamento global de IA e a política para mensagens temporárias/view-once. O comportamento anterior de desempacotar/persistir temporárias foi mantido. Configurar `VISION_ENABLED=true` somente após homologar dados/imagens e a conta Gemini já existente.
9. Completar QA visual/acessibilidade/E2E, paginação de listagens, alertas de workers, teste de carga, backups automáticos, restauração, RPO/RTO, usuário de banco com menor privilégio, proteção de volumes, versão de imagem e validação Docker/Traefik. MFA e verificação de e-mail/recuperação são melhorias de conta ainda pendentes, não implementadas nesta rodada.

A implementação reduz os problemas confirmados, mas os itens parciais e dependências operacionais acima continuam abertos. Este documento complementa o relatório original; não muda retroativamente os resultados daquela auditoria.

## Ajuste solicitado em 02/10/2026

Conforme a orientacao final do usuario, pedidos de atendimento humano ou interesse em compra acionam o rodizio mantendo a IA ativa. A conexao de origem permanece preservada. Sem vendedor online, o atendimento fica em interesse em compra com prazo para nova tentativa do worker; a confirmacao ao cliente informa a espera. O repasse e persistido antes do envio da confirmacao pelo WhatsApp. Conversas finalizadas, bloqueadas, arquivadas ou cuja IA foi pausada manualmente durante a chamada nao sao reabertas por resposta atrasada.

A IA recebe o estado atual de encaminhamento para continuar respondendo duvidas gerais. Pedidos repetidos de transferencia ou compra informam que o atendimento ja esta encaminhado ou na fila, sem trocar vendedor, reiniciar prazo ou duplicar notas de repasse. A classificacao da mensagem atual e separada da etapa persistida, permitindo responder outras duvidas sem remover o lead do interesse. Novas mensagens apos resposta humana nao reiniciam o rodizio. Transferencias pelo fluxo tambem preservam a IA ativa.

A opcao Excluir dados do cliente foi retirada do painel e as rotas de exclusao direta de conversa e de privacidade retornam 403 para todos os perfis. Exportacao, anonimizacao, arquivamento, etiquetas, agendamentos e demais recursos permanecem. Nao foi encontrada opcao/rota de exclusao individual de mensagens. Retencao automatica e exclusao administrativa de empresa/conexao continuam conforme a configuracao existente.

Validacao: 98 testes passaram, sintaxe backend valida; lint e build frontend passaram na verificacao anterior, sem nova alteracao frontend nesta revisao. Conversas que ja ficaram com IA desativada na versao anterior precisam ter a IA reativada pelo painel; nao foi feita alteracao automatica desses dados existentes para preservar pausas manuais. Alteracoes locais, sem deploy ou teste com WhatsApp real.
