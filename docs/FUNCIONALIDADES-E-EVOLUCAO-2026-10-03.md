# Adapter Connect — funcionalidades e oportunidades de evolução

> Este inventário descreve a versão anterior à implementação comercial. Para as oito funções posteriormente implementadas e suas regras atuais, consulte [Gestão Comercial](GESTAO-COMERCIAL.md).

Análise do código em 03/10/2026, tomando como referência o commit `92354c1` e as correções anteriores de triagem, isolamento e rodízio. Este documento descreve o que o projeto oferece e propõe evoluções; não representa homologação do ambiente de produção nem implementação das sugestões.

**Leitura dos estados:** implementado significa que existe no código; condicionado exige configuração, credenciais ou serviço externo; proposto significa que ainda precisa ser desenvolvido. Funcionalidade implementada também precisa ser validada no ambiente real.

## 1. Acesso, empresas e usuários

| Funcionalidade existente | Benefício e limite |
|---|---|
| Login, identificação do usuário e logout | Acesso autenticado; logout revoga sessões e conexões associadas ao usuário. |
| Recuperação e redefinição de senha | Tokens com validade e uso único; envio depende de SMTP configurado. |
| Cadastro de empresa e checkout de assinatura | Entrada de novos clientes na plataforma, condicionada à configuração de cobrança. |
| Separação por empresa | Consultas e operações consideram a empresa do usuário. Não substitui testes de autorização em todos os caminhos. |
| Perfis superadmin, admin, supervisor, seller, support e other | Diferencia gestão da plataforma, gestão da empresa e operação. Não há um editor completo de permissões personalizadas. |
| Gestão de equipe e atribuição de conexões | Define quem atende e quais números pertencem aos vendedores. |
| Presença online/offline | Alimenta a elegibilidade do rodízio. |
| Limites por plano | Controla quantidades de usuários, conexões e produtos; mostra consumo no painel. |
| Controle de empresa ativa e assinatura | Restringe uso conforme situação da empresa e permite os fluxos necessários de regularização. |

**Isolamento atual:** vendedores acessam conversas das conexões explicitamente pertencentes a eles. A atribuição de um lead da loja não libera o histórico de mensagens da loja. Administradores e supervisores têm visão mais ampla dentro da empresa. Os outros perfis seguem suas regras específicas de setor e atribuição; não devem ser tratados como equivalentes ao vendedor.

## 2. Conexões WhatsApp

| Funcionalidade existente | Benefício e limite |
|---|---|
| Cadastro e gestão de múltiplas instâncias | Separa número da loja e números dos vendedores. |
| Conexão por QR Code e desconexão | Gerenciada por admin/supervisor; vendedor não tem fluxo próprio de pareamento na interface atual. |
| Associação de instância ao vendedor | Define a origem dos chats e o escopo de acesso. |
| Persistência de sessão e restauração após reinício | Reduz necessidade de novo pareamento. |
| Atualização de status em tempo real | Permite acompanhar disponibilidade das conexões. |
| Reconexão com espera progressiva e variação aleatória | Evita tentativas incessantes; não garante disponibilidade do serviço externo. |
| Captura de mensagens recebidas e enviadas pelo celular conectado | Integra o atendimento pelo aparelho ao CRM e à captura do lead. |
| Tratamento de identificadores de telefone e LID | Reduz duplicações quando existe informação suficiente para relacionar os identificadores. |

Conversas do mesmo cliente em números diferentes podem existir legitimamente. O objetivo é impedir duplicações acidentais dentro da mesma conexão e relacionar o atendimento comercial sem expor mensagens entre os números. Registros antigos não são automaticamente mesclados ou apagados.

## 3. Atendimento e conversas

| Funcionalidade existente | Benefício e limite |
|---|---|
| Listagem, busca e identificação da linha de origem | Ajuda a encontrar o cliente e entender por qual número foi atendido. |
| Criação manual de conversa | Permite iniciar atendimento pelo painel. |
| Histórico paginado e atualização em tempo real | Evita carregar todo o histórico de uma vez. |
| Envio de texto | Atendimento humano pelo painel. |
| Envio e recebimento de imagens, áudios, vídeos e documentos | Transporte de mídia com controles de acesso, tipo e tamanho; receber mídia não significa que a IA interpreta todos os formatos. |
| Notas internas | Registra observações sem enviá-las ao cliente ou tratá-las como mensagem pública da IA. |
| Etiquetas | Organização e filtros do atendimento. |
| Favoritos | Acesso rápido a conversas importantes. |
| Arquivar e desarquivar | Organização sem exclusão da conversa. |
| Bloquear e desbloquear | Controle de contatos que não devem receber atendimento automático. |
| Setores e atribuição de responsável | Distribuição interna do atendimento. |
| Transferência com motivo opcional | Registra uma observação sobre o repasse. A interface ainda é simples. |
| Respostas prontas com atalho `/` | Agiliza mensagens frequentes; hoje são locais ao navegador/usuário/empresa, não uma biblioteca central compartilhada. |
| Agendamento de mensagens de texto | Permite envio futuro e cancelamento de agendamentos elegíveis; depende do processamento do servidor. |
| Consulta de respostas capturadas pelos fluxos | Dá continuidade ao atendimento sem repetir perguntas já registradas. |
| Controle manual do modo IA | Continua existindo no painel; o encaminhamento automático ao vendedor não deve desligar a IA da loja. |
| Alertas sonoros e notificações do navegador | Dependem da permissão do usuário e do painel aberto. Ainda não são Web Push com o painel fechado. |

**Exclusão:** a opção de excluir mensagem ou conversa foi retirada e os endpoints diretos correspondentes estão bloqueados. Arquivamento permanece. Existem operações administrativas específicas de anonimização, retenção e remoção de entidades; portanto, isso não significa que nenhum dado possa ser removido em qualquer circunstância.

## 4. Kanban e etapas comerciais

As cinco colunas fixas são protegidas contra alteração de nome e exclusão:

| Etapa | Papel no processo |
|---|---|
| Iniciada / Novo | Entrada e descoberta da necessidade do cliente. |
| Interesse em Compra | Lead qualificado aguardando atendimento/captura conforme o rodízio. |
| Encaminhados | Separa o registro da loja após encaminhamento/captura, sem transformá-lo no histórico privado do vendedor. |
| Em atendimento | Identifica atendimento humano na conexão do vendedor. |
| Finalizada / Pago | Encerramento no funil; o nome da coluna não comprova recebimento financeiro. |

Também existem colunas pessoais, movimentação de cards e filtros por etiqueta, vendedor e período. Colunas pessoais organizam a visão e não podem ser usadas para contornar o prazo de captura de um lead.

O vendedor continua limitado aos chats das próprias conexões. Administradores podem acompanhar o processo completo. Parte da classificação de registros legados é compatibilizada na apresentação; não equivale a uma migração completa de todos os estados antigos no banco.

## 5. Rodízio e confirmação do vendedor

| Funcionalidade existente | Benefício e limite |
|---|---|
| Seleção de vendedores online da empresa | Evita encaminhar para alguém marcado como offline. |
| Distribuição circular com cursor da empresa | Alterna responsáveis sem depender apenas da ordem de uma lista. |
| Prazo nominal de um minuto sem resposta humana | Reencaminha o lead que não foi capturado; a execução depende do próximo ciclo do worker. |
| Espera e nova tentativa quando não há vendedor elegível | Mantém o lead no processo em vez de atribuir a um usuário inválido. |
| Notificação ao vendedor com dados da triagem | Informa aparelho, variação e pagamento, respeitando o isolamento do histórico da loja. |
| Confirmação explícita com identificador do chat | Permite selecionar corretamente o lead. |
| Confirmação simples quando há apenas um lead pendente elegível | Reduz a fricção; vários clientes pendentes exigem identificação. |
| Reconhecimento de resposta humana no painel ou celular conectado | Captura o atendimento e interrompe a rotação relacionada. |
| Validação do responsável atual | Impede captura tardia por quem já perdeu a atribuição. |
| Coordenação entre captura e worker | Reduz a disputa entre uma resposta humana e a redistribuição automática. |

Mensagens da IA, notas internas e agendamentos não devem contar como resposta humana para parar o rodízio. Pedidos repetidos do cliente durante a espera não devem reiniciar o processo.

## 6. Inteligência artificial e qualificação

| Funcionalidade existente | Benefício e limite |
|---|---|
| Configuração de provedor, modelo, chave e prompt por empresa | Adapta o atendimento à operação de cada loja. |
| Gemini, OpenAI, Groq e modo mock | Alternativas de integração e desenvolvimento. O alias legado `grok` representa Groq, não integração com xAI Grok. |
| Teste de configuração | Ajuda a identificar problemas de credencial/modelo; não substitui teste do atendimento inteiro. |
| Atendimento com catálogo e contexto recente | Permite responder dúvidas sobre produtos; o histórico utilizado é limitado, não uma memória completa do cliente. |
| Distinção entre exploração do catálogo e intenção de compra | “Quero ver os iPhones” deve mostrar opções, sem obrigar um encaminhamento imediato. |
| Extração de aparelho e pagamento | Reconhece exemplos como “iPhone 13 Pro Max no boleto”, inclusive sem correspondência exata no catálogo. |
| Registro de modelo solicitado fora do catálogo | Preserva a preferência com disponibilidade e preço pendentes de confirmação. |
| Perguntas de qualificação sem repetição indefinida | Pergunta pelo campo ausente e permite encaminhamento sem prender o cliente em um ciclo. |
| Pedido explícito de humano | Permite encaminhamento sem exigir qualificação completa. |
| Continuidade da IA na loja após encaminhamento | Responde outras dúvidas e informa que o atendimento humano está aguardando. |
| Proteções contra respostas antigas após mudança de estado | Reduz envio indevido após pausa, bloqueio ou outra alteração de atendimento. |
| Chaves de provedores cifradas | Evita retornar segredos em texto puro na configuração do frontend. |

A qualificação combina instruções ao modelo e regras do backend. Ainda exige testes com linguagem natural variada: abreviações, erros de digitação, mudança de produto, troca de pagamento e mensagens contraditórias.

O resumo comercial entregue ao vendedor deve carregar os campos necessários à venda. Ele não deve se tornar um caminho indireto de acesso ao histórico completo da loja.

## 7. Áudio, imagens e outros formatos

| Recurso | Situação |
|---|---|
| Transcrição de áudio recebido | Implementada com Gemini e limites de tamanho/duração, timeout e concorrência; exige configuração adequada. |
| Descrição de imagens | Implementação condicionada à flag `VISION_ENABLED`, IA ativa e chave Gemini; atende formatos e limites específicos. Não está automaticamente ativa em todas as empresas. |
| Interpretação de vídeo recebido | Não integrada ao atendimento atual. |
| Leitura do conteúdo de PDF/documentos recebidos | Não integrada como capacidade geral do atendimento atual. |
| Resposta da IA em áudio/TTS | Fora do escopo por decisão do usuário. |

Uma foto de comprovante pode ajudar a extrair informações, mas não comprova que o dinheiro entrou na conta. A confirmação deve vir da conciliação ou do responsável autorizado.

## 8. Produtos, estoque e vendas

| Funcionalidade existente | Benefício e limite |
|---|---|
| Cadastro e edição de produtos em estoque | Organiza os aparelhos disponíveis. |
| Nome, IMEI/chassi, memória, cor e condição | Identifica a unidade e suas características. |
| IMEI/chassi único por empresa | Reduz cadastro duplicado de uma mesma unidade. |
| Preço, entrada e forma de pagamento | Registra dados comerciais; não executa a cobrança do comprador. |
| Associação ao vendedor | Define responsabilidade e escopo de visualização. |
| Marcação como vendido | Registra data da venda e retira o produto da disponibilidade ativa. |
| Proteção contra nova venda e edição ordinária de item já vendido | Reduz alterações acidentais no registro concluído. |
| Métricas por vendedor e período | Quantidade vendida, valor total, entradas e ticket médio. |
| Catálogo de produtos ativos para a IA | Fundamenta sugestões em dados cadastrados. |
| Limite de produtos por plano | Controla utilização da plataforma. |

O modelo atual se aproxima de unidades individualizadas por IMEI/chassi. Não é uma gestão completa de compras, custos, fornecedores, reserva, devolução, garantia ou estoque por quantidade de SKU.

**Distinção essencial:** selecionar “boleto” registra a preferência do comprador. Não existe, por isso, emissão automática de boleto para o aparelho. A cobrança da assinatura da plataforma é outro módulo.

Também não existe um vínculo completo entre lead, conversa, produto vendido e pagamento recebido. Assim, hoje não é possível afirmar uma conversão comercial precisa apenas contando chats finalizados.

## 9. Construtor de fluxos

| Funcionalidade existente | Benefício e limite |
|---|---|
| Editor visual e gestão de fluxos | Permite criar um roteiro sem programar cada interação. |
| Ativação de um fluxo por empresa | Define o roteiro de entrada ativo. |
| Nós início, mensagem, menu, pergunta, condição, transferência e fim | Cobre atendimento guiado e decisões básicas. |
| Validação de texto, número, e-mail e telefone | Reduz respostas inválidas em campos estruturados. |
| Variáveis e substituição em mensagens | Reutiliza dados coletados durante o fluxo. |
| Condições de comparação e preenchimento | Define caminhos conforme as respostas. |
| Tentativas limitadas e transferência | Evita prender o cliente em entradas inválidas indefinidamente. |
| Sessões com fotografia do fluxo e expiração | Alterações no editor não mudam silenciosamente o roteiro já iniciado. |
| Interrupção por atendimento humano | Evita continuar o roteiro enquanto uma pessoa atende. |

Não há um construtor completo de campanhas, integrações externas arbitrárias ou gatilhos comerciais avançados.

## 10. Indicadores, relatórios e auditoria

| Funcionalidade existente | Benefício e limite |
|---|---|
| Dashboard de conversas e gráfico por status | Visão inicial da operação; ainda considera apenas iniciada, interesse e finalizada. |
| Tempos de resposta da IA e de humanos | Permite medir a experiência de atendimento. |
| Duração de atendimento, atividade por colaborador e setor | Apoia gestão de carga e desempenho. |
| Histórico recente de volume de mensagens | Ajuda a identificar variações na operação. |
| Exportação CSV de relatórios | Permite análise externa; exportação PDF não está pronta. |
| Métricas comerciais dos produtos | Mostra vendas registradas, separadamente dos chats finalizados. |
| Logs operacionais | Apoia diagnóstico de erros e ações do sistema. |
| Registros de auditoria e consultas administrativas | Ajuda a rastrear ações; parte do acesso é por API, não por uma tela completa de auditoria. |

**Correção prioritária identificada:** atualizar o Dashboard para as cinco etapas e substituir o rótulo “Compras Finalizadas” quando o dado é apenas quantidade de conversas finalizadas.

## 11. Assinatura da plataforma e administração global

| Funcionalidade existente | Benefício e limite |
|---|---|
| Planos, preços e limites | Define a oferta da plataforma. |
| Checkout inicial e renovação | Permite contratação e manutenção da assinatura. |
| Pix com QR Code e código copiável | Facilita pagamento da assinatura. |
| Suporte a checkout com cartão conforme configuração | Depende do fluxo habilitado e da integração Mercado Pago; não deve ser confundido com venda de aparelhos. |
| Tentativas de pagamento, referência e idempotência | Reduz duplicidade de processamento. |
| Consulta e reconciliação periódica de pagamentos | Permite concluir pagamentos sem depender somente do navegador aberto. |
| Controle de vencimento e cancelamento | Mantém o período pago e controla continuidade do acesso. |
| Gestão global de empresas e planos pelo superadmin | Administração da plataforma. |

Não há um módulo completo de recebíveis dos aparelhos, comissões, emissão fiscal, reembolso ou gestão de chargebacks. A confirmação de pagamentos da assinatura usa consulta ao provedor; não há um fluxo geral de webhook de cobrança já integrado.

## 12. Segurança, privacidade e operação

Existem autenticação por cookie, validação de sessão, hash de senha, cifragem de segredos, limites de requisições, headers de proteção, controles de acesso a arquivos, validação de uploads, cotas de mídia e controles de conexões Socket.io.

Há exportação administrativa de dados do cliente, anonimização, rotinas de retenção e limpeza de mídia, além de processamento de rodízio, agendamentos, assinaturas e pagamentos em segundo plano. O projeto inclui Docker e verificações automatizadas.

Esses mecanismos não constituem certificação de segurança ou comprovação de conformidade legal. A existência no código não prova configuração correta, execução de backups, restauração testada ou resistência sob carga. Nesta análise não foi executado um novo `npm audit`; portanto, o antigo resultado de zero vulnerabilidades não deve ser tratado como resultado atual.

O funcionamento atual depende de coordenação de tarefas e estado em uma instância da aplicação. Antes de operar com várias réplicas, é necessário revisar presença, filas, locks e execução única dos jobs.

## 13. Recursos que não devem ser apresentados como disponíveis

- Catálogo público de delivery e pedidos de delivery: endpoints desativados com resposta 410.
- Exclusão de conversas/mensagens pelo usuário: retirada conforme solicitado.
- TTS/resposta da IA em áudio: excluída do escopo conforme solicitado.
- Web Push com painel fechado, relatórios PDF e biblioteca compartilhada de respostas: ainda propostos.
- Emissão de boleto/Pix para vender aparelhos, pagamentos parcelados e recebíveis: ainda propostos.
- Leitura geral de vídeos/PDFs, busca externa e uso de ferramentas pela IA: não são ativados apenas escolhendo um modelo novo.
- Mesclagem automática de registros duplicados antigos: não implementada como saneamento geral.

## 14. Benefícios das atualizações recentes

| Atualização | Benefício esperado | O que ainda validar |
|---|---|---|
| Reconhecimento de produto e pagamento | Evita repetir “qual aparelho?” após o cliente informar modelo e boleto. | Abreviações, correções, troca de preferência e produtos fora do catálogo. |
| Separação entre consulta e compra | Mantém a IA mostrando produtos enquanto o cliente explora opções. | Casos ambíguos e intenção de comprar sem forma de pagamento informada. |
| Qualificação sem ciclo infinito | Reduz esforço e abandono antes de falar com humano. | Fluxo completo e tempo até encaminhamento real. |
| IA ativa após encaminhamento | A loja continua respondendo quando o cliente volta a escrever. | Não reiniciar rodízio nem interferir no atendimento privado do vendedor. |
| Confirmação e captura entre conexões relacionadas | Evita continuar distribuindo um lead já atendido pelo celular. | Dois vendedores concorrentes, confirmação tardia, múltiplos leads e reinício do servidor. |
| Identificação PN/LID e controle de criação | Reduz duplicações acidentais na mesma linha. | Identificadores incompletos e eventos concorrentes reais do WhatsApp. |
| Isolamento do vendedor | Protege as mensagens da loja e dos colegas. | Listagem, acesso direto, arquivos, sockets e relatórios para cada perfil. |
| Cinco etapas fixas | Separa espera, encaminhamento e atendimento humano. | Dashboard, relatórios, registros antigos e consistência dos estados. |
| Remoção da exclusão de chats | Preserva continuidade operacional e histórico. | Recuperação via arquivamento e acesso às ações administrativas de dados. |
| Gemini 3.8 Flash na seleção | Permite escolher o modelo na configuração da empresa. | Disponibilidade na conta, compatibilidade, qualidade, latência e custo reais. |

Os testes locais realizados nas alterações anteriores ajudam a validar regras e regressões, mas não substituem homologação com WhatsApp real, banco de produção equivalente e provedores reais. Não há medição que permita prometer um percentual de aumento de vendas ou redução de custos.

## 15. O que podemos aproveitar do Gemini 3.8 Flash

A documentação oficial descreve entrada de texto, imagem, áudio, vídeo e PDF, saída em texto, contexto amplo, saída estruturada e uso de ferramentas. Essas capacidades são do modelo; a aplicação precisa integrá-las explicitamente. [Documentação oficial do Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash).

A atualização atual adicionou a opção à lista de modelos. Não alterou automaticamente o modelo de todas as empresas: o padrão continua Gemini 2.5 Flash. Também não ativou busca, ferramentas, memória extensa ou análise de vídeos e documentos.

| Aplicação proposta | Benefício para a operação | Requisito |
|---|---|---|
| Extração estruturada da intenção e qualificação | Registra produto, pagamento, urgência e pedido de humano com menos dependência de frases exatas. | Schema, validação no backend e testes; o modelo não pode decidir autorização. |
| Consulta de estoque por ferramenta controlada | Responde disponibilidade e preço atualizados. | API somente da empresa, campos permitidos e confirmação de estoque antes da venda. |
| Comparação de aparelhos | Ajuda o cliente a escolher por orçamento, câmera, bateria e uso. | Catálogo confiável e especificações verificadas; separar fato de sugestão. |
| Memória comercial estruturada | Evita repetir perguntas em retornos do cliente. | Persistir preferências e correções, com escopo e retenção definidos. |
| Resumo comercial atualizado | Entrega ao vendedor o estado atual da escolha. | Resumo de campos comerciais, sem liberar mensagens da loja. |
| Análise de fotos | Ajuda a identificar características de aparelhos ou extrair dados de documentos. | Integração de imagem, controles de acesso e revisão em decisões relevantes. |
| Leitura de documentos autorizados | Consulta políticas da loja, garantia e financiamento informado pela empresa. | Ingestão, atualização e recuperação de fontes; ainda não existe como função geral. |
| Avaliação de qualidade do atendimento | Detecta perguntas repetidas, encaminhamentos falhos e informações conflitantes. | Processo separado, dados minimizados e avaliação humana amostral. |

Para escolher entre 2.5 e 3.8, comparar o mesmo conjunto de conversas: acerto de campos, encaminhamento correto, repetição de perguntas, latência, custo por atendimento e violações de isolamento. Um modelo mais novo não garante melhor resultado em todos esses critérios.

## 16. Roadmap recomendado: funções, benefícios e medidas

As prioridades abaixo representam uma proposta, não mudanças já aplicadas nem prazo fechado.

| Prioridade | Função/evolução | Benefício | Como avaliar |
|---|---|---|---|
| P0 | Homologar captura e rodízio de ponta a ponta | Impede perder atendimento já aceito pelo vendedor. | Capturas com timer encerrado; nenhuma redistribuição posterior indevida. |
| P0 | Testar isolamento em todos os canais | Garante a regra de vendedor sem mensagens da loja. | Testes negativos em API, mídia, sockets e listagens. |
| P0 | Separar identidade do lead dos chats por conexão | Relaciona loja e vendedor sem confundir dois históricos com dois clientes. | Uma oportunidade comercial relacionada aos chats corretos. |
| P0 | Atualizar Dashboard e relatórios para cinco etapas | Mostra o estado real do funil e elimina indicador enganoso de compra. | Totais coerentes com o Kanban e vendas registradas. |
| P0 | Homologar migrations e recuperação do banco | Evita bloqueios de implantação como o P3009 observado. | Deploy em cópia representativa e restauração testada. |
| P1 | Qualificação estruturada com correções de preferência | Diminui perguntas repetidas e repasses incompletos. | Taxa de qualificação correta e tempo até atendimento. |
| P1 | Vincular lead, vendedor, produto e venda | Permite conversão real e rastreabilidade comercial. | Percentual de vendas ligadas à oportunidade de origem. |
| P1 | Reserva temporária de aparelho | Evita prometer a mesma unidade para dois clientes. | Conflitos de venda e reservas expiradas. |
| P1 | Alertas de SLA e Web Push | Avisa o vendedor quando o painel estiver fechado. | Entrega, aceite e tempo até primeira resposta humana. |
| P1 | Painel de fila e cobertura dos vendedores | Expõe leads sem responsável, recusas e espera excessiva. | Leads fora do prazo e distribuição da carga. |
| P1 | Motivo de perda e encerramento comercial | Explica por que o interesse não virou venda. | Preenchimento e principais causas por período. |
| P1 | Tarefas e lembretes de acompanhamento | Organiza retorno a clientes sem depender da memória do vendedor. | Tarefas concluídas e recuperações de oportunidade. |
| P1 | Respostas prontas centralizadas | Padroniza informações e facilita mudanças de políticas. | Uso da biblioteca e redução de respostas desatualizadas. |
| P1 | Base de conhecimento da empresa | Responde condições, garantia e procedimentos de forma consistente. | Respostas corretas com fonte e atualização da base. |
| P2 | Agenda de visita e retirada | Transforma intenção em compromisso concreto. | Agendamentos, comparecimento e conversão. |
| P2 | Recebíveis dos aparelhos | Separa preferência de pagamento, cobrança e valor recebido. | Conciliação e saldo por venda. |
| P2 | Comissões por vendedor | Automatiza cálculo a partir de vendas efetivas e regras aprovadas. | Divergências e tempo de fechamento. |
| P2 | Custos, margem e fornecedores | Mostra rentabilidade em vez de apenas faturamento. | Margem por unidade, modelo e período. |
| P2 | Garantia, devolução e pós-venda | Mantém rastreabilidade depois da compra. | Prazo de solução e recorrência de atendimento. |
| P2 | Exportação PDF e relatórios agendados | Facilita gestão e compartilhamento periódico. | Uso e tempo de preparação dos relatórios. |
| P2 | Importação validada de produtos/clientes | Reduz trabalho de entrada de dados. | Erros, duplicidades e tempo de importação. |
| P2 | Integrações com ERP e cobrança | Reduz cadastro e atualização manual duplicados. | Sincronizações corretas e reconciliação de divergências. |
| P2 | Filas persistentes e coordenação distribuída | Permite crescer e reiniciar sem perder tarefas. | Reprocessamento seguro e operação com múltiplas réplicas. |
| P2 | Monitoramento e avaliação contínua da IA | Detecta regressões após alterar modelo ou prompt. | Qualidade, custo, latência e falhas por versão. |

P0 protege o atendimento e os dados. P1 melhora conversão, continuidade e visibilidade. P2 amplia gestão e escala sobre uma operação já estável. As funções financeiras exigem regras comerciais e integração específicas; não devem ser inferidas do simples preenchimento de uma forma de pagamento.

## 17. Sequência prática sugerida

1. Validar com clientes de teste o caminho completo: explorar catálogo, escolher aparelho e pagamento, encaminhar, confirmar pelo celular, parar rodízio e manter a IA disponível na loja.
2. Validar todos os acessos de vendedor e atualizar indicadores para as cinco etapas.
3. Criar o vínculo comercial entre lead, chats e venda, preservando o isolamento das mensagens.
4. Melhorar qualificação, alerta de atendimento e acompanhamento dos leads.
5. Comparar Gemini 3.8 Flash e o modelo atual com critérios mensuráveis antes de ampliar o uso.
6. Acrescentar reserva, recebíveis, comissões e pós-venda conforme a prioridade da operação.

## 18. Principais referências no projeto

- [Rotas da aplicação](../app.js).
- [Produtos e vendas](../src/routes/productRoutes.js).
- [Fluxos](../src/services/flowService.js).
- [Rodízio](../src/services/salesRotationService.js).
- [Kanban](../src/routes/kanbanRoutes.js).
- [Modelo de dados](../prisma/schema.prisma).
- [Dashboard](../frontend/src/pages/Dashboard.tsx).
- [Diagnóstico de conversas](diagnostico-conversas.sql).

Este inventário distingue funcionalidades acessíveis, capacidades condicionadas e propostas. A presença de estruturas antigas no banco ou de controllers sem rota ativa não foi tratada como prova de uma função disponível ao usuário.
