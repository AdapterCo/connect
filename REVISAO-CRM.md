# CRM de loja integrado à master

As alterações foram adaptadas à arquitetura atual da master (React, catálogo existente e histórico completo de migrações). Esta versão substitui a proposta feita anteriormente sobre a cópia local antiga.

## Funcionamento

- A tela **Produtos e vendas** substitui o catálogo de delivery na navegação. Usa os produtos já cadastrados e acrescenta vendedor, Dinheiro/Pix/Cartão/Boleto, entrada em reais, Chassi/IMEI, cor, memória opcional e estado da moto/aparelho.
- Produtos antigos continuam cadastrados. Admin/supervisor devem completar os campos e atribuir um vendedor antes de registrar a venda.
- Cada produto representa uma unidade física. O registro explícito da venda grava a data, retira a unidade do catálogo ativo e impede venda duplicada ou edição posterior.
- Métricas: quantidade de vendas, valor vendido, ticket médio e entradas, por vendedor e período. Datas usam horário de Brasília. Entrada faz parte do valor vendido; não é receita adicional.
- Vendedor acessa somente seus produtos, vendas, métricas e conversas atribuídas. Admin e supervisor acessam os dados da empresa. Os nomes dos vendedores da empresa ficam disponíveis no dropdown; vendedores comuns ficam fixados na própria conta.
- Recebimentos/MP da loja, catálogo público, pedidos de delivery e geração automática de cobranças/pedidos pela IA ficam desativados. As estruturas históricas são preservadas. O faturamento da assinatura da plataforma, já existente na master, permanece separado do registro de vendas da loja.

## Segurança preservada e reforçada

Mantidos Helmet, validadores, limites de requisições, revogação de sessões, criptografia e identificação de conversas por instância/JID da master. A autenticação passa a usar o perfil atual do banco; os sockets validam a sessão e filtram conversas e eventos. Relatórios gerais exigem perfil de gestão. As chaves de IA deixam de voltar ao navegador e campos vazios preservam as chaves já salvas.

Anexos exigem autenticação e vínculo com o usuário/conversa; caminhos arbitrários são rejeitados. Fazer login novamente após a implantação para receber o cookie HttpOnly de mídia. Vendedores com produtos vinculados não podem ser excluídos. Valores e identificadores são validados no servidor; a migração acrescenta restrições de integridade e não recria tabelas existentes.

## Kanban pessoal e rodízio de vendedores

Cada usuário pode criar, renomear e excluir suas próprias colunas (até 50). As etapas **Iniciada / Novo**, **Interesse em Compra** e **Finalizada / Pago** são permanentes: nem admin ou supervisor podem alterá-las ou excluí-las. Excluir uma coluna pessoal preserva as conversas. Colunas pessoais organizam a visão do usuário; não mudam a etapa comercial compartilhada nem suspendem o rodízio.

Ao entrar em Interesse em Compra, o cliente é atribuído pelo rodízio aos usuários com perfil vendedor e status online da mesma empresa. Online corresponde ao status de disponibilidade do sistema, alterado no login, logout ou controle de disponibilidade; não é uma verificação de presença física. Admin e supervisor acompanham todas as conversas da empresa, mas não participam do rodízio.

O vendedor tem 60 segundos para responder. O serviço verifica vencimentos a cada 5 segundos e transfere ao próximo vendedor online, iniciando outro prazo. Apenas uma resposta enviada com sucesso pelo vendedor responsável interrompe a contagem; IA, notas, mensagens agendadas e respostas de gestores não contam. Novas mensagens do cliente reiniciam o prazo após uma resposta, mas não prorrogam um prazo já em curso. Uma resposta atrasada do responsável anterior não cancela o prazo do novo vendedor.

Sem outro vendedor online, o responsável permanece e a verificação é repetida após um minuto. Se não houver nenhum vendedor na entrada, o cliente aguarda sem responsável. Sair de Interesse, arquivar ou bloquear cancela a contagem. Transferências são auditadas e serializadas por empresa no banco. Ao mudar o responsável ou a etapa principal, as posições pessoais daquele cartão são limpas. O vendedor anterior recebe somente a remoção do cartão; o conteúdo fica disponível ao novo responsável e à gestão.

A integração WhatsApp continua usando Baileys, sem migração para a API oficial.

## Validação

- 34 testes unitários/HTTP aprovados, incluindo isolamento, colunas protegidas, rodízio, respostas humanas, concorrência simulada, métricas de atendimento, respostas atrasadas da IA e remoção de acesso via socket.
- Verificação sintática de todos os JavaScripts e smoke test de segurança aprovados.
- Prisma validado e cliente gerado.
- Build React/TypeScript aprovado. O bundler ainda avisa sobre um pacote JavaScript maior que 500 kB.
- Varredura local de segredos sem ocorrências. `.env`, sessões, uploads, caches e dependências não são incluídos no commit.

Os testes HTTP usam um substituto em memória do banco. A migração e o fluxo completo com PostgreSQL precisam ser verificados no ambiente de implantação; não foram aplicados ao banco de produção nesta tarefa.

## Implantação

Fazer backup e executar o fluxo normal de implantação da master, incluindo `prisma migrate deploy` para `20260927000100_store_sales` e o build do frontend. Não aplicar a migração da branch antiga (`20260927000100_store_crm`): ela foi substituída pela migração compatível com o catálogo atual.

O Kanban e o rodízio também exigem a migração `20260928000100_personal_kanban_rotation`, seguida da geração do cliente Prisma e reinicialização do backend. Conversas antigas não são transferidas pela migração: uma nova mensagem do cliente ou uma nova entrada em Interesse inicia o prazo. A migração ainda precisa ser aplicada e validada com PostgreSQL no ambiente de implantação.

Melhorias futuras: paginação dos produtos/conversas, cancelamento ou devolução com trilha de auditoria, testes transacionais com PostgreSQL e divisão do bundle React. Revisar e revogar credenciais que tenham sido expostas em versões antigas; remover código não revoga chaves existentes.
