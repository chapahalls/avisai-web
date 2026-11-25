---
name: rodar-web-maintenance
description: Ajustar regras de simulação, métricas, telas e traduções do painel CCO AvisAI Web. Use em manutenção deste repositório; não é uma skill para criar outros produtos ou operar serviços reais.
---

# AvisAI Web · Manutenção

Preserve o objetivo da alteração solicitada e a demonstração local do AvisAI. Não recrie o scaffold para fazer um ajuste. Integração real e publicação devem corresponder ao escopo solicitado; a existência desta skill não autoriza essas ações. Preserve a stack documentada ao escolher dependências.

## Localize o contexto

Identifique a raiz do repositório atual pelo Git e confirme `name: rodar-web` no `package.json`. Os links abaixo são relativos à localização versionada desta skill em `.agents/skills/rodar-web-maintenance`; leia os arquivos correspondentes na raiz encontrada, não um caminho absoluto de outra máquina.

Leia apenas a documentação relacionada à mudança:

- Domínio, relógio, Tasks, ligações ou histórico: [regras da simulação](../../../docs/REGRAS-DE-NEGOCIO.md).
- Contratos, importações, KPIs ou agregações: [arquitetura e fórmulas](../../../docs/ARQUITETURA.md).
- Layout, acessibilidade, tokens ou idioma: [design](../../../docs/DESIGN.md).
- Execução, decisões da demo e limites atuais: [README](../../../README.md).
- API, programação de viagens, anexos e pendências: [integração backend](../../../docs/INTEGRACAO-BACKEND.md).
- Identidade, viagem atribuída e arquivos no celular: [contrato mobile](../../../docs/CONTRATO-MOBILE.md) e [modelo TypeScript](../../../docs/examples/mobile-client.ts).

Confronte a documentação com a implementação atual. Se houver divergência, resolva no escopo solicitado e atualize o documento afetado; não transforme uma suposição histórica em requisito novo.

## Oriente a alteração

- Preserve as entradas públicas `features/*/index.ts` e a direção de dependências documentada. Coloque uma regra compartilhada no dono atual, evitando versões diferentes do cálculo de estadia ou dos agregados.
- Mantenha API e Demo separadas. Na API, preserve valores financeiros, métricas nulas, IDs numéricos de viagem e as fontes de GPS celular/rastreador. Não use dados da Demo para completar respostas do servidor. POSTs não recebem repetição automática; publicação e atribuição devem reconciliar o estado mesmo depois de falhas.
- Anexos enviados pelo CCO são binários persistidos no backend, separados de NF-e/CT-e MOCK. Mantenha multipart, limite e categorias do contrato, download por IDs na base configurada e atualização do modelo mobile. Login MOCK não representa autorização real.
- Mudanças do simulador devem manter coerentes eventos, Task, viagem, ligação e entrega concluída. Verifique o efeito na demo de dois minutos e nas populações usadas pelos KPIs; sorteios de uma área não devem acoplar-se ao histórico ou a outro caminhão.
- UI e evidências geradas devem funcionar em pt-BR e en, inclusive resultados, transcrições, canais e formatação. Mantenha estados legíveis sem depender de cor e controles de navegação/demo acessíveis em telas pequenas.
- Mantenha dados fictícios e execução sem chaves ou serviços externos enquanto esse for o escopo. Não introduza requisições de fonte, mapa, autenticação ou telefonia para completar um mock.

## Valide o comportamento

Use os scripts existentes de `package.json`. Para mudanças de domínio ou métricas, ajuste testes `node:test` que verifiquem a regra observável e suas fronteiras; não teste apenas a redação da implementação. Rode `npm test`, `npm run typecheck` e `npm run build` quando a alteração atingir o código.

Para programação/anexos, valide publicar → atribuir → enviar → listar/baixar com dados fictícios e confira a leitura pelo modelo mobile. Não acione voz ou telefonia real para preparar um teste.

Para UI/i18n, verifique a tela afetada em ambos os idiomas e numa largura móvel; para escalonamento, verifique também pause, resposta 0%/100% e Assumir após escalada. Atualize somente a documentação que a mudança tornou incorreta e relate o resultado das verificações e as limitações reais.
