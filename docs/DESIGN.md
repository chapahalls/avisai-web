# RODAR Web · Design

Painel escuro de CCO com mapa como área principal, inspirado na referência visual de monitoramento da frota e na paleta da Agora, com identidade RODAR. Os tokens ficam no `@theme` de `src/index.css`, após `@import "tailwindcss";`; `src/cco.css` organiza o shell e o Dashboard. Não há `tailwind.config.js` nem `postcss.config.js`.

A interface identifica a fonte operacional **API** ou **Demo**. No modo API, métricas/ranking e anexos usam o servidor; SSO, NF-e/CT-e e complementos ilustrativos continuam marcados como **MOCK**. Cor ou aparência semelhante não substitui a indicação de origem.

## Tokens

| Token | Valor | Uso |
|---|---|---|
| `brand-500` | `#099DFD` | Ação primária e links |
| `brand-600` | `#0780D0` | Hover e ação pressionada |
| `brand-50` | `#E6F5FF` | Destaque suave |
| `ink-950` | `#0B1220` | Fundo da aplicação |
| `ink-900` | `#121A2B` | Cards e menu lateral |
| `ink-800` | `#1A2438` | Campos e superfícies internas |
| `ink-700` | `#2A3550` | Bordas e divisores |
| `ink-300` | `#A7B1C6` | Texto secundário |
| `ink-50` | `#F4F6FA` | Texto principal |
| `wait-500` | `#F5A524` | Espera e estadia |
| `alert-500` | `#F04438` | Escalada e falha de atendimento |
| `ok-500` | `#17B26A` | Task assumida e descarga confirmada |
| `rodar-400` | `#9BE22D` | Destaque da marca RODAR na home pública |
| `rodar-mark` | `#A2F200` | Símbolo RODAR (bloco lima com o "R" vazado); só para a marca |
| `night-950` | `#050806` | Fundo da home pública e do carregamento |
| `font-sans` | Inter, sans-serif | Texto e controles |
| `font-display` | Space Grotesk, sans-serif | Títulos, relógio e números |
| `font-brand` | Kumbh Sans 750 | Palavra "RODAR" da assinatura, só na marca |
| `font-mono` | monoespaçada do sistema | Contador e rótulos técnicos da home (sem fonte externa) |
| `radius-card` | 12 px | Cards |
| `radius-input` | 8 px | Campos e botões |

Fontes da aplicação são locais, sem requisições ao Google Fonts para carregá-las.

**Marca:** o símbolo e a assinatura ficam em `src/components/RodarLogo.tsx` (`RodarMark` e `RodarLogo`), a partir de `docs/RODAR-telas/marca/rodar-icone.svg`. O "R" do símbolo é vazado e mostra o fundo. Na assinatura, a palavra "RODAR" (Kumbh Sans 750, espaçamento 0,01 em, cor `ink-50`) tem altura de maiúscula ≈ 0,53 × a altura do símbolo e fica a ≈ 0,2 × essa altura dele. Sidebar compacta mostra só o símbolo; a sidebar larga, o cabeçalho móvel e o login mostram a assinatura. O SDK do Google Maps faz suas próprias requisições externas para o mapa. Espaçamento usa múltiplos de 4 px; números de KPIs e tempo recebem destaque sem competir com as ações da fila.

## Telas e componentes

- **Home pública (`/home`):** carregamento com anel de 120 marcações que acendem conforme o progresso, contador `[ 00 ]`–`[ 100 ]`, etapa textual (rotas, frota, CCO, pronto) e coordenadas do CCO. O progresso é anunciado como `progressbar` com valor e etapa; a cor não comunica sozinha. Na saída, o anel encolhe até o centro e o símbolo RODAR da abertura assume o mesmo lugar. Rolagem suave por Lenis, desligada com movimento reduzido.
- **Login:** card central com RODAR, contexto do CCO, e-mail no modo API, ação SSO e indicação explícita de autenticação MOCK. Carregamento/erro não vira sessão fictícia automaticamente.
- **Shell:** sidebar compacta de monitoramento; cabeçalho com fonte, conexão, relógio, idioma e perfil. Controles da simulação pertencem à Demo. O espaço principal pertence à operação da frota.
- **Dashboard:** quatro indicadores resumidos acima; painel de monitoramento em largura; fila de Tasks e eventos abaixo; resumo de desempenho ao fim. API preserva rótulos/unidades do backend: escaladas históricas, contatos resolvidos e latência LLM; nulos são `—`.
- **Monitoramento:** barra de busca/filtros, lista da frota à esquerda, mapa no centro e dossiê do caminhão selecionado à direita. Seleção pela lista, rota ou marcador destaca a mesma viagem; a busca também encontra números de nota. Na Demo, o caminho percorrido é contínuo e o restante tracejado; Seguir centraliza o caminhão e sua orientação acompanha os segmentos. No modo API, posições ausentes recebem rótulo explícito e o trajeto mantém a geometria recebida.
- **Google Maps:** mapa base real com origem e destinos. A Demo usa snapshots OSRM/OpenStreetMap e avanço simulado; API usa o `trajeto` e último GPS do backend. Uma linha fornecida pelo seed não é apresentada como caminho rodoviário validado.
- **Dossiê:** campos de rota API, NF-e/CT-e recebidas como MOCK, anexos reais e pedidos/respostas da central. Metadados fiscais sem `fileUri` não recebem download fictício; arquivos binários têm nome, categoria, tamanho e ação própria. Complementos ilustrativos mantêm selo MOCK.
- **Tasks:** status, placa, recebedor, tempo parado, estadia, tentativas e **Assumir**. API usa a contagem e o resumo do servidor, com ação pendente/erro; Demo usa suas regras locais.
- **Métricas:** Demo usa seus KPIs/gráficos; API usa indicadores do backend com atualização/erro/desatualização e amostras. Sem série temporal ou estadia cobrada, mostrar indisponibilidade em vez de gráfico preenchido por mock.
- **Recebedores:** Demo mantém espera típica/selo acima da franquia; API mostra ranking agrupado e ordenado pelo servidor, sem aplicar o selo de 300 min da Demo.
- **Alertas e ligações:** alertas do motorista mostram prioridade por texto e cor, toast e som para crítico. No Dashboard, selecionar um alerta API abre e destaca o compositor **Mensagem do operador** para a mesma viagem; o envio usa a thread persistida e a fala do agente, sem registrar uma entrega fictícia. Decisões mostram percebeu/decidiu/executou/resultado. A cascata do agente exibe Twilio, fallback Agora, atendimento ou escalada, sem inferir sucesso.
- **Viagem:** estado, motorista/destino, mapa específico, dossiê, estadia, eventos e ligações filtrados por ID. API oferece **Confirmar descarga** conforme o estado recebido, com pendência/erro visível. Viagem ausente oferece retorno ao Dashboard.
- **Rotas e anexos:** `/dispatch` publica para perfis de motorista já vinculados e permite reatribuição. Upload real tem campo de arquivo, categoria/descrição, limite/formato, pendência/erro e download por ID; ações não se repetem automaticamente. Demo identifica a indisponibilidade dessas ações do backend.

## Responsividade e acessibilidade

A sidebar usa 208 px a partir de 1440 px e uma faixa de ícones de 64 px entre 768 e 1439 px, com nomes acessíveis e tooltips. Abaixo de 768 px, a navegação fica numa faixa horizontal; idioma e controles permanecem no cabeçalho.

O monitoramento redistribui lista, mapa e dossiê em telas menores, mantendo acesso a filtros e seleção. Fila/eventos e resumo de KPIs viram menos colunas. Tabelas largas permitem rolagem sem ultrapassar a tela.

Cor nunca comunica sozinha. Fases, resultados, fontes de eventos e status têm rótulos traduzidos. Elementos interativos usam foco visível e nomes acessíveis; os marcadores de caminhão podem ser operados por teclado. O slider tem rótulo e percentual explícitos. Gráficos mostram legendas e valores com unidade.

O painel do mapa tem estados traduzidos para carregamento, chave ausente e falha do SDK. Sem chave, mostra uma visão vetorial local das mesmas geometrias e informa a limitação, mantendo lista, seleção e dossiê disponíveis. As rotas da demo são identificadas como locais; não há aviso de dependência de Routes API. A indisponibilidade do mapa não bloqueia a fila, o relógio ou as demais telas.

O modo API apresenta carregamento inicial, erro e **Tentar novamente**, sem substituir a operação pela Demo. **Usar demo** exige escolha explícita. A conexão SSE interrompida identifica o estado como desatualizado; controles não fingem avanço de GPS, estadia ou eventos recebidos. Mensagens e ações usam pt-BR/en e continuam acessíveis por teclado.

Na Demo, os controles abrem pelo botão **“Simulação”** no cabeçalho, por teclado ou clique. O painel tem borda tracejada e o título **“Controles da demo (simulação)”**; inclui pausar/continuar e chance de resposta do operador. Esses controles não alteram o backend.

## Traduções e formatos

pt-BR e inglês cobrem interface, estados, canais e resultados da Demo. Identificadores como placas permanecem iguais. Mensagens e transcrições recebidas da API preservam o conteúdo original, sem tradução inventada. Data, hora, números, percentuais e moeda usam o idioma selecionado; valores de estadia permanecem denominados em BRL e valores API não são recalculados.

O idioma inicial segue o navegador quando suportado, com fallback pt-BR. A troca no cabeçalho atualiza evidências geradas pela Demo e os rótulos próprios do painel do mapa. Os controles e textos internos do SDK Google seguem o idioma escolhido no carregamento inicial; mudar o idioma da aplicação não recarrega o SDK.
