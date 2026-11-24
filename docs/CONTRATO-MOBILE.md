# RODAR · Contrato para o app do motorista

Este modelo considera o usuário mobile como **motorista**. O CCO publica/atribui a rota; o app recebe a identidade de demonstração, consulta sua rota e acompanha atualizações. Os papéis de login continuam `driver` e `cco`; `operador` é apenas uma sessão técnica do agente usada no fallback RTC e não é uma identidade de login mobile.

Os contratos foram conferidos por leitura em `rodar-backend/backend/app/api`, `servicos/{usuarios,publicacao}.py`, `dominio/documentos.py`, `infra/eventos.py` e nos exemplos `clients/tipos.ts`, `clients/react-native/useAvisaiVoz.ts` e `clients/web/avisaiStream.ts`. O exemplo é validado com transportes simulados; isso não representa validação de um aplicativo mobile instalado.

## O que já existe

| Recurso | Contrato implementado | O que o mobile recebe | Limite atual |
|---|---|---|---|
| Perfis de demonstração | `GET /usuarios?role=driver`; alias `/api/users?role=driver` | Array de `UserProfile`, com ID persistido, nome, e-mail, papel, motorista e viagem atual | Lista pública, sem token. Filtro opcional `driver` ou `cco`; inválido retorna 422. |
| Identidade | `POST /auth/sso`, JSON `{"email":"motorista@empresa.test"}` | `token` e `user: UserProfile` | Login MOCK; e-mail não cadastrado retorna 404. Token fake, sem autenticação/autorização real. |
| Cadastro do motorista | `GET /motoristas`; `POST /motoristas` fora da tela CCO web | `id`, `empresa_id`, `nome`, `telefone_e164`, `email` | Com e-mail válido, cria também perfil; sem e-mail, não aparece no seletor. E-mail em uso retorna 409. Cadastro não inicia sessão. |
| Publicação da rota pelo CCO | `POST /rotas` | Rota publicada com `motorista_id` de perfil `driver` persistido | O backend ainda aceita rotas sem motorista por compatibilidade, mas o painel CCO exige seleção de usuário cadastrado. Trajeto gerado linearmente no backend; não recebe anexos. |
| Atribuição pelo CCO | `POST /rotas/{rota_id}/atribuir`, JSON `{"motorista_id":1}` | Rota atribuída e evento `rota_atribuida` | Não existe confirmação de aceite da atribuição pelo mobile. |
| Rota atual mobile | `GET /api/route?driverId={driverId}` | Contrato camelCase descrito abaixo | Só a mais recente não descarregada; 404 quando não há rota. |
| Rota específica mobile | `GET /api/route?tripId={tripId}` | Mesmo contrato | Consulta por ID, sem verificação de propriedade no servidor. |
| Alternativa de rota atual | `GET /motoristas/{motorista_id}/rota-atual` | Contrato snake_case, incluindo `trajeto` | Não misturar seus campos com o contrato `/api/route`. |
| Documentos da viagem | `GET /api/documents?tripId={tripId}` | Metadados NF-e e CT-e | Documentos MOCK, `fileUri: null`; não há arquivo para baixar. |
| Anexos reais recebidos do CCO | `GET /rotas/{rota_id}/arquivos` | Metadados de arquivos persistidos da rota | Não substituem automaticamente NF-e/CT-e MOCK. |
| Download de anexo | `GET /rotas/{rota_id}/arquivos/{arquivo_id}/download` | Conteúdo binário, disponível como `Blob` no exemplo | App precisa adaptar salvamento/abertura ao aparelho; sem autorização real no backend atual. |
| Upload pelo CCO | `POST /rotas/{rota_id}/arquivos`, multipart `arquivo` | Metadados, HTTP 201 e evento `arquivo_adicionado` | Envio pertence ao fluxo CCO; não é necessário ao app do motorista para recebê-lo. |
| Novas atribuições | WebSocket `/ws?motorista_id={driverId}` | `{"canal":"evento","dado":EventoStream}` | Sem replay; exige refetch após reconexão. |
| Atualizações de uma rota | SSE `/cco/stream?rota_id={rotaId}` ou WS `/ws?rota_id={rotaId}` | Snapshot, eventos, Tasks, posição, falas e contador | SSE não aceita `motorista_id`; somente WS acompanha atribuições novas. |
| Mensagem da CCO | `POST /rotas/{rota_id}/mensagens` pelo painel; sessão de voz do motorista | Texto falado: remetente, mensagem e pergunta de resposta | O app deve manter a sessão Agora ativa para ouvir/falar; sem sessão ativa, o backend marca `offline` e tenta a cascata de chamada do operador. |
| Resposta à mensagem | Fala seguinte do motorista na sessão do agente | Evento `mensagem_motorista_respondida` vinculado a `mensagem_id` | O agente usa a ferramenta `responder_mensagem_motorista`; o app não envia um POST separado. |
| Timeline normalizada | `GET /events?tripId={tripId}&since={receivedAt}` | `DomainEvent[]`, incluindo `RouteAssigned` | `since` é exclusivo e temporal; não é cursor de sequência. |
| Timeline original | `GET /eventos?rota_id={rotaId}&limite=100` | `EventoStream[]` | Eventos recentes, ID decrescente; não substituir o contrato `/events` por este. |
| GPS do celular | `POST /rotas/{rota_id}/posicao` | Distância em metros, ETA em minutos, status e disparos | Envio do mobile, com permissão do aparelho; não inferir GPS de uma linha no mapa. |

O app mobile não precisa publicar rotas, atribuir motoristas, confirmar Tasks do CCO, iniciar ligação ao recebedor ou chamar reset para receber suas viagens.

## Perfis, identidade e login MOCK

`GET /usuarios` e o alias `GET /api/users` retornam um array com o mesmo formato de `user` no login. O filtro `?role=driver` seleciona motoristas; `?role=cco`, perfis da central. Sem filtro, retornam ambos. A ordem é estável por papel, nome e ID. A lista não contém tokens.

```typescript
interface UserProfile {
  id: string; // PK de Usuario serializada
  email: string;
  name: string;
  role: 'driver' | 'cco';
  driverId: number | null;
  tripId: string | null;
}
```

Um perfil `driver` tem `driverId` numérico positivo e pode ter `tripId: null`. Um perfil `cco` tem `driverId` e `tripId` nulos. O mobile apresenta os nomes retornados, mantém `id` como valor da seleção e envia o **e-mail desse perfil** para o login. Não gerar usuários por nome nem considerar que o ID de usuário é igual ao de motorista.

Resposta atual de `POST /auth/sso`:

```json
{
  "token": "mock-<identificador>",
  "user": {
    "id": "10",
    "email": "motorista@empresa.test",
    "role": "driver",
    "name": "Nome cadastrado",
    "driverId": 3,
    "tripId": "7"
  }
}
```

Os IDs acima são ilustrativos. `user.id` é a chave persistida de `Usuario`, serializada como string; **não é o e-mail nem o ID do motorista**. Use `driverId` para consultar atribuições e o `tripId` da rota atual para documentos. A viagem informada no perfil/login é uma referência do instante da consulta; não substitui a leitura autoritativa de `/api/route?driverId=...`.

O login aceita somente e-mail cadastrado e responde 404 para desconhecido. O exemplo recebe o perfil selecionado em `loginMock(profile)`, confere `id`, `email`, `role` e `driverId` na resposta e rejeita divergência. O parâmetro anterior `loginMock(email)` foi substituído intencionalmente; os chamadores devem usar o perfil obtido da lista. Isso verifica consistência da demo, sem acrescentar autorização ao servidor.

O token `mock-*` não é um token de autorização. Não tratá-lo como credencial real nem usar o ID enviado pelo cliente como prova de propriedade de viagem. Autenticação real e autorização por motorista/empresa são pendências do backend.

O seed inclui os perfis CCO Ana/Bruno e os motoristas Carlos, Marina, João e Fernanda; Fernanda começa sem viagem. Bases existentes podem conter outros perfis. A preparação idempotente e os e-mails de demonstração estão em `rodar-backend/backend/docs/PERFIS-DEMO.md`. O app deve sempre consumir a lista da API, sem fixar contagens ou IDs.

## Contrato da rota mobile

`GET /api/route?driverId=1` ou `?tripId=1` retorna:

```text
tripId: string                  driverId: number | null
status: StatusRota               assignedAt: UTC ISO | null
company: string                 driver: { name: string }
plate, invoice, cargo: string    weightT: number
unloadWindow: string
origin/destination: { name: string, lat: number, lng: number }
polyline: [lat, lng][]
receiver: { company: string, name: string, phone: string }
position: { lat: number | null, lng: number | null,
            distanceM: number | null, etaMin: number | null }
channel: string                 driverUid/agentUid: number
```

Status atuais: `publicada`, `planejada`, `na_origem`, `em_transito`, `aproximando`, `no_destino`, `descarregada`.

A consulta por motorista escolhe a rota não descarregada mais recente por data de atribuição e ID. Ela não retorna uma lista completa de viagens, sequência planejada ou histórico. Em 404, mostrar **Sem viagem atribuída**, continuar acompanhando o motorista e não usar a rota 1 como fallback.

`polyline` usa **latitude antes de longitude**. A publicação atual cria 41 pontos em linha entre origem e destino, sem rota rodoviária externa. Mostrar como fornecido pelo backend. `position` nula significa **Sem GPS recebido**; origem e início do caminho não são uma posição observada.

## Fluxo recomendado

1. Consultar `GET /usuarios?role=driver`, apresentar os perfis e selecionar pelo `id` retornado. Enviar seu e-mail no login MOCK; conferir `role: driver`, ID de usuário, e-mail e `driverId` correspondentes. O controlador não aceita perfil CCO.
2. Abrir `/ws?motorista_id={driverId}` e consultar `/api/route?driverId={driverId}`. Na abertura/reconexão e periodicamente, repetir a consulta: não depender do `tripId` recebido no login. O exemplo faz reconciliação a cada 15 segundos.
3. Com rota, validar `route.driverId === session.user.driverId`, guardar `tripId` e buscar os metadados MOCK em `/api/documents?tripId={tripId}` e os anexos reais em `/rotas/{tripId}/arquivos`.
4. Acompanhar eventos da rota via WS ou, se o ambiente tiver cliente SSE, `/cco/stream?rota_id={Number(tripId)}`. Tratar `alerta_motorista`, `mensagem_motorista_*` e `decisao_agente` como eventos de timeline; `mensagem_id` preserva a thread.
5. Ao receber `rota_atribuida`, refazer a consulta autoritativa da rota atual, documentos e anexos. Isso cobre atribuição nova e reatribuição de uma rota antes acompanhada. Atualizar a seleção e reabrir o acompanhamento por rota se seu ID mudar.
6. Em descarga, reset ou reconexão, consultar novamente a rota atual. Antes de trocar perfil, fechar WS/SSE, cancelar leituras/downloads pendentes e limpar a viagem exibida. Cada sessão/leitura recebe uma geração: respostas e callbacks antigos são descartados mesmo se o transporte não respeitar o cancelamento.
7. Durante uma desconexão, mostrar o último dado como desatualizado. Preservar valores financeiros e contadores do backend; não aplicar o relógio nem a fórmula da Demo do painel web.

Exemplo independente: [mobile-client.ts](examples/mobile-client.ts). `MobileApi` oferece `listProfiles`, login MOCK com conferência do perfil, rota atual, documentos MOCK, anexos, download `Blob` e transportes WS/SSE. `MobileController` coordena a seleção, a sessão e a viagem; uma instância deve acompanhar o ciclo de vida da tela/app. A URL e um fornecedor opcional de token são configuráveis. Enviar `Authorization` não acrescenta autenticação ao backend atual, que não valida o token MOCK.

O arquivo usa `fetch`/`Blob` e transportes injetáveis de WS/SSE, sem importar o app web ou acrescentar dependências. Pode ser conferido com TypeScript e as libs `ES2022,DOM`; os transportes precisam de adaptação para o ambiente Node/browser/native escolhido. Ele não implementa o aplicativo, voz, upload, GPS, armazenamento offline, abertura nativa de arquivo ou autenticação real.

Uso em ambiente com `WebSocket` e `EventSource` globais:

```typescript
const api = new MobileApi(config.apiUrl, { token: () => config.accessToken });
const controller = new MobileController(api, {
  socket: browserSocket,
  sse: browserSse, // opcional; remover onde EventSource não está disponível
}, {
  state: renderizarEstado,
  message: renderizarAtualizacaoDaRota,
  error: renderizarErro,
});
await controller.loadProfiles();
// A UI mostra controller.snapshot.profiles; o evento de seleção entrega o ID.
await controller.selectProfile(idDoPerfilSelecionado);
// Após escolher um anexo de controller.snapshot.journey.files:
const blob = await controller.downloadFile(arquivoIdSelecionado);
if (blob) abrirArquivoNoAparelho(blob); // null = cancelado/trocou usuário ou viagem
// Trocar usuário chama selectProfile(novoId); sair mantém o seletor disponível.
controller.logout();
// Desmontar a tela/app encerra também listagem pendente e impede reutilização.
controller.close();
```

Os nomes `config`, `renderizar*`, `abrirArquivoNoAparelho` e os IDs são entradas do app a implementar; não são campos adicionais do backend. `browserSse` é opcional onde existe `EventSource`. Sem SSE, o exemplo mantém WS por motorista para atribuições e faz refetch; o app pode adaptar um WS por rota se precisar de posição/contador em tempo real. Não criar múltiplos controladores por seleção.

Na troca de conta, `MobileController` limpa rota, documentos e anexos **antes** de aguardar o novo login. Ele fecha o WS anterior e o SSE da viagem, cancela HTTP/downloads com `AbortController` e confere a geração antes de publicar qualquer resposta. Quando somente a viagem muda, troca o SSE e cancela downloads anteriores. Uma resposta bem-sucedida de HTTP limpa a falha de leitura sem esconder WS/SSE ainda desconectados.

O download de baixo nível `api.downloadFile(tripId, fileId)` continua disponível, mas cabe ao chamador coordenar sua sessão. A UI com seleção de usuários deve preferir `controller.downloadFile(fileId)`, que aceita somente arquivo listado da viagem atual e não entrega um Blob antigo depois de troca/cancelamento.

Verificação isolada, sem rede nem efeitos no backend:

```bash
node --test docs/examples/mobile-client.test.mjs
```

O teste compila o TypeScript em diretório temporário e simula HTTP, WS e SSE. Cobre seleção por ID, inconsistência de identidade, logout durante login, respostas atrasadas de rota/anexos, filtros por viagem, download cancelado e recuperação de conexão. A suíte principal `npm test` inclui esse arquivo.

Em 22/11/2026, o modelo compilado também foi validado contra a API local em `127.0.0.1:8000`, usando HTTP e WebSocket reais: Marina → João → Fernanda. Marina e João receberam suas respectivas viagens e snapshots restritos a elas; Fernanda recebeu viagem nula e snapshot vazio. As três conexões foram encerradas, sem erros. Essa checagem fez somente leituras e três logins MOCK; não publicou/atribuiu rotas nem iniciou voz. SSE e corridas de respostas foram cobertos pelos testes com transportes simulados.

No aparelho físico, `127.0.0.1` aponta para o próprio celular. Configure `config.apiUrl` com o endereço do computador na rede local, por exemplo `http://IP-DO-COMPUTADOR:8000`, ou use o encaminhamento local apropriado ao emulador. A URL é a raiz do backend, sem acrescentar `/api`. Esta configuração é para a demo; o backend precisa de identidade e autorização reais antes de disponibilizar arquivos de usuários em produção.

## GPS do celular e do rastreador

O canal `posicao` tem duas formas distintas:

```typescript
// Celular: também informa o estado calculado pelo servidor.
{ rota_id, fonte: "celular", lat, lng, distancia_m, eta_min, status }
// Rastreador: não possui ETA, distância ou transição de estado.
{ rota_id, fonte: "rastreador", lat, lng }
```

Não preencher ETA/status com zero ou `undefined` ao receber o rastreador. O detalhe `GET /rotas/{id}` conserva o celular em `ultima_lat`, `ultima_lng`, `ultima_posicao_em` e o rastreador em `rastreador_lat`, `rastreador_lng`, `rastreador_em`. O wrapper `/api/route.position` continua representando o celular. Use a fonte e seu instante para apresentar o GPS recebido; a linha da rota não comprova a posição do caminhão.

## WS, SSE e eventos

As duas formas de transporte usam os canais `snapshot`, `evento`, `task`, `posicao`, `fala`, `contador`, `reset`. O WS usa envelope `{"canal": "...", "dado": ...}`; no SSE, o nome do canal está em `event:` e o JSON em `data:`.

O evento original de atribuição chega assim:

```json
{
  "canal": "evento",
  "dado": {
    "id": 123,
    "tipo": "rota_atribuida",
    "rota_id": 7,
    "timestamp": "2026-11-22T14:00:00Z",
    "mensagem": "Rota 7 atribuída ao motorista.",
    "dados": {
      "motorista_id": 1,
      "motoristaId": 1,
      "motorista": "Nome cadastrado"
    }
  }
}
```

Esse JSON ilustra campos do contrato, não um evento executado. Em `/events`, a mesma atribuição aparece como `type: "RouteAssigned"`, `tripId: "7"`, `source: "cco"` e `payload.motoristaId: 1`. Os dois formatos são distintos; não procurar `type` no envelope de SSE/WS.

Não há cursor/replay no WS/SSE. Ao reconectar, refazer rota/documentos e estado por rota. Para `GET /events`, deduplicar por `id`/`idempotencyKey`; como o filtro `since` usa comparação temporal estrita, uma janela sobreposta evita omitir eventos de mesmo timestamp. O transporte mobile deve fechar listeners e impedir que respostas da viagem anterior sobrescrevam a atual.

`POST /events` aceita eventos do outbox e devolve 409 para uma `idempotencyKey` repetida. O código atual grava a chave antes de aplicar o efeito de negócio: uma falha posterior pode deixar a chave registrada sem completar o efeito. Portanto, 409 significa duplicação de registro, não comprova execução do efeito uma única vez. Uma outbox mobile precisa de política de reconciliação; este exemplo é de leitura e não envia esses eventos.

Comportamentos atuais conferidos no backend:

- Sem rota atual, WS por motorista devolve snapshot e contador vazios, sem expor a operação global nesse snapshot.
- O contador consulta a rota atual a cada emissão; uma nova atribuição não exige reconexão para essa seleção do backend.
- O filtro verifica a propriedade atual da rota e retira uma viagem reatribuída do motorista anterior. Isso não é autenticação: qualquer cliente ainda pode informar um `motorista_id`.
- Não existe evento explícito de revogação/remoção da atribuição ao motorista antigo. Por isso, a reconciliação periódica refaz a rota autoritativa e limpa dados anteriores se necessário.
- O hook `useAvisaiVoz` é referência de voz/WS, não uma implementação completa de identidade, seleção de viagens e arquivos. O modelo seleciona a viagem pela leitura autoritativa e filtra payloads operacionais por rota.

## Documentos MOCK

`GET /api/documents?tripId=1` devolve dois metadados gerados a partir da rota:

| Campo | NF-e | CT-e |
|---|---|---|
| Identificação | `id`, `kind`, `title`, `number` | `id`, `kind`, `title`, `number` |
| Dados | `issuer`, `recipient`, `weightKg`, `items`, `valueBRL` | `carrier`, `plate`, `freightBRL` |
| Campos de consulta | `campos` | `campos` |
| Arquivo | `fileUri: null` | `fileUri: null` |
| Origem | `mock: true` | `mock: true` |

Pesos e parte dos campos acompanham a rota, mas valores, chave e CT-e são sintéticos. O mobile pode exibir **Documento de demonstração** e seus metadados. Esses dois registros não possuem PDF/XML/imagem para abrir; o fluxo de anexos reais abaixo é independente.

Não preencher `fileUri` com URL inventada nem associar uma NF-e/CT-e MOCK a um anexo somente pela categoria ou nome. Vínculo fiscal entre metadados e arquivo original ainda exige contrato próprio.

## Anexos reais recebidos do CCO

O endpoint `GET /rotas/{rota_id}/arquivos` retorna uma lista:

```text
id: number                   rota_id: number
nome_original: string        tipo_mime: string
tamanho_bytes: number        categoria: documento | nota_fiscal | comprovante | imagem | outro
descricao: string | null     criado_em: UTC ISO com Z
url_download: string         caminho relativo ao backend
```

O CCO envia multipart a `POST /rotas/{rota_id}/arquivos`, com campo **`arquivo`** obrigatório, `categoria` opcional (padrão `documento`) e `descricao` opcional, com até 1.000 caracteres. Sucesso devolve HTTP 201 e os metadados do arquivo.

O limite padrão é **10 MiB**, configurável no backend por `ARQUIVOS_MAX_BYTES`. Formatos permitidos: PDF, JPEG, PNG, WebP e GIF. Erros previstos: 413 para tamanho, 415 para formato e 404 para rota/arquivo ausente. Não há upload XML neste contrato.

O download usa `GET /rotas/{rota_id}/arquivos/{arquivo_id}/download`, com nome sanitizado em `Content-Disposition: attachment`, MIME validado e `nosniff`. Os IDs são numéricos do backend; não usar prefixos do store web como `api-route-1`.

Após upload, o servidor publica `canal: "evento"`, `tipo: "arquivo_adicionado"`, `rota_id` e:

```json
{
  "arquivo_id": 3,
  "nome_original": "comprovante.pdf",
  "categoria": "comprovante",
  "tipo_mime": "application/pdf",
  "tamanho_bytes": 12345
}
```

O evento sinaliza alteração; o app refaz a listagem da viagem selecionada. Em `/events`, aparece como `type: "TripFileAdded"` e `source: "cco"`. Não contém o binário nem confirma recebimento pelo motorista. Em reconexão, consultar a lista completa de anexos disponíveis, já que não há replay.

O exemplo disponibiliza `listFiles(tripId)` e `downloadFile(tripId, fileId): Promise<Blob>`. O app decide como guardar/abrir o binário, usando nome e MIME dos metadados. O backend atual não registra `createdBy` autenticado nem verifica permissão por identidade; a referência ao motorista é um filtro de produto, não proteção de acesso.

Metadados são persistidos no banco e os binários em `ARQUIVOS_DIR` (padrão `data/arquivos`), com volume do Compose em `/app/data/arquivos`. Reset operacional preserva anexos; não existe DELETE nesta entrega. Backup/restauração precisam manter banco e conteúdo juntos.

Pendências propostas, não tratadas como implementadas:

| Contrato a definir | Campos/regras mínimos propostos |
|---|---|
| Identidade e autorização | Verificar motorista/CCO, empresa e propriedade da viagem no servidor; registrar autor autenticado. |
| Entrega protegida | Autorização de download, política de URL temporária e comportamento offline. |
| Vínculo fiscal | Associar documento original e metadados extraídos, preservando a origem e versão. |
| Alteração/remoção | Definir API e eventos de alteração/remoção/versionamento; o contrato atual cobre adição. |
| Confirmação de recebimento | Somente se necessária ao produto; distinguir baixado, aberto e recebido, sem presumir confirmação por listar metadados. |

Essas extensões precisam de contratos próprios; o exemplo só chama as APIs de listagem/download documentadas.

## Aceitação da implementação mobile

- A lista mostra somente perfis `driver`, identificados pelo ID persistido de usuário; login retorna o mesmo usuário e `driverId`. E-mail desconhecido recebe 404.
- Perfil CCO, motorista sem vínculo ou identidade divergente são rejeitados. Saída/troca de conta limpa viagem, documentos e streams antes do novo login.
- Sem rota, o app mostra esse estado; não exibe rota global, rota 1 ou dados anteriores.
- Publicação/atribuição pelo CCO atualiza a seleção após WS/refetch. Troca de rota atualiza documentos e fecha o acompanhamento anterior.
- Sem GPS, não há marcador apresentado como localização observada. Geometria linear mantém sua identificação.
- Reconexão refaz leituras e mantém fonte/desatualização visíveis; resposta atrasada da viagem anterior é descartada.
- NF-e/CT-e MOCK aparecem sem botão de download de arquivo inexistente.
- Upload do CCO produz anexo listado por viagem; evento/refetch atualiza a lista e o download retorna o binário correspondente.
- Troca de motorista/viagem impede que leitura atrasada de rota/anexos ou callback antigo de WS/SSE substitua a seleção atual. Downloads cancelados não abrem arquivos da conta anterior.
- Falha HTTP recuperada atualiza o estado de leitura, preservando o aviso enquanto WS/SSE permanecerem desconectados. O app não chama alteração, remoção ou confirmação de recebimento ainda propostas.

O endereço `127.0.0.1` aponta para o próprio aparelho no mobile. Configure uma URL alcançável pelo dispositivo/emulador; isso não exige criar túnel público. Nunca incorporar certificados, segredos de serviço ou credenciais de telefonia ao app.
