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

## Validação

- 17 testes unitários/HTTP aprovados, incluindo isolamento, bloqueio de atribuição indevida, concorrência simulada na venda, validação de valores e proteção de mídia.
- Verificação sintática de todos os JavaScripts e smoke test de segurança aprovados.
- Prisma validado e cliente gerado.
- Build React/TypeScript aprovado. O bundler ainda avisa sobre um pacote JavaScript maior que 500 kB.
- Varredura local de segredos sem ocorrências. `.env`, sessões, uploads, caches e dependências não são incluídos no commit.

Os testes HTTP usam um substituto em memória do banco. A migração e o fluxo completo com PostgreSQL precisam ser verificados no ambiente de implantação; não foram aplicados ao banco de produção nesta tarefa.

## Implantação

Fazer backup e executar o fluxo normal de implantação da master, incluindo `prisma migrate deploy` para `20260927000100_store_sales` e o build do frontend. Não aplicar a migração da branch antiga (`20260927000100_store_crm`): ela foi substituída pela migração compatível com o catálogo atual.

Melhorias futuras: paginação dos produtos/conversas, cancelamento ou devolução com trilha de auditoria, testes transacionais com PostgreSQL e divisão do bundle React. Revisar e revogar credenciais que tenham sido expostas em versões antigas; remover código não revoga chaves existentes.
