# RODAR Web · Regras da simulação

Estas são regras da **Demo local** de CCO, não uma validação jurídica de cobrança. Nesse modo, Google Maps JavaScript API exibe o mapa base e os caminhos são snapshots OSRM/OpenStreetMap locais; o navegador simula o restante da operação.

O **modo API**, selecionado por `VITE_API_BASE_URL` preenchida, recebe a operação do backend. Suas tentativas usam segundos reais, os estados e GPS vêm do servidor e a estadia é apresentada como recebida. Não aplicar os parâmetros, relógio ou fórmula da Demo aos dados API. Contratos, endpoints e recursos ainda MOCK estão em [INTEGRACAO-BACKEND.md](INTEGRACAO-BACKEND.md).

Os quadros **Problemas resolvidos** abaixo trazem as decisões de produto do time (17 problemas: 16 decididos, 1 descartado), do repositório [`chapahalls-ideas`](https://github.com/chapahalls/chapahalls-ideas/blob/main/ideas/parceiro-de-estrada/problemas-e-decisoes.md). Eles explicam o porquê do fluxo; não alteram parâmetros, fórmula ou regras desta Demo. O fluxograma completo está em [ARQUITETURA.md](ARQUITETURA.md#fluxo-completo-do-produto).

## Parâmetros da Demo

| Parâmetro | Valor |
|---|---|
| Franquia de espera | 5 h / 300 min |
| Estadia | R$ 2,50 por tonelada/hora excedente ou fração |
| Capacidade dos caminhões | 14 ou 30 t |
| Avisos ao CCO | 3 tentativas |
| Intervalo entre tentativas | 20 min |
| Aproximação | 8 km restantes |
| Velocidade | 70 km/h |
| Relógio | 1 s real = 1 min simulado, iniciando às 08:00 |
| Resposta automática do operador | 35% por tentativa, ajustável de 0% a 100% |
| Reinício de rota após descarga | 30 min |

Os valores de negócio ficam em `src/lib/config.ts`. Recebedores, identidades e progresso operacional são dados fictícios locais; posições do caminhão são calculadas no caminho versionado da demo.

## Viagem e chegada

Oito caminhões preservam suas placas e motoristas durante toda a sessão. Cada nova viagem recebe outro ID e pode ter outro destino. O motor mede distâncias e interpola posições ao longo de cinco caminhos rodoviários locais entre um CD de origem e recebedores fictícios na região de Campinas/SP.

Motor e mapa usam a mesma geometria e os extremos ajustados à via. `trip.progress` representa a fração da distância percorrida; a velocidade continua 70 km/h, com aproximação a 8 km restantes e chegada ao final do caminho. Duração estimada de OSRM, tráfego real ou posições do Google não governam o relógio nem os eventos da simulação.

Ao atingir os 8 km restantes, o motor registra `ApproachDetected`, uma tentativa de aviso `ReceiverNotified` e o resultado da ligação `ReceiverCallResult`. Uma ligação não atendida fica registrada, mas `notifiedBeforeArrival` só é verdadeiro quando o recebedor atende antes da chegada.

Chegar ao fim da rota registra `ArrivalRegistered` e `TaskCreated`, cria a Task em 1/3 e inicia a espera. Cada transição é emitida uma vez por viagem. Ocorrências “Fila na portaria, sem previsão” são raras, geradas com chance de 1% por minuto simulado e vinculadas a um caminhão aguardando descarga.

**Problemas resolvidos (produto)**

| # | Problema | Causa | Decisão do time | Status |
|---|---|---|---|---|
| 6 | Avisar só na chegada perde antecedência | A Task era criada apenas no destino | Avisar na aproximação e criar a Task na chegada | Decidido |
| 8 | Início da estadia pode ser contestado | A lei conta da chegada ao endereço; se o GPS falhar, não há prova | Geocerca do destino + check-in por voz + GPS do caminhão | Decidido |
| 12 | GPS do celular é falsificável | Apps de localização falsa | Rastreador do caminhão como prova forte; detectar mock location no Android | Decidido |
| 17 | Recebedor só era avisado depois de 3 tentativas sem resposta do CCO | O fluxo avisava só o CCO na aproximação | Avisar o recebedor na aproximação (condição para a estadia, segundo a 3ª Turma Recursal do TJMT) | Decidido |

## Ligações

O agente se identifica como “assistente virtual da transportadora”, informa a placa e pergunta doca e horário. O atendimento segue o `answerRate` fictício do recebedor, entre 0,45 e 0,9.

Quando atendida, 12% das ligações retornam “Hoje não recebemos mais, só amanhã às 7h”; as demais retornam “Pode mandar, doca N libera em 30 minutos”. Sem atendimento, o log mostra esse resultado. A transcrição, seus participantes e o resultado são traduzidos conforme o idioma selecionado.

A resposta sobre o próximo dia é **informativa**. Nesta versão ela não altera o horário de descarga. Não existe agenda de docas ou calendário do recebedor.

**Problemas resolvidos (produto)**

| # | Problema | Causa | Decisão do time | Status |
|---|---|---|---|---|
| 11 | As duas provas de GPS vêm do mesmo lado | Celular e caminhão são da transportadora/motorista | A resposta do recebedor na ligação do agente já registra o outro lado; QR/canhoto não entra | Descartado |

## Task e escalonamento

| Instante desde a chegada | Tentativa | Canal |
|---|---|---|
| T+0 min | 1/3 | Push simulado |
| T+20 min | 2/3 | Destaque no painel |
| T+40 min | 3/3 | Ligação simulada à central |
| T+60 min | Após três avisos sem resposta | Task escalada e nova ligação ao recebedor |

Cada tentativa avalia a chance de resposta automática uma vez. O slider afeta as próximas tentativas. Uma resposta registra `TaskAcknowledged`; avançar uma tentativa registra `TaskEscalated`.

O botão **Assumir** está disponível para Tasks abertas e escaladas. Ele registra a ação do operador e impede novos avisos daquela Task. A descarga fecha a Task mesmo se ninguém a assumiu. Ter sido escalada permanece como evidência da entrega, ainda que depois seja assumida.

**Problemas resolvidos (produto)**

| # | Problema | Causa | Decisão do time | Status |
|---|---|---|---|---|
| 1 | Escalonamento sem ação final definida | "Ficar parado" não dizia se é aguardar, não descarregar ou voltar | Segue a norma de cada transportadora | Decidido |
| 4 | Pergunta obrigatória no meio de uma manobra | Atualização é sempre necessária e o agente não sabe o momento | Permitir adiar até 2 min; sem resposta, escala para o CCO | Decidido |
| 5 | Re-notificar o CCO vira ruído | Repetir o mesmo canal não muda a atenção da central | Trocar de canal ao subir prioridade: push → destaque no painel → ligação com a central | Decidido |
| 7 | Motorista não sabe se o CCO confirmou | A confirmação fica só no painel | Agente avisa o motorista quando a Task for confirmada | Decidido |

## Descarga e estadia

No momento da chegada, o motor define a espera usando `typicalWaitMin` do recebedor: fator 0,8 para aviso prévio efetivo ou 1,1 sem aviso, com variação aleatória de ±40%. Perfis típicos variam entre 150 e 420 min.

`UnloadConfirmed` encerra a espera, fecha a Task e acrescenta uma entrega ao histórico. A viagem permanece descarregada por 30 min antes de iniciar outra; não gera outra entrega durante esse intervalo.

O único cálculo de estadia **da Demo** está em `src/utils/stay.ts`:

```text
ceil(max(0, waitMin / 60 − 5)) × capacityTons × 2,50
```

Conta da chegada até a descarga; assumir a Task não altera esse intervalo. Aviso prévio não acrescenta condição à fórmula da demo.

| Espera | 14 t | 30 t |
|---|---|---|
| 300 min | R$ 0,00 | R$ 0,00 |
| 301 ou 360 min | R$ 35,00 | R$ 75,00 |
| 361 min | R$ 70,00 | R$ 150,00 |

**Problemas resolvidos (produto)**

| # | Problema | Causa | Decisão do time | Status |
|---|---|---|---|---|
| 9 | Contador de estadia sem fim definido | Não existia evento de "descarga concluída" | Motorista (voz) ou CCO confirma a descarga e encerra o contador | Decidido |
| 10 | Franquia de 5 h pode variar por contrato | Contratos podem prever outra franquia | Franquia e valor por t/h configuráveis (valor atualizado pela ANTT) | Decidido |

## Histórico e indicadores

O histórico tem sete dias × nove entregas e usa mulberry32 com seed 42. Avisos efetivos por dia: `4, 5, 6, 6, 7, 8, 8`, equivalentes a aproximadamente 44%–89%. São contagens discretas que aproximam os alvos de 45%–93% do briefing.

A composição é controlada para mostrar menor espera ao longo da semana. Aproximadamente 15% das entregas com estadia positiva recebem a marca “cobrada”; as latências sintéticas ficam entre 700 e 2.000 ms. O histórico e os fluxos independentes de cada caminhão usam geradores separados, para que gerar dados de uma área não altere outra.

KPIs e ranking usam entregas concluídas, com taxas de atendimento calculadas sobre ligações históricas e da sessão. Fórmulas completas estão em [ARQUITETURA.md](ARQUITETURA.md). Nenhuma tendência sintética demonstra eficácia real do produto.

## Limites da Demo

O mock registra texto e eventos locais. Não executa chamadas telefônicas, coleta áudio, envia notificações, extrai documentos, autentica em serviço externo ou mantém fila de sincronização.

Na Demo, as requisições externas são somente para o mapa base do Google. Caminhos OSRM/OpenStreetMap foram capturados e versionados localmente, com atribuição ao provedor e aos contribuidores de OpenStreetMap; a geometria preparada fica em memória por recebedor. Não existe solicitação de rota por tick ou dependência de Routes API.

Em `/dashboard/mobile-demo`, a Demo local pode ser vista ao lado do monitoramento da frota. O app atua sobre a primeira viagem da sessão e suas ações de iniciar, aproximar, chegar, registrar ocorrência, enviar recado, assumir Task e confirmar descarga entram no mesmo estado Demo, feed e histórico que o dashboard consome. O seletor de visualização pode focar o app ou o dashboard. No modo API, o app permanece como prévia isolada; nenhuma ação mobile fictícia é enviada ao backend.

Carga, notas fiscais e mensagens do dossiê da Demo são fictícias, sem validade fiscal ou envio real. Esses dados não alteram a capacidade do caminhão, cálculo da estadia ou regras do motor. Sem chave Google, a interface informa a ausência do mapa base e mantém frota, dossiê e operação.

**Problemas resolvidos (produto)** · itens do mobile e da voz, fora deste painel

| # | Problema | Causa | Decisão do time | Status |
|---|---|---|---|---|
| 3 | IA pode errar número de NF, peso ou valor | LLM tende a aproximar ou inventar valores | A central define os documentos da rota, entregues no app e interpretados pela IA | Decidido |
| 2 | Dado de saúde passaria por voz → Agora → LLM | Canal novo e com terceiros | Saúde sai do produto | Decidido |
| 13 | Localização em segundo plano | Android e iOS restringem; consumo de bateria | Foreground service + permissão "sempre" (mobile) | Decidido |
| 14 | Sem sinal em trechos da rodovia | Cobertura celular irregular | Fila local de reportes e reenvio automático; Starlink como opção | Decidido |
| 15 | Wake word falha em cabine ruidosa | Motor, rádio e vento | Medir falso acionamento; botão no volante como alternativa | Decidido |
| 16 | Reporte marcado como completo com resposta vaga | LLM aceita "tudo certo" para vários campos | Critério de aceite por campo obrigatório | Decidido |

## Regras do modo API

- A URL configurada inicia carregamento/API. Uma falha apresenta erro e retry; a Demo depende de escolha explícita, sem completar dados operacionais com mocks.
- A rota, carga disponível, último GPS, ETA, distância, Tasks, chamadas, eventos e estadias são do backend. Sem GPS, o painel informa ausência; não fabrica coordenadas ou movimento a 70 km/h.
- O caminho é o `trajeto` fornecido pela API. O seed atual usa uma rota de 28 t com pontos em linha entre origem e destino; não equivale aos snapshots rodoviários da Demo.
- O backend controla tentativa, confirmação, escalada e descarga. **Assumir** envia confirmação da Task; **Confirmar descarga** envia a ação da rota. O CCO pode enviar uma mensagem ao motorista e iniciar uma chamada do agente: ambos registram todas as tentativas, falhas e resultados. O cliente não envia posições, confirma chegada manual ou reseta dados.
- Valores financeiros, franquia, capacidade, tarifa, horas paradas e aceleração são recebidos do servidor. Não aplicar o arredondamento por hora excedente da fórmula local à estadia da API.
- As listas limitadas e o SSE não fornecem histórico analítico completo. KPIs/ranking vêm de `/api/metrics` e `/api/receivers`, com as populações do backend: escaladas históricas, estadia devida inclusive aberta, espera média encerrada e latência somente LLM. Nulos não viram zero; série diária e valor cobrado permanecem indisponíveis. As 63 entregas sintéticas não entram nos dados API.
- O SSE não oferece replay; em reconexão, refazer as leituras e identificar dados desatualizados até a sincronização. O relógio da Demo não avança estados ou contadores do backend.
- O login API chama `/auth/sso`, mas o token/identidade são MOCK; na Demo, o login é local. A operação API atual não verifica autorização e possui CORS amplo. Antes de produção, o backend precisa controlar acesso por usuário, empresa, viagem e arquivo.
- O CCO seleciona somente um perfil `driver` já persistido e vinculado ao respectivo cadastro operacional antes de publicar ou reatribuir uma rota. O cliente cruza `/usuarios?role=driver` e `/motoristas`; não chama `POST /motoristas`. O trajeto publicado é linear; uma nova atribuição informa o mobile via WS, sem prometer replay ou aceite do motorista. Isso é uma restrição de interface/contrato: o backend ainda precisa autorizar a ação por usuário e empresa.
- `/api/documents` retorna NF-e/CT-e MOCK com `fileUri:null`. Anexos reais são independentes, listados/enviados em `/rotas/{id}/arquivos` e baixados por ID. O evento `arquivo_adicionado` exige refetch.
- Upload aceita PDF/JPEG/PNG/WebP/GIF, até 10 MiB por padrão. Metadados no banco e conteúdo no volume precisam acompanhar a execução; reset preserva anexos e não há exclusão/versionamento implementados.
- Pedidos da central usam `/rotas/{id}/solicitacoes`; enviar pergunta pode acionar o agente já existente no backend. Mensagens CCO→motorista usam `/rotas/{id}/mensagens`; a única sessão RTC iniciada pelo navegador é o atendimento do operador em `/operator`, quando a cascata Twilio falha. O painel não envia GPS para preencher cenários.
