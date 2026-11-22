# AvisAI Web · CCO

Painel da central de operação (CCO) do **AvisAI**: Tasks de chegada, escalonamento, ligações do agente ao recebedor e as métricas que o agente mede. Hackathon UNMUTE by Agora (22/11/2026).

## Como rodar

```bash
npm install
npm run dev   # abre em http://localhost:5173
```

## Dependências

Node 20+. React, Vite, TypeScript, Tailwind CSS v4 (`@tailwindcss/vite`), React Router, zustand, Recharts, i18next. Lista completa no `package.json`.

## O que é simulado (E8)

- **Frota, viagens e eventos:** gerados por um simulador no navegador (1 s = 1 min).
- **Histórico de 7 dias:** fictício, com semente fixa.
- **Recebedores, placas e motoristas:** fictícios.
- **Ligações e transcrições:** geradas; a ligação real é do agente (Agora Conversational AI + SIP).
- **Mapa:** desenhado em SVG (sem Google Maps).
- **SSO:** simulado.

## Componentes preexistentes (E5)

Nenhum código anterior ao hackathon. Só as bibliotecas de código aberto listadas acima.

## Documentação

- [Arquitetura, métricas e fluxo](docs/ARQUITETURA.md)
- [Regras de negócio](docs/REGRAS-DE-NEGOCIO.md)
- [Design system](docs/DESIGN.md)

## Versão entregue

`v0.1.0` (tag `v0.1.0-entrega` quando a entrega for fechada).
