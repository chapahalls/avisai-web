# RODAR Web · Integração com o backend

O painel tem dois modos explícitos: **API**, com operação, métricas e ranking recebidos do backend RODAR, e **Demo**, com a simulação local. SSO, NF-e/CT-e e complementos comerciais continuam declarados como **MOCK**; anexos binários enviados pelo CCO têm contrato próprio. Dados API não são completados com caminhões, posições, eventos, histórico ou valores financeiros da demo.

Os contratos abaixo foram conferidos no código de `rodar-backend/backend/app/api`, nos modelos, schemas e enums do backend. Leituras, SSE e apresentação foram validados localmente. Publicação, atribuição, provisionamento técnico de motorista e upload foram executados com dados fictícios no backend; confirmação de Task, descarga e perguntas foram verificadas em testes controlados. Os detalhes estão em **Validação realizada**.

## Configuração e estados da conexão

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Preencha a variável na `.env` local e reinicie o Vite. A URL aponta para a raiz do backend: não acrescentar `/api` à URL base; somente alguns endpoints usam esse prefixo. O painel sempre inicia na Demo, inclusive após sair; com a variável preenchida, **Conectar à API** (login ou barra superior) é a escolha explícita do modo ao vivo. Vazia, só a Demo fica disponível. Não registre credenciais ou valores de chaves no Git.

Ao conectar à API, o painel entra em carregamento e busca o estado do backend. Uma falha mostra erro e a ação **Tentar novamente**; não inicia a simulação automaticamente. **Usar demo** é uma escolha explícita do operador. Enquanto o SSE reconecta, o último estado recebido deve ser identificado como desatualizado, sem inventar novos eventos ou avançar o GPS.

O backend aceita CORS só das origens em `CORS_ORIGENS`. `/auth/sso` é um login sem senha que devolve um JWT assinado; com `AUTH_OBRIGATORIA=true` (padrão), toda escrita exige esse token, as ações da central exigem o papel `cco` e o motorista só age na própria rota. O endpoint de LLM tem configuração própria de segredo, que não pertence ao frontend. Antes de produção ainda faltam login de verdade, 2FA para a central, leituras protegidas e separação por empresa.

## Tour mobile e voz LiveKit

Em `/dashboard/mobile-demo`, o tour da Demo integrada percorre 18 etapas: acesso, conversa para retirada, aproximação, chegada, fila, escalonamento, ação do CCO e descarga. O monitoramento embutido mostra somente a viagem do tour, sem modificar os demais dados da Demo. As ações atualizam a simulação local do painel, não as rotas da API. O tour pausa a simulação e ajusta temporariamente a resposta automática do CCO; ao terminar ou ser fechado, restaura esses controles. Reexecutá-lo reinicia a viagem demonstrada.

O botão de conexão ao lado do seletor de visualização é uma integração opcional separada do modo API do painel. Com `VITE_API_BASE_URL` configurada, consulta `GET /livekit/config`, público, que retorna `configurado`, `url` e `agente`, sem chave ou segredo. Ao conectar, um cliente independente faz `POST /auth/sso` sem e-mail e usa o JWT obtido em `POST /livekit/token` com corpo `{}`; o backend retorna URL, sala, identidade e token temporário (60 minutos por padrão). Com autenticação obrigatória, esse endpoint exige login. O navegador conecta pelo `livekit-client`, solicita o microfone, reproduz áudio remoto e apresenta transcrições recebidas. Os POSTs não são repetidos automaticamente.

No backend, configure `LIVEKIT_URL`, `LIVEKIT_API_KEY` e `LIVEKIT_API_SECRET`; `LIVEKIT_AGENT_NAME` é opcional e solicita o despacho do agente nomeado. Uma sala conectada não comprova que exista um agente disponível: o botão distingue a espera da presença de um participante do tipo agente. As credenciais permanecem no backend; o frontend recebe apenas o token. O usuário precisa liberar o microfone no navegador. O botão informa indisponibilidade, configuração ausente ou erro de autenticação, token, conexão e microfone.

Use uma origem permitida em `CORS_ORIGENS` (no ambiente local informado, `http://localhost:5173`; as portas 5174 e 5175 não estão liberadas). A configuração estar ativa não garante microfone nem agente em execução. Configurar a voz ao vivo não transforma o tour nem a operação da Demo em dados reais.

## APIs integradas no painel

Os caminhos de frontend indicam as features consumidoras. IDs nas URLs são os IDs numéricos recebidos da API, preservados pelo adaptador.

| Funcionalidade | Caminho no frontend | Método e endpoint | Status | Limite / contrato |
|---|---|---|---|---|
| Estado inicial da operação | `src/app`, `src/features/fleet`, `src/features/tasks`, `src/features/trips` | `GET /cco/estado` | API | Rotas, Tasks, estadias, ligações, ocorrências, chamados do motorista e eventos; `rota_id` opcional. Não inclui o `trajeto` das rotas. |
| Atualizações da central | `src/app`, features operacionais | `GET /cco/stream` | API, SSE | Eventos `snapshot`, `evento`, `task`, `posicao`, `fala`, `contador`, `reset` e `chamado`; `rota_id` opcional. Sem replay. |
| Fila de Tasks | `src/features/tasks` | `GET /tasks` | API | Até 50 registros, ID decrescente; sem paginação ou filtro por rota nesse endpoint. |
| Assumir Task | `src/features/tasks` | `POST /tasks/{task_id}/confirmar` | API, ação do operador | JSON `{"confirmado_por":"CCO"}`. A confirmação e as consequências operacionais pertencem ao servidor. |
| Alertas do motorista e decisões do agente | `src/features/trips` | `GET /eventos`, `GET /cco/stream` | API, tempo real | `alerta_motorista` traz tipo, resumo, transcrição, prioridade e timestamp; `decisao_agente` traz percebeu/decidiu/executou/resultado. |
| Mensagens CCO → motorista | `src/features/trips` | `GET/POST /rotas/{rota_id}/mensagens` | API, ação do CCO | POST `{remetente,texto}` cria uma thread e aciona `falar_motorista`; status: `enviada`, `falada`, `respondida` ou `offline`. |
| Cascata de chamada do agente | `src/pages/OperatorPage.tsx`, feed de eventos | `GET /cco/chamadas-agente`, `GET /operador/chamadas/atual`, `POST /operador/chamadas/{id}/atender` | API, RTC no navegador | O backend tenta Twilio e registra o resultado; sem êxito, `/operator` entra no canal Agora. Sem atendimento, publica escalada crítica. |
| Feed e eventos da viagem | `src/features/fleet`, `src/features/trips` | `GET /eventos?limite=200` | API, leitura | Backend aceita `rota_id` e `limite` (padrão 100); cliente solicita 200. Não é histórico completo nem paginação. |
| Rota, carga disponível e caminho | `src/features/fleet`, `src/features/trips` | `GET /rotas/{rota_id}` | API | Inclui `trajeto`, placa, motorista, origem/destino, carga em toneladas, descrição, número da nota e recebedor. Não entrega um dossiê comercial completo. |
| Confirmar descarga | `src/features/tasks`, `src/features/trips` | `POST /rotas/{rota_id}/descarga` | API, ação do operador | JSON `{"por":"CCO"}`. Encerra estadia e Task no servidor e devolve o resumo financeiro. |
| Indicadores do backend | `src/features/metrics`, Dashboard | `GET /api/metrics` | API | População/fórmulas do servidor, descritas abaixo; valores sem amostra podem ser nulos. |
| Ranking dos recebedores | `src/features/receivers` | `GET /api/receivers` | API | Agrupa por `recebedor_empresa`, com espera média de estadias encerradas e valores do servidor. |
| Perfis de demonstração | Login e modelo mobile | `GET /usuarios`, alias `GET /api/users` | API, cadastro persistido | Filtro opcional `role=cco` ou `role=driver`. Retorna ID estável, nome, e-mail, papel, motorista e viagem atual; sem token. |
| Login de demonstração | `src/features/auth` | `POST /auth/sso` | API com identidade MOCK | JSON `{"email":"..."}` de um perfil cadastrado; 404 para desconhecido. Token fake, papel, nome, `driverId` e `tripId`. Não é autorização real. |
| Usuários motoristas cadastrados | `src/features/dispatch` | `GET /usuarios?role=driver`, `GET /motoristas` | API, leitura | O painel cruza o perfil persistido com `driverId` e o cadastro operacional. Motorista sem perfil correspondente não entra na seleção. |
| Cadastrar motorista | `src/features/dispatch`, página em etapas `/dashboard/dispatch/register/driver` | `POST /motoristas` | API, ação do operador (papel `cco`) | JSON `{"nome","email","telefone_e164"}`; o painel exige e-mail para que o perfil `driver` seja criado na mesma transação e o motorista entre na lista. 409 = e-mail já cadastrado. Sem repetição automática; ao voltar ao despacho, a lista é recarregada. |
| Cadastrar operador do CCO | `src/features/dispatch`, página em etapas `/dashboard/dispatch/register/operator` | `POST /usuarios` | API, ação do operador (papel `cco`) | JSON `{"nome","email"}`; devolve o perfil `cco` no formato de `GET /usuarios`, que passa a aparecer no login. 409 = e-mail já usado por perfil ou motorista. Sem repetição automática; ao voltar ao despacho, a lista de operadores é recarregada. Na Demo, o mesmo formulário grava no cadastro local. |
| Publicar rota | `src/features/dispatch` | `POST /rotas` | API, ação do CCO | Origem, destino, recebedor, carga positiva, placa/NF/janela e `motorista_id` de um usuário motorista já cadastrado; caminho linear gerado no backend. Cada ponto exige lat/lng válidos e pode trazer `endereco` e `geo` (vínculo da coordenada), gravados em `origem_endereco`/`origem_geo` e `destino_endereco`/`destino_geo`. |
| Buscar endereço | `src/features/dispatch` (cadastro de viagem) | `GET /geocodificacao?q=` | API, papel `cco` | Devolve `provedor`, `atribuicao` e até 5 candidatos `{id,endereco,lat,lng,tipo}`. O CCO escolhe um; a publicação envia `endereco` e `geo {fonte:"geocodificacao",provedor,id,endereco}` junto de lat/lng. 503 = geocodificação desligada, 502 = provedor falhou; nos dois casos o painel oferece coordenada manual (`geo.fonte:"manual"`). Sem nova tentativa automática. Provedor padrão: Nominatim/OpenStreetMap, que recebe o endereço digitado (1 req/s, cache de 24 h). |
| Cancelar viagem | `src/features/dispatch` (editor da rota) | `POST /rotas/{rota_id}/cancelar` | API, ação do CCO (papel `cco`) | JSON `{"motivo","por"}`, motivo de 3 a 500 caracteres. Só de `publicada` a `aproximando`; `no_destino`, `descarregada` ou `cancelada` → 409. Status final `cancelada` com `cancelada_em`, `cancelada_por` e `cancelamento_motivo`; publica `rota_cancelada` (`TripCancelled`). Chegada, descarga e atribuição posteriores → 409; GPS é ignorado. Sem repetição automática. |
| Atribuir motorista | `src/features/dispatch` | `POST /rotas/{rota_id}/atribuir` | API, ação do CCO | JSON `{"motorista_id":1}` somente para item da seleção de usuário persistido; publica `rota_atribuida`. IDs numéricos do backend. |
| NF-e/CT-e da viagem | `src/features/trips` | `GET /api/documents?tripId={id}` | API com conteúdo MOCK | Metadados `mock:true`, `fileUri:null`; não são arquivos fiscais enviados pelo CCO. |
| Pedidos e respostas da central | `src/features/trips` | `GET /rotas/{rota_id}/solicitacoes`, `POST /rotas/{rota_id}/solicitacoes` | API | POST `{"pergunta":"..."}` pode fazer o backend falar com o motorista pela sessão existente. |
| Chamados do motorista | `src/features/tasks` | `GET /cco/chamados?abertos=true`, `POST /cco/chamados/{id}/responder` | API, ação do CCO | O painel mostra chegada/ocorrência, km/BR, tentativas e oferece resposta. A resposta é persistida e falada ao motorista; o backend encerra após 5 lembretes de 30 s. |
| Listar/upload de anexos | `src/features/dispatch` | `GET /rotas/{rota_id}/arquivos`, `POST /rotas/{rota_id}/arquivos` | API, binário real | POST multipart `arquivo`, categoria/descrição opcionais; sucesso 201. Independente das notas MOCK. |
| Download de anexo | `src/features/dispatch` | `GET /rotas/{rota_id}/arquivos/{arquivo_id}/download` | API, binário real | Arquivo da rota com Content-Disposition attachment, MIME validado e nome sanitizado. |

Após uma ação, o painel reconcilia o estado/lista correspondente com o servidor. No Dashboard, clicar em um alerta API da viagem abre o compositor destacado **Mensagem do operador**; o mesmo `POST /rotas/{rota_id}/mensagens` é usado, sem um segundo canal ou entrega simulada. POSTs não são repetidos automaticamente; durante a pendência, o controle evita envio duplicado. Uma falha mantém o erro visível. O frontend não simula confirmação, descarga, novos contatos ou o valor resultante.

O snapshot limita **Tasks, estadias, ligações e ocorrências a 20 registros por coleção** e **eventos a 50**; as rotas não têm esse limite. Os endpoints de lista ampliam a janela disponível, mas não oferecem a população completa necessária aos indicadores históricos. Se uma lista ou detalhe devolver 404/405, o cliente preserva o dado disponível no snapshot da API; não o completa com MOCK. Outros erros mantêm a falha visível.

## Contratos parciais e recursos sem API completa

| Funcionalidade | Caminho no frontend | Endpoint atual | Status | Pendência |
|---|---|---|---|---|
| Série temporal e estadia cobrada | `src/features/metrics` | Não há esses campos em `/api/metrics` | Indisponíveis no modo API | Não fabricar gráficos/valor cobrado nem derivá-los dos snapshots limitados. |
| Histórico sintético das 63 entregas | `src/services/mock/history.ts` | Não corresponde ao histórico do backend | Exclusivo da Demo | Não somar a seed 42 às entregas da API. Consulta completa de viagens/histórico é pendência própria. |
| SSO e autorização reais | `src/features/auth` | `/auth/sso` existe, mas é MOCK | Pendentes | Token fake não verifica motorista, empresa ou permissão de acesso. |
| NF-e e CT-e da viagem | `src/features/trips`; modelo mobile | `GET /api/documents?tripId={id}` | Metadados MOCK do backend | `mock:true`, `fileUri:null`; valores/chave sintéticos. Sem vínculo automático com arquivo original. |
| Itens detalhados e conteúdo comercial ilustrativo | `src/features/trips` | Contrato parcial nos campos da rota | Complementos MOCK identificados | Preservar campos API; não sugerir documento fiscal ou envio real a partir do conteúdo ilustrativo. |

Essas pendências são **extensões propostas**, não endpoints inventados e chamados pelo app. Não há chamadas a `/metrics`, `/receivers/ranking`, `/deliveries/history` ou `/rotas/{id}/documentos`. Os caminhos existentes são os indicados na matriz.

## Semântica dos indicadores API

`/api/metrics` é a fonte dos indicadores no modo API. Não aplicar as fórmulas da Demo sobre esses valores:

| Campo do backend | População / significado |
|---|---|
| `entregas`, `horas_paradas_media` | Estadias encerradas; a média usa somente encerradas. |
| `estadia_devida_total` | Todas as estadias, incluindo abertas; valor calculado pelo servidor. |
| `tempo_ate_acao_cco_min_media` | Tasks com `confirmado_em`, diferença desde `criada_em`. |
| `tasks_escaladas` | Eventos históricos `escalada_recebedor`; difere de Tasks atualmente escaladas da Demo. |
| `pct_recebedores_avisados` | Rotas com evento de chegada e `aviso_recebedor` anterior por ordem dos IDs persistidos. |
| `pct_ligacoes_atendidas` | Ligações cujo status não é `falhou`; atendimento vem de `atendida`. |
| `pct_reportes_completos_1a` | Reportes completos sem perguntas de complemento, dentre reportes completos. |
| `contatos_resolvidos_pelo_agente` | Eventos `resposta_recebedor`, `relatorio`, `resposta_central`; não é a estimativa de contatos evitados da Demo. |
| `latencia_voz_ms` | Tempo do LLM até o primeiro trecho, p50/p95 e amostras; não mede ASR/TTS/RTC/rede completos. |

Sem observações, médias, percentuais e percentis podem ser `null`; mostrar ausência de amostra, não zero inventado. O ranking usa `recebedor_empresa`, espera média de estadias encerradas, estadia devida total e ligações válidas. Séries diárias e valor cobrado não são fornecidos. Estatísticas do servidor não têm as mesmas populações/percentis da Demo.

## Anexos persistidos

Metadados: `id`, `rota_id`, `nome_original`, `tipo_mime`, `tamanho_bytes`, `categoria`, `descricao`, `criado_em` UTC-Z e `url_download` relativa. Categorias: `documento`, `nota_fiscal`, `comprovante`, `imagem`, `outro`. O app indexa os anexos localmente para acesso rápido e o agente responde nomes/campos apenas a partir dos documentos sincronizados.

Upload multipart exige `arquivo`; descrição tem até 1.000 caracteres. Limite padrão **10 MiB** (`ARQUIVOS_MAX_BYTES`); aceita PDF/JPEG/PNG/WebP/GIF. Respostas: 201 sucesso, 413 tamanho, 415 formato e 404 rota/arquivo ausente. `arquivo_adicionado` informa metadados e a rota; o consumidor refaz a lista e baixa separadamente.

Metadados ficam no banco, conteúdo em `ARQUIVOS_DIR` (padrão `data/arquivos`; Docker `/app/data/arquivos` com volume `./backend/data/arquivos:/app/data/arquivos`). Backup exige banco e arquivos juntos. Reset operacional preserva os anexos; não há DELETE/versionamento nesta entrega. Uma interrupção abrupta pode deixar arquivo órfão; o contrato não promete atomicidade completa entre banco e filesystem.

Upload/download persiste conteúdo real, mas não registra autor autenticado nem autoriza acesso por motorista/empresa. NF-e/CT-e MOCK são independentes. O backend alterado fica no repositório [rodar-backend](https://github.com/rodarglobal/rodar-backend) (pasta `backend/`), fora deste repositório web; sua migration e volume precisam acompanhar a execução. O modelo de consumo do motorista está em [CONTRATO-MOBILE.md](CONTRATO-MOBILE.md).

## APIs existentes que o painel não expõe

| Funcionalidade do backend | Caminho no frontend | Método e endpoint | Status | Limite / motivo |
|---|---|---|---|---|
| Listar rotas diretamente | — | `GET /rotas` | Disponível, não exposta separadamente | A lista operacional vem de `/cco/estado`; este endpoint também omite `trajeto`. |
| Enviar GPS | — | `POST /rotas/{rota_id}/posicao` | Disponível, não exposta | Pertence ao celular/simulador do backend; o painel não gera posições. |
| Chegada manual | — | `POST /rotas/{rota_id}/chegada` | Disponível, não exposta | Atalho do backend; o painel acompanha os estados publicados. |
| Reset de rota | — | `POST /rotas/{rota_id}/reset` | Disponível, não exposta | Remove dados operacionais relacionados; nenhum controle da demo chama esse endpoint. |
| Iniciar ligação ao recebedor | — | `POST /rotas/{rota_id}/ligar-recebedor` | Disponível, não exposta | Pode acionar serviços externos do backend; o painel apenas lê resultados. |
| Detalhe da ligação e cliente do recebedor | — | `GET /ligacoes/{ligacao_id}`, `GET /ligacoes/atual/recebedor` | Disponíveis, não expostas | Não usados pelo CCO; respostas podem conter dados de sessão para o cliente de voz. |
| Iniciar chamada do agente | — | `POST /cco/rotas/{rota_id}/ligar` | Disponível sem botão dedicado | A mesma cascata é invocada pela ferramenta `ligar` do LLM e quando a mensagem encontra motorista offline. |
| Tokens e sessões de agente | — | `GET /token`, `GET /sessions`, `POST /sessions`, `DELETE /sessions/{sessao_id}`, `POST /sessions/{sessao_id}/speak` | Disponíveis, não expostas | Sem controles diretos no painel; atribuição e pedidos podem fazer o backend avisar uma sessão já existente. |
| Rota atual do motorista | Modelo mobile | `GET /api/route?driverId={id}`, `GET /motoristas/{id}/rota-atual` | Disponíveis para mobile | Rota não descarregada mais recente, não uma lista completa de viagens. |
| Canal WebSocket | Modelo mobile | `GET /ws` com upgrade WebSocket | Disponível, não exposto no painel | `motorista_id` acompanha atribuições; `rota_id` acompanha uma rota. O painel usa SSE. |
| Contrato de eventos do app | Modelo mobile | `GET /events`, `POST /events` | Disponíveis, não expostos no painel | DomainEvent e outbox; 409 indica chave registrada, sem garantir o efeito uma única vez. |
| Gateway LLM | — | `POST /v1/chat/completions`, alias `POST /chat/completions` | Disponível, não exposto | Consumido pelos serviços de agente, sem chamadas diretas do painel. |
| Saúde e páginas de teste | — | `GET /health`, `GET /recebedor`, `GET /teste` | Disponíveis, não expostas | Recursos auxiliares do backend, fora da navegação CCO. |

## Contratos que precisam ser preservados

- **Tempo e unidades:** tentativas do backend usam segundos (`intervalo_s`), não os minutos acelerados da demo. `eta_min` está em minutos; `distancia_m`, em metros. Os resumos de estadia usam horas e o contador publicado pelo servidor. O frontend não aplica o relógio de 1 segundo = 1 minuto ao modo API.
- **UTC:** `/cco/estado` e SSE serializam datas com `Z`. Algumas respostas diretas de modelos, como `/tasks` e `/ligacoes`, podem retornar datas sem sufixo; no backend esses valores representam UTC. O adaptador deve normalizá-los antes da formatação pt-BR/en.
- **Estadia:** `valor`, `valor_fmt`, `horas_paradas`, `franquia_restante_h`, `horas_excedentes`, `capacidade_t`, `valor_t_h` e `aceleracao` vêm do servidor. `src/utils/stay.ts` calcula exclusivamente a demo; não recalcula, substitui ou corrige valores financeiros da API.
- **Status:** rotas usam `publicada`, `planejada`, `na_origem`, `em_transito`, `aproximando`, `no_destino`, `descarregada`, `cancelada` (final, como `descarregada`: a reconciliação não a reabre); Tasks usam `pendente`, `confirmada`, `escalada_recebedor`, `concluida`; ligações usam `chamando`, `em_andamento`, `respondida`, `nao_atendida`, `falhou`. O adaptador preserva esses significados e a UI traduz seus rótulos.
- **Posição e caminho:** o celular fornece `ultima_lat`, `ultima_lng`, `ultima_posicao_em`, ETA e distância; o rastreador fornece `rastreador_lat`, `rastreador_lng`, `rastreador_em`. O mapa apresenta a fonte válida mais recente. Mensagens `fonte:"rastreador"` não alteram ETA/estado do celular. Coordenadas ausentes continuam ausentes. O `trajeto` deve ser mostrado como fornecido, sem encaixá-lo na estrada, substituí-lo por snapshot OSRM ou fabricar progresso/GPS.
- **Seed do backend:** a população idempotente complementa a base com dois CCO e quatro motoristas, duas viagens adicionais e um motorista sem viagem. A rota original tem 28 t e 41 pontos interpolados entre Jundiaí e Campinas. Os trajetos são dados fictícios lineares, não evidência de geometria rodoviária ou GPS real. Reexecutar não deve reabrir viagens ou substituir atribuições. As oito identidades e cinco trajetos locais continuam exclusivos da Demo.
- **SSE:** a primeira mensagem é `snapshot`; o servidor publica depois eventos e contadores de estadia, com intervalo de contador de aproximadamente 1 segundo. Não há `id:` SSE, cursor ou suporte a `Last-Event-ID`. O cliente refaz estado/listas ao conectar e mantém reconciliação REST a cada 15 segundos; não presume recebimento dos eventos perdidos. Durante a interrupção, identifica os dados como desatualizados.
- **Reconciliação:** respostas REST e atualizações SSE são conciliadas por entidade. Posições recebidas enquanto uma consulta está em andamento não bloqueiam a atualização de chamadas e outras coleções. A reconciliação protege confirmações de Task, rotas descarregadas e estadias encerradas contra regressão por respostas concorrentes.
- **Escopo:** fontes, traduções e fixtures da demo continuam locais. Modo API faz requisições somente ao backend configurado; Google Maps continua opcional para o mapa base. Não há Routes API nem consulta de rota por tick. O frontend usa `agora-rtc-sdk-ng` exclusivamente em `/operator`; o backend adiciona o adaptador Twilio sem expor credenciais ao navegador.

## Critérios de validação

1. O painel inicia na Demo, com ou sem URL, e mantém seus resultados reproduzíveis.
2. Ao conectar à API, a operação vem do backend, sem somar caminhões ou eventos da demo. Backend indisponível mostra erro, retry e entrada explícita na Demo.
3. Estado sem GPS não ganha coordenadas inferidas; trajeto linear do seed permanece identificado como fornecido pela API.
4. Tasks, chamadas, eventos e estadias atualizam pelo SSE; uma queda identifica dados desatualizados e a reconexão refaz as leituras.
5. **Assumir** e **Confirmar descarga** enviam somente os POSTs documentados e apresentam a resposta/erro do servidor.
6. Valores financeiros recebidos permanecem iguais, inclusive com capacidade, tarifa ou aceleração diferentes da demo.
7. Métricas/ranking API preservam as semânticas do servidor e mostram nulos sem fabricar amostras. Histórico sintético fica na Demo; SSO e conteúdo fiscal/comercial MOCK permanecem identificados em pt-BR/en.
8. A navegação não chama reset, chegada manual ou posição. Mensagem e atendimento RTC seguem os endpoints implementados, sempre com resultado visível no feed e nas decisões.
9. Publicação/atribuição usa IDs backend de perfis `driver` persistidos e vinculados; motorista sem perfil não aparece na seleção. Anexos são listados por rota e o download retorna o binário correspondente, separado dos documentos MOCK.

Os testes locais de contratos, `npm run typecheck` e `npm run build` verificam o cliente. A validação com um backend ativo deve registrar separadamente as leituras, o SSE e os POSTs executados; a existência de um endpoint não comprova configuração de serviços externos.

## Validação realizada · 22/11/2026

O banco e a API do backend foram iniciados localmente, sem túnel público.

| Verificação | Resultado observado | Limite da evidência |
|---|---|---|
| Leituras REST | `GET /cco/estado`, `/rotas/1`, `/tasks`, `/ligacoes` e `/eventos?limite=200` retornaram HTTP 200. | Valida os contratos de leitura disponíveis, sem comprovar população histórica completa. |
| SSE | Mensagens `snapshot` e `contador` observadas. | Não fornece replay; a reconexão depende de novas leituras. |
| Operação no navegador | Uma rota, motorista Carlos, carga de 28 t e NF `000.482.913`, sem GPS recebido. | Dados do backend local; ausência de GPS preservada. |
| Mapa | Google Maps base carregado com o trajeto linear de 41 pontos da API. | O trajeto do seed não representa uma geometria rodoviária validada. |
| Idiomas e fontes | pt-BR/en e identificação dos recursos MOCK conferidos no navegador. | Conteúdo de eventos e transcrições da API mantém o texto recebido. |
| Mobile, teclado e seleção da fonte | Layout em 390 × 844, aba fiscal por setas, retry e troca API → Demo → API conferidos. Demo exibiu oito veículos; API voltou a exibir somente a viagem recebida. | Viewport móvel temporário; dados operacionais não são completados com o simulador. |
| Eventos de voz | Eventos recebidos ao vivo apareceram no painel. | O painel não iniciou voz, sessão ou telefonia; a observação não comprova uma chamada telefônica completa. |
| Assumir e descarga | Payloads, respostas, pendência/erro e reconciliação verificados com transportes controlados em testes. | Nenhum desses POSTs foi executado no backend ativo, que não tinha Tasks ou estadias disponíveis para essas ações. |

A suíte local passou com **69 testes**, incluindo contratos e concorrência REST/SSE, GPS inválido, preservação dos valores financeiros, confirmação e descarga. `typecheck`, `build` e `git diff --check` passaram. O build mantém o aviso de bundle acima de 500 kB. A validação de POSTs contra um backend ativo continua pendente de um cenário apropriado; não houve reset, geração de GPS ou início de telefonia pelo painel para criar esse cenário.

Esse registro corresponde à etapa original de leitura da operação. A extensão de publicação/atribuição, métricas/ranking API, pedidos e anexos reais deve registrar seus testes e QA separadamente; a matriz acima descreve os contratos sem atribuir às extensões a validação anterior.

## Validação da extensão · 22/11/2026

- **Frontend (registro anterior à restrição de perfis):** 82 testes `node:test`, `typecheck`, `build` e `git diff --check` passaram. A cobertura então incluía publicação com motorista nulo, estados novos, GPS celular/rastreador, atribuições incompatíveis, multipart, integridade do download e ausência de retry automático.
- **Backend:** 169 testes passaram, incluindo upload/listagem/download, limites e filtros do stream mobile. Migration `b643fd18c299` aplicada; armazenamento persistente do Compose em uso.
- **Navegador (registro anterior à restrição de perfis):** motorista fictício `Motorista Demo CCO` foi provisionado, a viagem `CCO1A23` foi publicada sem motorista e depois atribuída a ele. Upload de `instrucoes-demo.pdf` com categoria `documento`, listagem e download efetivos. Nenhuma sessão de voz foi iniciada. Esse fluxo de publicação sem motorista não é mais exposto pelo painel.
- **Voz e chamada do agente:** testes controlados verificam mensagem, alerta, decisão, falha explícita `Twilio não configurado`, criação do fallback Agora e atendimento. Não houve chamada PSTN nem sessão Agora com credenciais reais nessa validação.
- **Modelo mobile:** exemplo TypeScript compilado em strict e executado contra o backend local. Login MOCK do motorista 2, viagem atual 2, lista de anexos e download conferidos; os 682 bytes do PDF corresponderam ao arquivo enviado e ao download do navegador. Snapshot WS do motorista 2 retornou somente a rota 2.
- **Interface:** programação em pt-BR/en, largura de 390 × 844 sem overflow horizontal da página, dossiê por setas e separação entre anexos reais e NF-e/CT-e MOCK conferidos. Login SSO MOCK do backend abriu a sessão `Ana (CCO)`; a opção explícita de Demo também funcionou. Métricas API mostraram ausência de amostra como `—`; ranking refletiu os recebedores do backend.

Os dados fictícios da validação permanecem no backend local. Não houve geração de GPS, reset, telefonia ou envio de pergunta por voz para preparar esse cenário. A evidência comprova o contrato de leitura mobile, não um aplicativo instalado ou autenticação de produção. O build conserva o aviso de bundle acima de 500 kB.

## Perfis e população do banco · 22/11/2026

- Migration `c921df74a130` aplicada. A base local contém **7 perfis (2 CCO e 5 motoristas), 5 cadastros de motorista e 4 viagens**, incluindo os registros que já existiam.
- A população foi repetida sem duplicação nem alteração de atribuições/status. As duas rotas e o arquivo anteriores foram preservados; o e-mail ausente do Carlos original foi preenchido pelo reconhecimento restrito do fixture legado, mantendo seu ID e sua viagem.
- `GET /usuarios` e `/api/users` retornaram o mesmo catálogo; filtros `cco`/`driver`, erro 422 para filtro inválido, login dos sete perfis e erro 404 para e-mail desconhecido foram conferidos.
- O seletor CCO carregou os perfis reais da base e abriu a sessão de Bruno. Teclado, pt-BR/en e largura de 390 px sem overflow horizontal foram verificados. A Demo local continuou disponível.
- O modelo mobile foi executado contra a API: Marina → João → Fernanda mostrou viagens distintas e depois ausência de viagem. Os WebSockets retornaram somente os dados correspondentes e foram fechados na troca.
- **180 testes backend e 96 testes frontend/modelo mobile passaram**, além de `typecheck` e `build`. O build mantém o aviso anterior de bundle acima de 500 kB.

O catálogo e a seleção continuam sendo uma demonstração de identidade. O servidor ainda não usa o token MOCK para restringir acesso aos endpoints.
