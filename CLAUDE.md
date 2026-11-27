# AvisAI Web (CCO)

- **What:** painel do CCO do AvisAI: Tasks de chegada, escalonamento, ligações ao recebedor e métricas.
- **Stack:** React + Vite + TypeScript + Tailwind v4 + React Router + zustand + Recharts + i18next.
- **Run it:** `npm install && npm run dev`
- **Test it:** `npm run typecheck`

## Regras

1. Arquitetura feature/domínio (`docs/ARQUITETURA.md`). Uma feature só importa outra pelo `index.ts`.
2. Regras da Demo em `docs/REGRAS-DE-NEGOCIO.md`; parâmetros em `src/lib/config.ts`; cálculo da estadia local só em `src/utils/stay.ts`. No modo API, estadia, capacidade, tarifa, aceleração e contadores pertencem ao backend: não recalcular valores financeiros pela fórmula da Demo.
3. Contrato de eventos em `src/types/events.ts` é o mesmo do mobile: mudou aqui, muda lá.
4. O painel sempre inicia na Demo (`src/services/mock`), inclusive após sair; com `VITE_API_BASE_URL` preenchida, a API é escolha explícita do operador (Conectar à API). Demo e API mostram as mesmas telas e detalhes. Usar contratos de `docs/INTEGRACAO-BACKEND.md`: operação/SSE, métricas/ranking, publicação/atribuição, motoristas, documentos MOCK, pedidos e anexos reais. Sem fallback automático, repetição automática de POST, reset, GPS inferido ou início de telefonia. Em erro, retry/escolha explícita da Demo; reconexão identifica dados desatualizados. KPIs API preservam populações/nulos do backend; não fabricar série diária, cobrança ou inserir as 63 entregas mock. SSO e NF-e/CT-e permanecem MOCK; autorização real está pendente. Arquivos pertencem ao backend `/home/henry/Documents/avisai/backend`, com metadados DB e volume; preservar IDs backend e distinguir notas mock de binários. O modelo mobile está em `docs/CONTRATO-MOBILE.md`, sem promessa de replay ou efeito de eventos exatamente uma vez. Tempo/finanças API não usam o motor local. Google Maps é só mapa base; Demo usa snapshots OSRM e API usa geometria/GPS fornecidos, sem Routes API ou rota por tick. Sem chave Google, aviso traduzido e dados preservados. Mocks novos entram no README; `.env` é ignorada e chave Google pública exige restrições de referrer/API.
5. Textos sempre por i18n (`src/assets/locales`), pt-BR e en.
6. Cores só pelos tokens (`src/index.css`, `docs/DESIGN.md`). Cor nunca comunica sozinha.
7. Nada de chave ou dado pessoal real no git (E7).
8. Depois de entregar, cortar ou decidir algo aqui, rode `/registrar` antes de encerrar: o status, as decisões e a nota deste repo ficam em `rodar-ideas/repos/rodar-web/`.
