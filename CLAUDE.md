# AvisAI Web (CCO)

- **What:** painel do CCO do AvisAI: Tasks de chegada, escalonamento, ligações ao recebedor e métricas.
- **Stack:** React + Vite + TypeScript + Tailwind v4 + React Router + zustand + Recharts + i18next.
- **Run it:** `npm install && npm run dev`
- **Test it:** `npm run typecheck`

## Regras

1. Arquitetura feature/domínio (`docs/ARQUITETURA.md`). Uma feature só importa outra pelo `index.ts`.
2. Regras de negócio em `docs/REGRAS-DE-NEGOCIO.md`; parâmetros em `src/lib/config.ts`; cálculo da estadia só em `src/utils/stay.ts`.
3. Contrato de eventos em `src/types/events.ts` é o mesmo do mobile: mudou aqui, muda lá.
4. Tudo é mock (`src/services/mock`). Qualquer mock novo entra na seção "O que é simulado" do README (E8).
5. Textos sempre por i18n (`src/assets/locales`), pt-BR e en.
6. Cores só pelos tokens (`src/index.css`, `docs/DESIGN.md`). Cor nunca comunica sozinha.
7. Nada de chave ou dado pessoal real no git (E7).
