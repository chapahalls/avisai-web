<p align="center">
  <img src="docs/RODAR-telas/marca/rodar-icone.svg" alt="Marca RODAR" width="72" />
</p>

<h1 align="center">RODAR</h1>

<p align="center">
  <a href="https://github.com/rodarglobal/rodar-web/actions/workflows/ci.yml"><img src="https://github.com/rodarglobal/rodar-web/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://rodar-web-beta.vercel.app/home"><img src="https://img.shields.io/badge/deploy-vercel-black?logo=vercel" alt="Deploy na Vercel" /></a>
</p>

<p align="center">
  <strong>O agente de voz que conecta motorista, recebedor e central de operação (CCO).</strong><br />
  Este repositório é o <strong>site público</strong> e o <strong>painel web do CCO</strong>.
</p>

<p align="center">
  <img src="docs/assets/readme/tour.gif" alt="Tour do RODAR: a home 3D explica o agente no celular do motorista, o aviso ao recebedor e o mapa; depois o painel do CCO mostra a frota ao vivo, um alerta escalado assumido com um clique, a linha do tempo da viagem com transcrição e as análises de estadia" width="820" />
</p>

<p align="center">
  <sub>Gravado em modo Demo, com dados fictícios. Voz, GPS e telefonia são simulados nesta gravação.</sub><br />
  <sub>▶️ <a href="docs/assets/readme/tour.mp4">Ver em vídeo (MP4, 1280 px, 1 min 9 s)</a></sub>
</p>

## Para o júri

| | |
|---|---|
| **Trilha** | Logística & automação |
| **Em uma frase** | Um agente de voz que avisa o recebedor antes da chegada, conta a estadia do caminhão parado (Lei 11.442) e só chama a central quando alguém precisa decidir. |
| **Demo no ar** | [rodar-web-beta.vercel.app/home](https://rodar-web-beta.vercel.app/home): site e painel do CCO no modo Demo, com deploy automático na Vercel (clique em **Entrar com SSO**) · [app do motorista no navegador](https://rodar-web-beta.vercel.app/mobile-web) |
| **Ver sem instalar nada** | [tour em vídeo de 1 min](https://github.com/rodarglobal/rodar-web/blob/main/docs/assets/readme/tour.mp4) do site e do painel · [tour do app do motorista (1 min)](https://github.com/rodarglobal/rodar-mobile/blob/main/docs/assets/readme/tour.mp4) · [validação ponta a ponta com a api real: 33 de 33 etapas](https://github.com/rodarglobal/rodar-backend/blob/main/evidence/validacao.md) · [telas do app](https://github.com/rodarglobal/rodar-mobile#telas-do-aplicativo) |
| **Repositórios** | [rodar-backend](https://github.com/rodarglobal/rodar-backend) · [rodar-web](https://github.com/rodarglobal/rodar-web) (este) · [rodar-mobile](https://github.com/rodarglobal/rodar-mobile) |
| **Qualidade** | CI configurado neste repositório (lint, typecheck, testes e build a cada push/PR na `main`, veja o badge no topo) · deploy contínuo na Vercel · 724 testes automatizados: 438 no backend, 146 no web, 140 no mobile · [teste ponta a ponta no celular](https://github.com/rodarglobal/rodar-mobile/blob/main/docs/E2E-CELULAR.md) (app nativo + voz LiveKit real + este backend + CCO, 20 de 20 etapas) |
| **Segurança** | JWT assinado no login, papel `cco` nas ações da central, CORS restrito, segredo do LLM e limite de ligações ([detalhes](https://github.com/rodarglobal/rodar-backend#segurança)) |
| **O que é simulado** | login sem senha, GPS da rota, documentos fiscais e o modo Demo do painel: [lista completa](#o-que-é-simulado) |
| **Glossário** | **CCO**: a central de operações da transportadora · **recebedor**: quem descarrega (CD, atacado, loja) · **doca**: o portão de descarga · **estadia**: o valor que a lei manda pagar pelo caminhão parado além de 5 h (a **franquia**; Lei 11.442) · **geocerca**: o raio em volta do destino que marca a chegada · **Task**: o pedido que o CCO precisa responder |
<!-- Vídeo de 3 min do Hack Brasil: incluir a linha aqui antes de 30/11. -->

## Por que importa

- **11h40 parado num CD.** Na Grande SP, a descarga levou 5h09 em média em 2025, a maior em 10 anos, e 11h40 nos centros de distribuição ([IER 2025, IPTC/SETCESP](https://setcesp.org.br/noticias/a-demora-que-compromete-a-eficiencia-2/), 175 recebedores).
- **9 em cada 10 não recebem pela espera.** 91% dos caminhoneiros autônomos que esperam mais de 5 h não recebem a estadia, embora a lei a garanta ([CNTA 2025](https://mundologistica.com.br/noticias/caminhoneiros-autonomos-aceitam-frete-abaixo-do-piso-por-necessidade), 2.002 autônomos; amostra não probabilística).
- **Ninguém registra o tempo parado.** Sem hora de chegada provada, não há o que cobrar. E a central acompanha a frota por telefone, caminhão por caminhão.

**Quanto vale, por entrega:** uma carreta de 30 t que espera 11h40 num CD tem 7 h além da franquia: 7 h × 30 t × R$ 2,50 ([valor da ANTT](https://mundologistica.com.br/noticias/antt-reajusta-estadia-tempo-adicional-carga-descarga)) = **R$ 525 de estadia**. Numa frota de 50 carretas com uma entrega assim por semana, são cerca de **R$ 113 mil por mês** de estadia devida que hoje não é cobrada por falta de prova (estimativa nossa, com as premissas acima).

**O que o RODAR muda:** o recebedor sabe da chegada antes e prepara a doca; cada hora parada vira um registro com horário do servidor; a estadia devida aparece em R$ no painel; e o CCO só é chamado nas exceções, numa fila ordenada por severidade.

## Para que serve

O motorista fala com o AI pelo celular, sem digitar. O AI avisa o recebedor antes da chegada, acompanha a espera na doca e só chama a central quando alguém precisa decidir.

| | Pilar | Como o RODAR entrega |
|---|---|---|
| 📈 | **Escalável** | Toda mudança vira evento: viagem, aproximação, ligação, Task, descarga. O backend é dono do estado e transmite ao vivo (SSE). O painel e o app só leem e reagem. Uma rota ou a frota inteira usam o mesmo fluxo, sem ninguém ao telefone por caminhão. |
| 🔇 | **Menos comunicação com a central** | O AI pede status ao motorista por voz, liga para o recebedor e registra as respostas. O CCO recebe só exceções, numa fila ordenada por severidade: recebedor que não atende, ocorrência, espera acima da franquia. |
| 📍 | **Rastreio completo da mercadoria** | Da retirada à descarga, cada viagem guarda posição, paradas, ocorrências, ligações transcritas, mensagens, documentos e decisões do agente, numa linha do tempo filtrável. |
| ⏱️ | **Menos estadia na entrega** | Na Demo, o aviso simulado ocorre a 8 km do destino. No modo API, o backend usa o ETA configurado na rota (15 min por padrão) e só liga se a telefonia estiver configurada. Na chegada, o contador de estadia começa (franquia de 5 h, Lei 11.442) e as Análises mostram espera média, avisos antecipados e estadia devida. |

## Como funciona

O fluxograma abaixo mostra uma viagem do início ao fim. No GitHub, use os controles do diagrama para ampliar e arrastar. Em seguida, abra cada etapa para ver a tela correspondente.

```mermaid
flowchart TD
  P["🖥️ 1 · CCO publica a rota<br/>motorista, destino, janela e documentos"]:::cco
  R["🚚 2 · Motorista recebe no celular<br/>e confirma a retirada por voz"]:::mot
  G["📍 Em rota: GPS do caminhão e do celular,<br/>paradas e ocorrências por voz"]:::mot
  O{"Precisa<br/>do CCO?"}:::ai
  X["🖥️ Alerta na fila do CCO<br/>com transcrição"]:::cco
  A{"🎙️ 3 · A 8 km<br/>do destino?"}:::ai
  L["🎙️ AI liga para o recebedor<br/>e pede doca e horário"]:::ai
  D["🏭 Recebedor confirma<br/>doca e horário"]:::rec
  C["📍 Chegada: geocerca + check-in por voz"]:::mot
  T["⏱️ 4 · Task de chegada: a estadia começa a contar<br/>CCO avisado em T+0 push · T+20 painel · T+40 ligação"]:::ai
  N{"🖥️ CCO<br/>respondeu?"}:::cco
  E["🎙️ Task escalada<br/>e nova ligação ao recebedor"]:::ai
  U["✅ 5 · Descarga confirmada<br/>por voz ou pelo CCO"]:::mot
  S["📊 6 · Estadia fechada<br/>e indicadores atualizados"]:::cco

  P --> R --> G --> A
  G -- ocorrência --> O
  O -- sim --> X
  O -- não --> G
  A -- ainda não --> G
  A -- sim --> L
  L -- atendeu --> D --> C
  L -. não atendeu: fica registrado .-> C
  C --> T --> N
  N -- sim --> U
  N -- não, T+60 --> E --> U
  U --> S

  classDef cco fill:#a2f200,stroke:#090b09,color:#090b09
  classDef ai fill:#17b26a,stroke:#090b09,color:#f6f8f6
  classDef mot fill:#f5a524,stroke:#090b09,color:#090b09
  classDef rec fill:#f6f8f6,stroke:#354037,color:#090b09
```

<sub>Cores por papel: 🟩 lima = CCO · 🟢 verde = agente de voz · 🟧 âmbar = motorista e caminhão · ⬜ claro = recebedor.</sub>

<details>
<summary><strong>1 · O CCO publica a rota</strong> (Trip dispatch)</summary>
<br />

Em `/dashboard/dispatch`, o CCO vê os motoristas cadastrados e suas viagens. A rota só pode ser editada antes da saída: publicada, planejada ou na origem. `/dashboard/dispatch/new` cadastra a viagem em 4 etapas: motorista, destino e entrega, regras do agente e documentos. O resumo estima o custo de voz no pior caso.

<img src="docs/assets/readme/dispatch.jpg" alt="Trip dispatch: motoristas cadastrados, status da viagem, rota, janela de descarga e regras do agente" width="49%" />
<img src="docs/assets/readme/dispatch-new.jpg" alt="Cadastrar viagem: quatro etapas e resumo com o custo de voz estimado" width="49%" />

<sub>Capturas em modo API, com os perfis fictícios do seed do backend.</sub>
</details>

<details>
<summary><strong>2 · O motorista fala, não digita</strong> (app e agente de voz)</summary>
<br />

O AI roda no celular do motorista. Retirada, chegada, descarga e ocorrências são confirmadas por voz, e o motorista pode perguntar sobre os documentos da rota. O GPS do caminhão é a prova forte da posição. Com sinal, a voz vai direto ao agente, sem gravação; sem sinal, o app grava cada fala e envia quando a rede volta, e o AvisAI responde depois. O app mobile fica em outro repositório, com as [telas do app](https://github.com/rodarglobal/rodar-mobile#telas-do-aplicativo); o contrato está em [CONTRATO-MOBILE.md](docs/CONTRATO-MOBILE.md).

<img src="docs/assets/readme/home-phone.jpg" alt="Home: o AI cabe no celular do motorista, na cabine do caminhão" width="49%" />
<img src="docs/assets/readme/home-truck.jpg" alt="Home: cada caminhão vira dado vivo" width="49%" />
</details>

<details>
<summary><strong>3 · Aviso ao recebedor antes da chegada</strong></summary>
<br />

Na Demo, o aviso simulado é disparado a 8 km do destino. No modo API, a aproximação segue o ETA configurado na rota (15 min por padrão) e a chamada depende da telefonia configurada. O aviso pergunta doca e horário; uma tentativa sem resposta também fica registrada.

<img src="docs/assets/readme/home-dock.jpg" alt="Home, Como funciona: o AI liga para o recebedor antes da chegada e o caminhão segue para a doca" width="49%" />
<img src="docs/assets/readme/dashboard.jpg" alt="Monitoramento: KPIs, fila de alertas, mapa da frota, veículo selecionado e a última ligação do AI com transcrição" width="49%" />
</details>

<details>
<summary><strong>4 · Task de chegada e escalonamento só quando precisa</strong></summary>
<br />

A chegada cria a Task e inicia a espera. O CCO é avisado em canais cada vez mais fortes: push em T+0, destaque no painel em T+20 e ligação em T+40. Sem resposta, em T+60 a Task é escalada e o AI liga de novo para o recebedor. **Assumir** encerra as novas tentativas. No monitoramento (`/dashboard`), a fila de alertas é ordenada por severidade e tempo.

<img src="docs/assets/readme/dashboard.jpg" alt="Monitoramento com dois alertas críticos de recebedor que não respondeu" width="80%" />
</details>

<details>
<summary><strong>5 · Rastreio completo da viagem</strong></summary>
<br />

Em `/dashboard/trips/:id` ficam o motorista e os últimos 7 dias dele, onde ele parou e uma linha do tempo filtrável (paradas, agente, CCO, recebedor) com a transcrição das ligações. A tela também traz a mensagem por voz ao motorista (API), o mapa da rota e o dossiê com documentos.

<img src="docs/assets/readme/trip.jpg" alt="Motorista e viagem: onde parou, linha do tempo com ligações e Tasks, histórico de 7 dias e mensagem ao motorista" width="80%" />
</details>

<details>
<summary><strong>6 · Estadia fechada e análises</strong></summary>
<br />

A descarga, confirmada por voz ou pelo CCO, encerra o contador. Em `/dashboard/metrics`, as análises cruzam período, recebedor, motorista e tipo de ocorrência. Mostram o funil dos avisos, ligações do agente × escaladas ao CCO por dia, espera média, estadia devida e contatos evitados, com exportação em CSV.

<img src="docs/assets/readme/metrics.jpg" alt="Análises: indicadores, funil dos avisos do agente, Agente × CCO por dia e ocorrências por tipo" width="80%" />
</details>

## Telas

<table>
  <tr>
    <td width="33%"><img src="docs/assets/readme/home-chip.jpg" alt="Home: tudo começa num chip de inteligência" /><br /><sub><b>Home</b> · <code>/home</code>: história 3D guiada pela rolagem</sub></td>
    <td width="33%"><img src="docs/assets/readme/home-map.jpg" alt="Home: cada rota do Brasil, ao vivo, num só mapa" /><br /><sub>Cada rota do Brasil num só mapa</sub></td>
    <td width="33%"><img src="docs/assets/readme/home-globe.jpg" alt="Home: do motorista ao CCO, do Brasil para o mundo" /><br /><sub>Do motorista ao CCO, do Brasil para o mundo</sub></td>
  </tr>
  <tr>
    <td><img src="docs/assets/readme/home-calculator.jpg" alt="Home: calculadora de quanto a espera custa para a frota" /><br /><sub>Calculadora de estadia (MOCK, não envia dados)</sub></td>
    <td><img src="docs/assets/readme/home-plugin.jpg" alt="Home: a RODAR se encaixa na operação do cliente, como um plug-in" /><br /><sub>Encaixa no TMS/ERP, na telefonia e no CCO do cliente</sub></td>
    <td><img src="docs/assets/readme/login.jpg" alt="Login do painel com globo 3D e rotas rodoviárias do Brasil" /><br /><sub><b>Login</b> · <code>/login</code>: SSO simulado</sub></td>
  </tr>
  <tr>
    <td><img src="docs/assets/readme/dashboard.jpg" alt="Monitoramento do CCO" /><br /><sub><b>Monitoramento</b> · <code>/dashboard</code></sub></td>
    <td><img src="docs/assets/readme/dispatch.jpg" alt="Trip dispatch" /><br /><sub><b>Trip dispatch</b> · <code>/dashboard/dispatch</code></sub></td>
    <td><img src="docs/assets/readme/dispatch-new.jpg" alt="Cadastrar viagem" /><br /><sub><b>Cadastrar viagem</b> · <code>/dashboard/dispatch/new</code></sub></td>
  </tr>
  <tr>
    <td><img src="docs/assets/readme/trip.jpg" alt="Motorista e viagem" /><br /><sub><b>Motorista e viagem</b> · <code>/dashboard/trips/:id</code></sub></td>
    <td><img src="docs/assets/readme/metrics.jpg" alt="Análises" /><br /><sub><b>Análises</b> · <code>/dashboard/metrics</code></sub></td>
    <td valign="top"><sub><b>Operador</b> · <code>/dashboard/operator</code>: atende o fallback de chamada do agente via Agora RTC.<br /><br /><code>/</code> e os endereços antigos (<code>/metrics</code>, <code>/trips/:id</code>…) redirecionam para o equivalente em <code>/dashboard</code>. <code>/dashboard/receivers</code> e <code>/dashboard/calls</code> abrem as abas das Análises.</sub></td>
  </tr>
</table>

`/mobile-web` abre uma demonstração pública e interativa do app do motorista, sem login do CCO. O roteiro inclui viagem, aproximação e aviso ao recebedor, check-in, Tasks, recados, documentos, fila e comandos de voz simulados. A simulação não envia dados à API; o áudio opcional usa a síntese de voz do navegador. A opção separada **Testar ao vivo (LiveKit)** usa o backend e o microfone quando configurados.

Na Demo do painel, `/dashboard/mobile-demo` reúne o app e o monitoramento filtrado para a viagem do motorista do tour. O tour automático de 18 etapas simula a conversa com o AvisAI, da retirada à descarga, incluindo chegada, escalonamento e atendimento pelo CCO. Ele pode ser pausado, pulado ou reexecutado; reexecutá-lo reinicia a viagem demonstrada. A bola do AvisAI pode ser arrastada ou movida pelo teclado.

## Como escala

- **Eventos, não telefonemas.** Cada transição é um evento com contrato único (`src/types/events.ts`), o mesmo do app mobile. A central acompanha a frota pelos eventos no painel em vez de ligar para cada motorista.
- **O backend é dono do estado.** No modo API, estadia, capacidade, tarifa e contadores vêm do servidor. O painel recebe um snapshot e depois acompanha o SSE, sem recalcular valores financeiros. Em uma reconexão, os dados ficam marcados como desatualizados.
- **Exceção em vez de rotina.** O agente faz as ligações repetitivas e escala só o que precisa de decisão. A carga do CCO cresce com as exceções, não com o número de caminhões.
- **Plug-in na operação do cliente.** O setup se adapta à infraestrutura existente: TMS ou ERP, telefonia, CCO e o celular do motorista.
- **Front-end por domínio.** Cada área (`monitoring`, `dispatch`, `trips`, `analytics`…) é uma feature isolada que só expõe o `index.ts`. Novas telas entram sem mexer nas outras.

## Rodar localmente

Use Node.js **22.22.3 ou superior** e npm.

```bash
npm install
npm run dev
```

Abra a URL indicada pelo Vite, normalmente `http://localhost:5173`. Sem `VITE_API_BASE_URL`, o painel roda a **Demo** no navegador. Basta clicar em **Entrar com SSO**.

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm run build
```

| `VITE_API_BASE_URL` | Origem | O que o painel usa | O que ele não inventa |
|---|---|---|---|
| vazia ou preenchida (sempre ao entrar) | **Demo** | frota, relógio, eventos, rotas rodoviárias versionadas, histórico e indicadores locais | GPS, documentos fiscais, login, ligação ou comunicação reais |
| preenchida, ex.: `http://127.0.0.1:8000`, após **Conectar à API** | **API** | rotas, GPS, Tasks, estadias, chamadas, alertas, mensagens, arquivos, métricas e ranking do backend | posição ausente, estrada, valores financeiros, histórico ou resultado de telefonia |

Se a API falhar, o painel mostra o erro e **Tentar novamente**. A troca para **Usar demo** é sempre uma ação explícita: não há fallback automático nem repetição automática de POST.

## CI/CD e deploy

- **CI (`.github/workflows/ci.yml`):** a cada push e pull request na `main`, o GitHub Actions roda lint (Biome), typecheck, testes, build e um smoke e2e com Playwright (login na Demo → painel → troca de idioma → logout, sem backend). O badge no topo do README mostra o status da última execução.
- **Deploy: só a Vercel.** [rodar-web-beta.vercel.app/home](https://rodar-web-beta.vercel.app/home) publica o painel no modo Demo a cada push na `main`, lendo `vercel.json` e servindo a partir da raiz do domínio (`base: '/'` em `vite.config.ts`). O GitHub Pages foi removido: hospedava o mesmo build num subcaminho (`/rodar-web/`) e divergia da configuração da Vercel, causando risco de deploy duplicado; a página já não respondia (404) quando foi desativada.

O deploy usa o modo Demo (sem `VITE_API_BASE_URL`): não chama uma API real.

### Voz ao vivo na Demo

O botão de conexão ao lado do seletor de visualização, em `/dashboard/mobile-demo`, e a opção equivalente no AvisAI são opcionais e independentes da simulação: para usá-los, configure `VITE_API_BASE_URL` no frontend e `LIVEKIT_URL`, `LIVEKIT_API_KEY` e `LIVEKIT_API_SECRET` no backend. A origem do Vite deve constar em `CORS_ORIGENS` (na configuração local, use `http://localhost:5173`; 5174 e 5175 não estão liberadas). Reinicie os serviços após alterar as variáveis; não coloque segredos no frontend ou no Git.

O botão consulta a configuração pública do backend. Ao conectar, usa o SSO de demonstração e um token temporário para entrar na sala e solicitar acesso ao microfone. O ícone de confirmação aparece quando um participante identificado como agente está presente; entrar na sala, sozinho, não garante uma conversa. `LIVEKIT_AGENT_NAME` permite solicitar seu despacho, mas não inicia o agente. A conexão pode ser encerrada pelo botão ou na conversa em tela cheia. O tour e a operação da Demo continuam simulados, mesmo quando a voz usa o LiveKit. Detalhes e limites estão em [INTEGRACAO-BACKEND.md](docs/INTEGRACAO-BACKEND.md).

<details>
<summary><strong>Conectar ao backend RODAR</strong></summary>
<br />

Configure a `.env` local e reinicie o Vite:

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000
```

O painel lê a operação, acompanha o SSE e consulta Tasks, chamadas, eventos, rotas, métricas e recebedores. **Assumir** confirma a Task e **Confirmar descarga** encerra a estadia no servidor. GPS, estados e valores financeiros aparecem como foram recebidos, sem a fórmula ou o relógio da Demo.

KPIs e ranking vêm de `/api/metrics` e `/api/receivers`, com populações e unidades do backend. Sem amostras, valores nulos aparecem como `—`. A API não tem série diária nem estadia cobrada: o painel informa a ausência e não usa o histórico fictício para preenchê-las.

`/auth/sso` é um login sem senha que devolve um JWT assinado. Com `AUTH_OBRIGATORIA=true` (padrão do backend), toda escrita exige esse token e as ações da central exigem o papel `cco`; o CORS aceita só as origens configuradas. `/api/documents` entrega NF-e/CT-e com `mock:true` e `fileUri:null`, separados dos anexos reais. Login de verdade, 2FA e leituras protegidas ainda faltam: veja o [README do backend](https://github.com/rodarglobal/rodar-backend#o-que-falta-para-produção).

**Rotas, motoristas e arquivos.** `/dashboard/dispatch` consulta só perfis de motorista já cadastrados. O CCO publica a rota para um deles ou troca o motorista enquanto a viagem não saiu; não há cadastro de motorista nessas telas. O CCO pode anexar arquivos reais (PDF/JPEG/PNG/WebP/GIF, até 10 MiB por padrão) e baixá-los depois. Os metadados ficam no banco e os binários no volume `ARQUIVOS_DIR` do backend; o backup precisa incluir os dois.

**Popular o banco.** No repositório do backend (`../rodar-backend`), com `db` e `api` iniciados:

```bash
docker compose exec -T api alembic upgrade head
```

```bash
docker compose exec -T api python -m app.seed
```

O seed cria dois operadores CCO e quatro motoristas de demonstração, e reexecutá-lo preserva os registros existentes. `GET /usuarios?role=cco` lista os perfis do login; `?role=driver`, os do celular.

**Alertas e voz do agente.** Cada fala do motorista gera `alerta_motorista` no stream, com tipo, resumo, transcrição e prioridade. **Enviar mensagem ao motorista** persiste a mensagem e pede que o agente a fale (`enviada`, `falada`, `respondida` ou `offline`). Sem sessão de voz, o backend inicia a cascata `ligar(operador, motivo)`: primeiro Twilio PSTN, depois Agora RTC em `/dashboard/operator`, e escalada crítica após 30 s. As credenciais ficam só no backend, nunca em `VITE_*` nem no repositório.

Mais detalhes: [matriz de integração](docs/INTEGRACAO-BACKEND.md), [modelo mobile](docs/CONTRATO-MOBILE.md) e [exemplo de cliente TypeScript](docs/examples/mobile-client.ts).
</details>

<details>
<summary><strong>Configurar Google Maps</strong></summary>
<br />

Preencha a `.env` local (copie de `.env.example`) e reinicie o Vite:

```dotenv
VITE_GOOGLE_MAPS_API_KEY=
VITE_GOOGLE_MAPS_MAP_ID=DEMO_MAP_ID
```

No Google Cloud, habilite **Maps JavaScript API** e **Routes API** (com cobrança ativa no projeto) e restrinja a chave por **HTTP referrers** e pelas duas APIs. Sem a Routes API habilitada, o traçado do modo API continua aparecendo, mas como reta entre os extremos do `trajeto`, sem encaixe na via. Variáveis `VITE_` entram no bundle: a chave é pública e depende dessas restrições. `.env` é ignorada pelo Git; nunca registre o valor no repositório.

O Google Maps é o mapa base nos dois modos. A Demo usa snapshots rodoviários OSRM versionados; o modo API usa o trajeto e o GPS do backend e, só nesse modo, pode consultar a Routes API (`Route.computeRoutes`, origem→destino do próprio trajeto, uma consulta por rota e em cache, nunca por tick) para ajustar visualmente a linha à via — sem recalcular distância, ETA, progresso ou substituir o GPS do backend. Se a chave faltar, a Routes API falhar ou não estiver habilitada, o painel mostra um aviso traduzido (sem mapa) ou mantém o traçado como veio do backend (com mapa), preservando a lista da frota e a seleção de viagens.

Referências: [Maps JavaScript API](https://developers.google.com/maps/documentation/javascript/load-maps-js-api), [começando com a Routes Library](https://developers.google.com/maps/documentation/javascript/routes/start), [segurança de chaves](https://developers.google.com/maps/api-security-best-practices), [OSRM](https://project-osrm.org/) e [OpenStreetMap](https://www.openstreetmap.org/copyright).
</details>

## O que é simulado

No modo API, a operação, os KPIs/ranking e os anexos vêm do backend. **SSO, notas fiscais e complementos comerciais continuam MOCK** e aparecem identificados assim. Os itens abaixo valem para a **Demo local**:

- **SSO:** atraso local de 600 ms e usuário fictício, sem provedor externo.
- **Frota:** oito caminhões e cinco recebedores fictícios na região de Campinas/SP. Não existe GPS real.
- **Caminhos:** cinco snapshots OSRM/OpenStreetMap versionados (obtidos em 22/11/2026). Não há consulta de tráfego.
- **Tempo:** cada segundo real avança um minuto da operação, a partir das 08:00. Pausar congela o relógio.
- **Eventos e Tasks:** aproximação, chegada, avisos, resposta do operador, escalada, ocorrência e descarga são gerados localmente.
- **Ligações:** resultado e transcrição são texto simulado, sem áudio, SIP ou chamada telefônica.
- **App do motorista:** o tour e os comandos sugeridos são simulados; o teste opcional de voz por LiveKit usa uma sala e um agente externos quando configurados.
- **Histórico:** 63 entregas fictícias (nove por dia em sete dias), com seed 42. Os indicadores não representam desempenho real.
- **Dossiê:** carga, notas fiscais e mensagens são fictícias.
- **Cobrança:** marca fictícia em cerca de 15% das entregas com estadia positiva.
- **Home:** os formulários da calculadora e de contato validam no navegador e não enviam dados.
- **Solicitações e mensagens:** a terceira tela do Monitoramento traz três chamados fictícios de motorista. Responder tira o chamado da fila; a mensagem ao motorista passa por enviada → falada (2 s) → respondida (6 s) com uma resposta fixa. Nada é enviado à API.
- **Cadastros:** em Motoristas e viagens, a Demo cadastra motoristas e operadores do CCO só em memória (oito motoristas e um operador fictícios iniciais, e-mails `.test`). Operadores novos aparecem no login da Demo; nada é enviado à API. A tela tem os mesmos cards, colunas e ações da API; os status que a Demo não simula ficam em zero.

O estado da Demo fica em memória: recarregar a página inicia outra sessão. Regras completas e parâmetros: [REGRAS-DE-NEGOCIO.md](docs/REGRAS-DE-NEGOCIO.md) e `src/lib/config.ts`. A estadia local é calculada só em `src/utils/stay.ts`:

```text
ceil(max(0, espera_em_min / 60 − 5)) × toneladas × R$ 2,50
```

## Arquitetura do front-end

### Dependências

React, Vite, TypeScript strict, Tailwind CSS v4, React Router, zustand, Recharts, i18next (pt-BR e en), three.js na home e no login, `lenis`. Os testes unitários usam `node:test`, sem biblioteca adicional; o smoke e2e usa `@playwright/test` (`npm run test:e2e`, veja `tests-e2e/`).

O navegador usa uma única lib de voz, `livekit-client`, em dois lugares: em `/dashboard/operator` (seção [Telas](#telas)), o operador atende o fallback RTC quando a ligação do agente pelo Twilio não completa (número inválido, ocupado ou sem resposta); e no botão opcional **Testar ao vivo (LiveKit)** da home/`/mobile-web` (seção [Voz ao vivo na Demo](#voz-ao-vivo-na-demo)), que demonstra a voz real do agente sem telefone. Nenhum dos dois participa da Demo nem da simulação de voz do navegador.

```text
src/
├── app/                 composição, guarda de sessão e rotas
├── pages/               telas conectadas ao roteador
├── features/            um domínio por pasta; só o index.ts é público
│   ├── home/            site público: cenas 3D, calculadora e contato
│   ├── auth/            sessão SSO MOCK
│   ├── monitoring/      KPIs, fila de alertas, veículo, última chamada, docas
│   ├── fleet/           mapa e seleção da frota
│   ├── dispatch/        motoristas, publicação, edição de rota e arquivos
│   ├── trips/           viagem, linha do tempo, conversa e dossiê
│   ├── tasks/           Tasks e solicitações do motorista
│   ├── analytics/       análises, filtros, funil e exportação CSV
│   ├── metrics/         KPIs da API
│   ├── receivers/       ranking da API
│   └── calls/           histórico de ligações
├── services/
│   ├── api/             contrato validado, REST e SSE
│   ├── operations/      seleção API/Demo e reconciliação do estado
│   ├── analytics/       métricas e ranking da API
│   └── mock/            motor, fixtures, histórico e dossiê da Demo
├── components/          layout e componentes compartilhados
├── lib/                 configuração, rotas, i18n e Google Maps
├── types/               contratos de domínio e eventos
└── utils/               geometria, estadia, formatação e rotas
```

Cada página é carregada sob demanda (`React.lazy` em `src/app/router.tsx`): o painel não baixa o three.js da home e do login, e o pacote inicial cai de 2,3 MB para cerca de 330 kB (104 kB com gzip). No modo API, o JWT do `/auth/sso` vai como `Authorization: Bearer` em todas as chamadas (`ApiClient.setAccessToken`).

As dependências seguem `pages → features → components/services/lib/utils/types`. As cores vêm só dos tokens de `src/index.css` ([DESIGN.md](docs/DESIGN.md)) e todos os textos passam pelo i18n.

## Documentação

- [Arquitetura, reconciliação REST/SSE e roteiro de demo](docs/ARQUITETURA.md)
- [Integração com o backend: APIs, MOCK e pendências](docs/INTEGRACAO-BACKEND.md)
- [Modelo mobile: identidade, rota atribuída e anexos](docs/CONTRATO-MOBILE.md)
- [Regras da simulação e problemas resolvidos pelo time](docs/REGRAS-DE-NEGOCIO.md)
- [Design e acessibilidade](docs/DESIGN.md)
- [Mockups das telas](docs/RODAR-telas/index.html)
- Skill de manutenção: `.agents/skills/rodar-web-maintenance`
- Cenas 3D da home: os `.glb` versionados em `src/features/home/assets` saem dos scripts `npm run generate:*`. Os modelos de origem (`docs/RODAR-telas/landing-page/3d-model/`, cerca de 80 MB e de terceiros) não ficam no git; para regerar os `.glb`, coloque-os nessa pasta.

## Licença e versão

[MIT](LICENSE) · **v0.1.0**

**Histórico:** o projeto começou como *AvisAI* no hackathon UNMUTE by Agora (21–22/11/2026) e continua como **RODAR** no Hack Brasil 2026, na trilha Logística & automação. Os repositórios foram criados em 22/11/2026 e todo o histórico de commits está neles; o AvisAI virou o nome do agente de voz do RODAR.

Repositórios: [rodar-backend](https://github.com/rodarglobal/rodar-backend) · [rodar-mobile](https://github.com/rodarglobal/rodar-mobile) · este (rodar-web).
