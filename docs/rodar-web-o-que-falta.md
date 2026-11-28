# rodar-web: o que falta, contra o que prometemos

Documento baseado no [relatório original do rodar-ideas](https://github.com/rodarglobal/rodar-ideas/blob/claude/quirky-faraday-s2410j/docs/rodar-web-o-que-falta.md). Estado reavaliado em 25/11/2026 no `rodar-web`, branch `feat/dashboard-components`, commit-base `1f52c23`.

**O que prometemos** está em [`ADR-0001`](https://github.com/rodarglobal/rodar-ideas/blob/claude/quirky-faraday-s2410j/adr/0001-integracao-setup-e-tres-dores.md), [`ideas/rodar.md`](https://github.com/rodarglobal/rodar-ideas/blob/claude/quirky-faraday-s2410j/ideas/rodar.md), [`ideas/demora-em-docas/descoberta.md`](https://github.com/rodarglobal/rodar-ideas/blob/claude/quirky-faraday-s2410j/ideas/demora-em-docas/descoberta.md), [`RODAR-CONTEXT.md`](https://github.com/rodarglobal/rodar-ideas/blob/claude/quirky-faraday-s2410j/RODAR-CONTEXT.md), no deck e nas regras de [`HACKATHON.md`](https://github.com/rodarglobal/rodar-ideas/blob/claude/quirky-faraday-s2410j/HACKATHON.md). Para o backend, consulte o [relatório de pendências](https://github.com/rodarglobal/rodar-ideas/blob/claude/quirky-faraday-s2410j/docs/rodar-backend-o-que-falta.md).

**Como reavaliei:** conferi o código e a documentação do `rodar-web`, o texto pt-BR/en de `src/assets/locales/home.ts`, o README, a integração e a exportação de Análises. Também conferi as mudanças de autenticação já presentes no repositório `rodar-backend`.

Os checks abaixo são os registrados no relatório original e na validação anterior desta branch; não foram reexecutados ao copiar este documento.

| Check | Resultado registrado |
|---|---|
| `npm test` | **127 passaram**, 0 falharam |
| `npm run typecheck` | Sem erros |
| `npm run lint` | Sem erros, 49 avisos |
| `npm run build` | Ok. O pacote do three.js passa de 500 kB, mas é carregado sob demanda |

Legenda: **Bloqueia** ameaça a submissão ou o primeiro desempate (H1); **Promessa** está no pitch, site ou ADR e ainda não existe; **Parcial** existe em escopo menor que o prometido; **Feito** foi verificado no produto ou corrigido nesta branch; **Ok** já foi entregue.

## Resumo: o que fazer até 30/11 às 23h59

| # | Entrega | Estado atual | Esforço |
|---|---|---|---|
| 1 | **Publicar o painel** (site + painel + `/mobile-web`) numa URL fixa | **Bloqueia** — o README ainda não informa uma demo pública; falta confirmar e registrar a URL de publicação | Baixo |
| 2 | **Corrigir o texto do site** que promete o que não existe | **Feito** — as cinco alegações da seção 4 foram ajustadas em pt-BR e en | Baixo |
| 3 | **Links da demo e do vídeo + números de impacto com fonte** no README e na home | **Parcial** — já há tour em vídeo e evidência da API; faltam a URL da demo pública, o vídeo de 3 min do Hack Brasil e fontes para números de impacto | Baixo |
| 4 | **Exportação da estadia por entrega** para o financeiro | **Pendente** — o CSV atual agrega por recebedor/motorista; falta linha por entrega com horários e valor | Médio (depende do backend) |
| 5 | **Tela de integrações** com o estado real de cada conector | **Pendente** — não há tela de integrações nem estado de conectores | Baixo |

Se só der para fazer três, faça 1, 3 e 4; o item 2 já foi concluído.

---

## 1. Submissão e nota (Hack Brasil)

| Item | Estado | Evidência atual | O que falta |
|---|---|---|---|
| Demo HTTPS publicada (S4) | **Bloqueia** | O README ainda mantém o lembrete para incluir a demo publicada; o workflow `.github/workflows/ci.yml` valida o código, mas não publica o site | Publicar site, painel e `/mobile-web` numa URL fixa e documentá-la |
| Links da demo e do vídeo no README | **Parcial** | README já liga o tour de 1 min e a evidência da API; permanece o comentário pedindo a demo publicada e o vídeo de 3 min do Hack Brasil | Incluir os dois links que faltam e remover o lembrete HTML do README |
| Números de impacto com fonte | **Promessa** | A calculadora da home usa valores de referência; não há fonte dos números de impacto no README/home | Citar pesquisa ou retirar números sem fonte |
| A demo pública mostra a IA de voz real | **Parcial** | `/mobile-web` simula a voz no navegador; a voz Agora real está no app `rodar-mobile` com backend configurado | Mostrar o modo API e a voz real no vídeo; identificar claramente o que é simulado na demo |
| Qualidade (CI, testes, tipos) | **Ok** | O relatório registra 127 testes, typecheck e build aprovados | — |

**Atenção:** publicar só o modo Demo mostra telas com dados fictícios. O vídeo deve identificar isso e mostrar o modo API e a voz real, sem sugerir que a demo está conectada a serviços que não foram configurados.

## 2. Integração: o que vendemos (ADR-0001)

| Promessa | Estado | Evidência atual | O que falta |
|---|---|---|---|
| Dashboard como vitrine da operação | **Ok** | Monitoramento, dispatch, viagem com linha do tempo e transcrição, Análises e Operador em `src/pages` | — |
| Mostrar o que está integrado e o que é roadmap | **Promessa** | Não há tela de integrações nem estado visível de conectores | Criar a tela sem apresentar integrações não implementadas como disponíveis |
| TMS/ERP, rastreador e telefonia do cliente | **Promessa** | A home agora deixa explícito que TMS/ERP e telefonia dependem de implementação/configuração específica; não há conectores padrão disponíveis | Implementar conectores ou manter a comunicação como roadmap/setup específico |

## 3. As três dores no painel

| Dor | O que o painel entrega | Estado | O que falta e por quê |
|---|---|---|---|
| **Dono / CCO** | KPIs, fila de alertas por severidade, frota no mapa, linha do tempo com transcrição e ranking de recebedores | **Ok** | — |
| **Financeiro: estadia devida** | Total e por recebedor na API; Análises exporta CSV agregado por recebedor/motorista | **Parcial** | Falta exportação **por entrega** com horário de chegada, descarga, toneladas e valor; o backend não fornece essa lista para o painel |
| **Financeiro: estadia cobrada** | Só na Demo existe uma marca fictícia em cerca de 15% das entregas | **Promessa** | O modo API não fornece série temporal nem valor cobrado; o backend não registra cobrança |
| **Caminhoneiro** | `/mobile-web` mostra o roteiro do app com voz simulada | **Parcial** | A acessibilidade por voz sem tocar na tela está no app `rodar-mobile`, não na simulação web |

## 4. Correções do texto público — concluídas

As cinco alegações apontadas no relatório original foram corrigidas em pt-BR e en, em `src/assets/locales/home.ts`. O README também distingue o gatilho de 8 km da Demo do ETA configurado na API.

| Alegação antiga | Texto/limite atual do produto | Estado |
|---|---|---|
| “A espera conta, com horário, local e **ligação gravada**” | O site agora diz que a chamada registra **a transcrição, não o áudio**, conforme a decisão de LGPD | **Feito** |
| “O AI liga para o recebimento **30 minutos antes**” | A home não promete 30 min fixos; informa que gatilho e antecedência seguem a rota. O README explica: Demo a 8 km; API usa ETA configurado, 15 min por padrão | **Feito** |
| “Com o **comprovante pronto para cobrar**” / “estadia que vira receita” | Home e FAQ esclarecem que o painel registra a espera e mostra o cálculo, mas **não gera comprovante de cobrança** automaticamente | **Feito** |
| Ligações saem pelos **números e canais que o cliente já usa** | Home condiciona chamadas ao provedor configurado e diz que o uso dos números/canais do cliente precisa ser validado no setup | **Feito** |
| Rotas, entregas e notas chegam **por integração ou importação** | Home informa que rotas são cadastradas no painel; integração/importação TMS/ERP exige implementação específica e não é recurso padrão | **Feito** |

## 5. Outros pontos

| Item | Estado | Evidência atual | O que falta |
|---|---|---|---|
| Login e autorização reais | **Parcial** | `/auth/sso` ainda é login simulado, sem senha. No backend, `AUTH_OBRIGATORIA=true` é padrão: toda escrita exige JWT, ações da central exigem papel `cco`, e o motorista só age na rota atribuída | Login real (OIDC/senha/SMS), além de proteger as leituras; GET, SSE e WebSocket continuam abertos |
| NF-e e CT-e | **Parcial (declarado)** | Metadados permanecem MOCK (`mock:true`); anexos reais enviados pelo CCO são um fluxo separado | Implementação fiscal ficou fora do escopo |
| Acessibilidade do painel | **Ok, sem auditoria** | O relatório original registra atributos `aria-*`, `prefers-reduced-motion` no login e contraste documentado em `docs/DESIGN.md` | Rodar auditoria automatizada (axe ou Lighthouse) |
| Documentação da integração | **Feito** | `docs/INTEGRACAO-BACKEND.md`, `docs/ARQUITETURA.md` e `CLAUDE.md` agora referenciam o repositório `rodar-backend` (pasta `backend/`), sem caminho absoluto de máquina | — |

---

## O que já está entregue e não precisa ser refeito

- [x] Site público com história 3D, calculadora e FAQ; login; painel de monitoramento, dispatch, viagem com linha do tempo e transcrição, Análises com CSV e Operador com Agora RTC.
- [x] Modo API (REST + SSE, com reconciliação) e modo Demo (motor local, 63 entregas fictícias), com o que é MOCK identificado na tela e no README.
- [x] `/mobile-web`: demonstração do app do motorista, sem login e com voz identificada como simulada.
- [x] i18n pt-BR/en, páginas sob demanda, tokens de cor da marca, 127 testes e CI.
- [x] Corrigir as cinco alegações sobre gravação, antecedência, comprovante, canais de telefonia e integração/importação da seção 4.

## Correções no discurso (deck e documentos)

- “512 testes” é a soma de 127 no web, 299 no backend e 86 no mobile; só afirme como validado o conjunto que foi efetivamente executado. O relatório de origem registra 127 web e 299 backend; os 86 do mobile não foram executados naquela validação.
- O dashboard é a **vitrine**: o pitch não deve parar nele (ADR-0001).
- Se a demo publicada for o modo Demo, diga no vídeo e no README que os dados são fictícios; mostre o modo API e a voz real no vídeo.
