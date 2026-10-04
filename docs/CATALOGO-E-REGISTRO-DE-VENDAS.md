# Catálogo e registro de vendas

O catálogo contém os modelos reutilizáveis (por exemplo, iPhone 15 e Moto X). A unidade física, seus detalhes e os valores efetivos pertencem à venda. Não é necessário recadastrar o modelo a cada operação.

## Uso

1. Admin ou supervisor cadastra o produto, tipo (celular/moto), preço sugerido e, opcionalmente, custo de referência e comissão. Pode editar ou inativar o modelo.
2. O vendedor abre **Produtos e vendas → Cadastrar venda**, escolhe o produto e o cliente. Seu nome é preenchido automaticamente; gestores podem escolher outro vendedor da empresa.
3. Informe valor efetivo, forma de pagamento, entrada, identificação, cor e estado. Celulares exigem IMEI com exatamente 15 dígitos e memória; motos exigem chassi/série e não usam memória. A validação ocorre na interface e no servidor.

O cadastro da venda não solicita vencimento nem data/hora de garantia. Essas informações também não são exibidas no resumo da venda. Dados antigos no banco são preservados.
4. **Salvar venda** registra a unidade e a venda na mesma transação, vincula o cliente e conclui suas tarefas pendentes. Um erro não deixa uma unidade avulsa. A identificação não pode ser reutilizada para vender novamente a mesma unidade.
5. Uma unidade antiga em estoque pode ser selecionada para aproveitar seus dados. Reservas de unidades existentes continuam disponíveis por 30 minutos na tela; as APIs mantêm a faixa de 5 a 120 minutos. A venda respeita a reserva ativa.

Clientes continuam obrigatórios. É possível cadastrá-los no formulário. Clientes com oportunidade encerrada precisam ser reabertos em Gestão Comercial para uma nova compra.

## Permissões

- Somente admin e supervisor cadastram/alteram o catálogo e consultam métricas, valores históricos, recebimentos e comissões.
- Vendedores selecionam modelos ativos compartilhados dentro da empresa e registram suas próprias vendas. Não veem a tabela de unidades vendidas nem recebem essas unidades na API de produtos.
- O pós-venda operacional mantém identificação e cliente, sem preço vendido, entrada, saldo, custo ou comissão. O preço sugerido do catálogo é uma referência para novas vendas, não um histórico de resultados.
- O cadastro comercial não libera acesso às mensagens da loja.
- O limite de produtos do plano e o uso mostrado na lateral contam modelos cadastrados, incluindo inativos; registrar uma nova venda não consome outro produto do plano.

## Dados antigos e IA

A migration `20261003000200_product_models` cria um modelo por nome exato dentro de cada empresa e vincula as unidades existentes sem alterar vendas ou lançamentos financeiros. Produtos antigos sem preço positivo permanecem preservados para revisão administrativa.

A classificação inicial identifica nomes contendo moto/Honda/Yamaha/Suzuki/Kawasaki/Bajaj como moto e os demais como celular. **Revise o tipo dos modelos importados**, especialmente motos com nomes apenas numéricos. O preço e custo de referência vêm do registro mais recente daquele nome. Identificadores antigos não são reescritos; celulares antigos em estoque exigem completar IMEI e memória antes da venda.

A IA recebe os modelos ativos como catálogo de referência e deve confirmar disponibilidade, unidade e valor final com o vendedor. Cadastrar um modelo não comprova estoque físico. Unidades históricas e modelos são entidades separadas.

## Atualizar

Faça backup do banco e resolva alterações locais antes de atualizar. Use `&&` para não reconstruir código antigo quando o pull falhar:

```bash
git pull --ff-only && docker compose up -d --build --force-recreate app
docker compose logs app --tail 80
```

O container aplica a migration e gera o Prisma Client no build. A migration anterior de Gestão Comercial continua necessária. Não há alteração em migrations antigas.

Validação: 165 testes da aplicação e 7 testes SQL passaram, além de lint, build, validação do schema e geração do Prisma Client. Os testes HTTP cobrem isolamento, validação, venda concorrente, reuso do catálogo, reserva e ausência de valores históricos para vendedores. A cadeia de migrations é verificada em PGlite; a implantação Docker e os fluxos com WhatsApp real exigem homologação no servidor.
