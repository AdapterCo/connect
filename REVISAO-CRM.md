# Revisão e adaptação do CRM — 27/09/2026

## Fluxo da loja

A aba **Produtos e vendas** cadastra uma unidade física por Chassi/IMEI, com nome, vendedor, valor, forma de pagamento (Dinheiro, Pix, Cartão, Boleto), entrada em reais, cor, memória opcional e estado (Novo, Usado, Recondicionado).

O cadastro começa em estoque. **Registrar venda** confirma a venda, grava a data e alimenta quantidade, total vendido, ticket médio e entradas por vendedor. Os filtros usam dias inclusivos no horário de Brasília. Entrada não é somada novamente ao total vendido; não há conciliação, cobrança ou controle de recebíveis.

Vendedores consultam e alteram somente seus próprios produtos e consultam somente suas próprias métricas. Admin e supervisor acessam os dados da própria empresa. O dropdown contém os vendedores da empresa; para o vendedor comum, a seleção fica fixada nele próprio. Suporte e outros perfis não acessam o módulo de vendas. Produtos vendidos ficam bloqueados para edição e não podem ser vendidos novamente. Vendedores com produtos vinculados não podem ser excluídos, preservando o histórico.

Recebimentos/MP, endpoints, serviço, dependência, verificação periódica e geração automática de cobranças foram retirados. Colunas históricas foram preservadas para não destruir registros antigos; a migração desativa a integração nas empresas existentes.

## Correções da revisão

- Configurações, relatórios gerais, logs e conexões WhatsApp exigem perfil de gestão no servidor.
- Autenticação consulta a conta atual; não confia no perfil antigo do JWT e rejeita contas excluídas. Sockets filtram conversas por responsável e não entregam logs ou QR de conexão a vendedores.
- Listagem de usuários e eventos não expõem hashes de senha. As chaves de IA não são devolvidas ao navegador; deixar o campo vazio preserva a chave já configurada.
- Removidos credenciais de provedores e administrador com senha fixa do código de inicialização. Removida a consulta de configurações de outra empresa como fallback.
- Anexos exigem autenticação e vínculo com o usuário/conversa; uploads limitados a 20 MB e tipos permitidos. Caminhos arbitrários e URLs externas são rejeitados no envio e agendamento.
- Corrigidos pontos de injeção de HTML em nomes, tags, mensagens de aviso e mídias, além de escape de células na exportação CSV.
- Implementado limite de tentativas no login/cadastro de empresa; novas senhas têm mínimo de 12 caracteres. Segredos de configuração deixam de ter fallback conhecido.
- Docker deixa de embutir `.env`, sessões WhatsApp, uploads e arquivos locais no build. A senha do PostgreSQL e os segredos vêm do ambiente; removida a publicação da porta do banco no Compose.
- O servidor falha na inicialização se o banco estiver indisponível, em vez de oferecer uma aplicação quebrada.
- Atualizadas dependências compatíveis: a auditoria inicial apontou 14 vulnerabilidades (8 altas, 6 moderadas); `npm audit fix --ignore-scripts` terminou com zero vulnerabilidades conhecidas. Duas consultas posteriores ao endpoint de auditoria falharam por acesso à rede, sem nova alteração de dependências.

## Validação e limites

- 17 testes automatizados aprovados: validação de valores, datas, perfis, isolamento por empresa/vendedor, anexos, atribuição indevida, duplicação de venda, métricas e conta removida.
- Testes HTTP usam o roteador Express real e um substituto em memória do Prisma. Eles não substituem testes transacionais com PostgreSQL.
- `prisma validate`, geração do cliente e verificação de sintaxe de todos os JavaScripts de produção aprovados.
- PostgreSQL configurado não acessível neste ambiente. A migração foi criada, mas **não aplicada**; o fluxo completo no navegador e a migração em banco real ainda precisam de validação.
- Durante a implementação, o diretório não tinha um checkout Git próprio. Ao conectar o remoto posteriormente, foi constatado que a `master` já contém uma arquitetura mais recente, com frontend React, catálogo, pedidos e outras migrações. Estas alterações da cópia local foram publicadas na branch `crm-loja-vendas-20260927`, baseada em `8ac9ce3`. A integração na `master` exige portar as mudanças para essa arquitetura, especialmente o cadastro de produtos e sua migração; não aplicar esta migração diretamente ao esquema mais recente.

## Antes de colocar em uso

1. Fazer backup do banco e disponibilizar PostgreSQL conforme `DATABASE_URL`.
2. Revogar e substituir as chaves de provedores que estavam embutidas no código antigo. Remover o código não revoga credenciais já expostas. Trocar a senha de qualquer administrador criado pelo seed antigo.
3. O `JWT_SECRET` local era curto e foi substituído por um segredo aleatório, sem exibi-lo. Ao reiniciar, os usuários precisam entrar novamente. Configurar também um segredo forte no ambiente de implantação. A chave de criptografia existente foi preservada: substituí-la diretamente pode impedir a leitura das chaves já salvas; uma rotação exige recriptografia.
4. Executar `npm ci`, `npx prisma generate`, `npx prisma migrate deploy` e `npm test`, então iniciar com `npm start`. No PowerShell com scripts bloqueados, usar `npm.cmd` e `npx.cmd`.
5. Acessar por HTTPS em produção e fazer login novamente para receber o cookie HttpOnly de acesso aos anexos. Validar cadastro, edição e venda com admin, supervisor e dois vendedores de empresas diferentes.

## Melhorias ainda necessárias

- **Identidade de conversas:** o modelo legado usa o JID do WhatsApp como chave global de Chat. O mesmo contato em empresas/instâncias diferentes pode colidir. Corrigir exige uma migração própria para ID interno e JID separado, com revisão de mensagens, métricas, agendamentos e envio WhatsApp.
- **Agendamentos:** a rotina antiga remove o agendamento mesmo após falha de envio e não possui reivindicação transacional para múltiplas réplicas. Adicionar fila, tentativas e idempotência antes de escalar esse serviço.
- **Paginação:** listagens de produtos e conversas ainda carregam todos os registros autorizados. Implementar paginação e busca para empresas com volume alto.
- **Auditoria comercial:** adicionar histórico de alterações e fluxo explícito de cancelamento/devolução. Nesta versão, vendas concluídas não são editáveis nem canceláveis.
- **Sessões e operação:** logout ainda não revoga todos os JWTs emitidos; adicionar sessões revogáveis e rate limit compartilhado se houver múltiplos servidores. Revisar a imagem Node 18 do Docker e testar uma versão suportada com Baileys antes de produção.
- **Cadastro público de empresa:** permanece disponível. Restringir a criação por convite caso a instalação seja exclusivamente interna.
- **Legado de IA:** revisar prompts já salvos pelas empresas; o prompt de execução agora orienta atendimento de loja sem cobranças nem promessas de entrega.

Esta revisão identifica e corrige problemas concretos do código; não é uma certificação de ausência de vulnerabilidades.
