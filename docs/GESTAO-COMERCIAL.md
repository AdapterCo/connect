# Gestão Comercial — utilização e implantação

Esta implementação entrega as oito funções propostas: vínculo entre lead/chats/venda, qualificação persistente, reserva temporária, Web Push e SLA, motivos de perda e tarefas, respostas compartilhadas, recebíveis/comissões/margem e pós-venda.

## Usar no painel

1. Abra **Gestão Comercial → Leads**. Conversas elegíveis são relacionadas pelo telefone normalizado, dentro da empresa. Também é possível cadastrar um lead manualmente.
2. Edite aparelho, variação e forma de pagamento. Esses campos são a memória comercial da IA; o histórico de mensagens da loja continua restrito aos gestores.
3. Em **Produtos e vendas**, abra **Reservar / vender**, selecione o lead e reserve por 5 a 120 minutos. Reservas ativas retiram a unidade das opções disponíveis para a IA. A expiração libera sua disponibilidade sem depender de um job de limpeza.
4. Confirme a venda, informando vencimento e garantia quando aplicáveis. A venda grava valores e comissão do momento da operação, vincula o lead e conclui tarefas de retorno pendentes. Venda presencial sem lead ainda é permitida.
5. Em **Gestão Comercial → Recebíveis e comissões**, registre o dinheiro efetivamente recebido. Gestores podem registrar recebimentos e estornos. Vendedores consultam suas vendas e comissões, sem custo de aquisição ou margem.
6. Em **Retornos**, crie tarefas com data e hora e marque sua conclusão. Marcar um lead perdido exige motivo, encerra tarefas pendentes e libera reservas. Se houver interesse explícito novamente, a qualificação pode reabrir o lead.
7. Em **Pós-venda**, registre garantia, suporte ou solicitação de devolução. Gestores podem aprovar devoluções; o item fica aguardando revisão, sem voltar automaticamente ao estoque. Reembolso bancário não é executado: registre o estorno efetivo no histórico financeiro.
8. Gestores mantêm a biblioteca em **Respostas compartilhadas**. A equipe utiliza essa biblioteca no chat pelo seletor ou filtro `/`. As respostas pessoais existentes continuam disponíveis.

## Regras financeiras

- Entrada preenchida no produto não representa recebimento confirmado.
- Saldo a receber = total da venda menos recebimentos líquidos. Um lançamento não pode superar o saldo; um estorno não pode superar o recebido.
- Os lançamentos têm chave de idempotência para evitar repetição em novas tentativas da mesma operação. Não há edição ou exclusão do histórico financeiro pela interface.
- Comissão contratada = valor vendido × percentual configurado pelo gestor no produto. Comissão proporcional = comissão contratada × fração efetivamente recebida.
- Devoluções deixam de gerar comissão; valores recebidos aparecem como montante a reembolsar.
- Margem apresentada = valor vendido − custo informado − comissão contratada. Sem custo informado, a margem fica desconhecida. Impostos e outras despesas não são inferidos.
- Percentual/custo/fornecedor são editáveis apenas por gestores. Dados da venda são fotografados na conclusão e não mudam com alterações posteriores no produto.
- Não há emissão automática de boleto/Pix para aparelhos, conciliação bancária ou pagamento automático de comissão. Estas operações exigem integração adicional. A assinatura da plataforma mantém seu módulo próprio.

## Alertas

Use **Ativar som e notificações**. Push exige HTTPS, suporte do navegador e permissão do usuário. Os alertas não contêm mensagens do cliente; apontam para Gestão Comercial, que exige sessão válida.

Há alertas de atribuição, resposta na conexão particular, tarefa vencida e aproximação do prazo de captura. Push pode funcionar com o painel fechado, sujeito às configurações do navegador/sistema operacional. A entrega externa não foi homologada nesta alteração.

Fechar o painel continua sujeito à regra de presença existente: após a tolerância de desconexão, o vendedor deixa de estar online. Push não transforma um vendedor offline em elegível para novos leads.

As chaves VAPID são geradas uma vez e persistidas no banco; a chave privada é cifrada com `ENCRYPTION_KEY`. Preserve banco e chave de cifragem nas restaurações. É possível sobrescrever com `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` no ambiente da aplicação. Nunca registre a chave privada no Git.

A implementação segue as APIs do [web-push](https://github.com/web-push-libs/web-push) e do [PushManager](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe).

## Isolamento e registros existentes

- O vendedor consulta somente leads atribuídos a ele e vendas de sua responsabilidade. O vínculo comercial não autoriza abrir o chat da loja.
- A consulta de chats relacionados aplica o escopo de conexão existente; nenhum histórico da loja é retornado no resumo comercial.
- O registro de lead contém campos comerciais permitidos, sem contexto bruto da conversa.
- Não se usa um LID não resolvido como telefone para criar o vínculo comercial.
- O indicador de conversão considera leads acessíveis com venda vinculada e não devolvida. Ele consulta os registros completos, independentemente do limite de 200 itens das listas e sem contar chats finalizados como vendas.
- O relacionamento inicial de chats antigos é limitado a 100 por consulta, processado gradualmente. Listas de Gestão Comercial mostram até 200 registros; somatórios financeiros descrevem os registros exibidos no período.
- Vendas antigas válidas recebem um registro financeiro inicial durante a migration. Não são inventados clientes, custos, recebimentos ou comissões anteriores. Produtos antigos com dados comerciais incompletos exigem revisão administrativa.
- A entidade de lead é compartilhada por telefone dentro da empresa. Compras recorrentes podem ser feitas reabrindo o lead; não há ainda múltiplas oportunidades independentes simultâneas para o mesmo telefone.

## Implantação

A migration nova é `20261003000100_commercial_crm`. Ela acrescenta tabelas e campos, mantém históricos e usa uma transação para impedir aplicação parcial. Não altera arquivos das migrations antigas.

Antes de atualizar, faça backup do banco. Se houver alterações locais no servidor, preserve-as e resolva a divergência antes do `git pull`; o erro anterior de arquivos locais não é corrigido descartando-os silenciosamente.

Com a árvore do servidor pronta para atualização:

```sh
git pull --ff-only
docker compose up -d --build
docker compose logs app --tail 80
```

O container gera o Prisma Client durante o build e executa `prisma migrate deploy` antes de iniciar o servidor. Uma migration anterior marcada como falha ainda precisa ser resolvida pelo diagnóstico apropriado; não marque migrations como aplicadas sem conferir o estado do banco.

## Validação

Foram acrescentados testes HTTP de autorização, reserva, venda concorrente, idempotência, saldo, devolução, tarefas e biblioteca, além de casos de correção e persistência da qualificação.

Na validação desta entrega passaram 156 testes da suíte principal e 5 testes SQL separados. Também passaram lint, build do frontend, validação do schema e verificação de sintaxe JavaScript.

A cadeia SQL de migrations e constraints comerciais é verificada em um PostgreSQL isolado via [PGlite](https://pglite.dev/docs/). Isso valida SQL e integridade; não reproduz a concorrência de várias conexões do PostgreSQL 14 de produção nem o deployment do Docker.

```sh
npm test
npm run check:all-js
npx prisma validate
npm run lint --prefix frontend
npm run build --prefix frontend
```

O teste SQL separado usa uma dependência temporária fora do runtime:

```sh
npm install --prefix scratch/migration-qa @electric-sql/pglite --ignore-scripts
node --test tests/integration/commercial-migrations.test.js
```

Após implantar, homologue atribuição/captura com WhatsApp real, reserva e venda com duas sessões, alertas no navegador e uma venda com recebimento parcial, devolução e estorno.
