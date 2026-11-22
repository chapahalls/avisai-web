# AvisAI — Design system

Inspirado na Agora (azul oficial **#099DFD**, superfícies escuras). O produto é o AvisAI: não usar o logo da Agora como se fosse nosso; o selo "Powered by Agora" só conforme as regras de marca da Agora. Os mesmos tokens valem no mobile (NativeWind, `tailwind.config.js`) e no web (Tailwind v4, `src/index.css`).

## Cores

| Token | Hex | Uso |
|---|---|---|
| `brand-500` | `#099DFD` | ação primária, microfone ativo, links |
| `brand-600` | `#0780D0` | pressionado, fala do motorista |
| `brand-50` | `#E6F5FF` | destaque no tema claro |
| `ink-950` | `#0B1220` | fundo |
| `ink-900` | `#121A2B` | cards |
| `ink-800` | `#1A2438` | campos, fala do agente |
| `ink-700` | `#2A3550` | bordas |
| `ink-300` | `#A7B1C6` | texto secundário |
| `ink-50` | `#F4F6FA` | texto principal |
| `wait-500` | `#F5A524` | espera, estadia correndo, rede fraca |
| `alert-500` | `#F04438` | escalonamento, não atendeu, sem rede |
| `ok-500` | `#17B26A` | confirmado, descarga, sincronizado |

Regra: cor nunca comunica sozinha. Todo estado tem texto ao lado.

## Tipografia

- Texto: Inter (no mobile, fonte do sistema até carregar a Inter).
- Números grandes (contador, KPIs): Space Grotesk.
- Escala: 12 / 14 / 16 / 20 / 28 / 40 / 48.

## Forma

- Raio: 8 (inputs, botões), 12 (cards), 999 (microfone, badges, chips).
- Espaçamento: múltiplos de 4; telas com padding 16.

## Componentes-chave

| Componente | Comportamento |
|---|---|
| Botão do microfone | 80 px, redondo. Toque = falar; toque com o agente falando = **interromper** (barge-in) |
| Indicador de voz | `pronto` → `ouvindo` → `pensando` → `falando` → `interrompido`, com a latência em ms |
| Transcrição | balões: agente à esquerda (`ink-800`), motorista à direita (`brand-600`) |
| Banner de rede | topo da tela: "Sem conexão · 3 na fila" / "Rede fraca: só eventos críticos" |
| Contador de espera | número grande; fica âmbar depois da franquia e mostra a estadia em R$; barra de tentativas ao CCO (1/3, 2/3, 3/3) |
| Card do recebedor | badge: não avisado / ligando… / doca 4, 15:00 / não recebe hoje / não atendeu |
| Controles da demo | borda tracejada para deixar claro que é simulação: rede, CCO responde, +1 h |
