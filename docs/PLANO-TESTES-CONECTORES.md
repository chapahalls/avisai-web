# Plano de testes · Conectores TMS

Complementa [PLANO-CONECTORES-TMS.md](PLANO-CONECTORES-TMS.md). Usa o que o backend já tem: `pytest` + `pytest-asyncio`, Postgres real com `TRUNCATE` por teste (`tests/conftest.py`), `RelogioFixo` (`tests/fakes.py`) e `respx` (já em `requirements-dev.txt`) para simular os parceiros HTTP. No painel, `node:test` via `npm test`.

> Estado: **planejamento**. Contagens e resultados só entram nos docs depois de executados.

## 1. O que precisa ser provado

1. Um mesmo payload nunca cria duas rotas, duas posições ou dois envios ao parceiro com efeito duplicado.
2. Erro de negócio não é repetido sozinho; erro transitório é repetido com backoff até a DLQ.
3. Nenhum valor é fabricado: sem coordenadas, sem motorista casado ou sem status equivalente, o sistema rejeita ou abre Task, não inventa.
4. Valores de estadia enviados ao parceiro são idênticos aos do servidor.
5. Todo adapter, atual ou futuro, cumpre o mesmo contrato.
6. Segredos e PII não aparecem em banco, log ou resposta.
7. Homologação não altera rotas.

## 2. Pirâmide

| Camada | Onde | Rede/banco | Quantidade alvo |
|---|---|---|---|
| Unidade (puro) | `tests/conectores/unit/` | nenhum | ~60 |
| Contrato de adapter | `tests/conectores/contrato/` | nenhum | ~15 por adapter |
| Serviço (pipeline, worker, relay) | `tests/conectores/servicos/` | Postgres, `respx` | ~40 |
| API | `tests/api/test_integracoes*.py` | Postgres, ASGI | ~30 |
| Ponta a ponta com simulador | `tests/e2e/test_tms_sandbox.py` (marcador `e2e`) | Postgres + simulador | ~6 |
| Painel | `tests/integrations.test.mjs` | nenhum | ~15 |

## 3. Unidade

**Mapeamento (`mapeamento.py`)**
- Cada transformação da lista branca com casos válidos e inválidos (`telefone_e164` com DDD, sem DDD, com +55; `dividir` por zero rejeitado ao salvar).
- Caminho inexistente em campo obrigatório → erro com o campo canônico e o caminho JMESPath.
- Lista (`seletor_lista`) vazia, com 1 e com 50 itens; 51 itens → rejeição.
- Transformação fora da lista branca ou expressão com função não registrada → rejeição **ao salvar** o mapeamento.
- Template de saída com placeholder desconhecido → rejeição ao salvar.

**Validadores do canônico**
- Placa antiga e Mercosul; com hífen/espaço normaliza; inválida rejeita.
- CNPJ com DV válido/inválido; chave NF-e de 44 dígitos com DV mod 11 válido/inválido.
- `carga_t <= 0` rejeita; `lat` fora de [-90, 90] rejeita; datas sem timezone tratadas como UTC (mesma regra do `serial` de `infra/eventos.py`).

**Classificação HTTP (`classificacao.py`)** – tabela parametrizada com todas as linhas da seção 2.6 do plano: 200, 201, 202, 400, 401, 403, 404, 408, 409, 422, 425, 429 (com e sem `Retry-After` em segundos e em data HTTP), 500, 502, 503, 504, `httpx.ConnectTimeout`, `httpx.ReadTimeout`, erro de DNS.

**Backoff** – com `RelogioFixo`: sequência 1 min, 5 min, 15 min, 1 h, 6 h; jitter dentro de ±20 %; `Retry-After` maior que o backoff prevalece; 6ª falha → `dlq`.

**Segurança (`seguranca.py`)**
- HMAC válido, corpo alterado, timestamp fora da janela de 5 min, cabeçalho ausente/malformado, segundo segredo de rotação aceito.
- Comparação em tempo constante (usa `hmac.compare_digest`; teste confere que é a função usada).
- Máscara de CPF, telefone e e-mail em objetos aninhados e listas.
- Allowlist: host permitido, subdomínio não listado, IP privado (10/8, 172.16/12, 192.168/16), loopback, link-local, IPv6 `::1`, redirect para outro host.

## 4. Suíte de contrato (todo adapter)

Uma classe base parametrizada por adapter. Adapter novo = registrar o tipo + fornecer fixtures; se a suíte não passa, o adapter não entra.

```python
@pytest.mark.parametrize("caso", carregar_casos_contrato())   # adapters/<tipo>/casos/*.json
class TestContratoAdapter:
    def test_declara_capacidades_existentes(self, caso): ...
    def test_traduz_exemplo_valido_no_canonico_esperado(self, caso): ...   # igualdade com fixture .canonico.json
    def test_exemplo_invalido_gera_erro_funcional_com_campo(self, caso): ...
    def test_chave_idempotencia_estavel_para_o_mesmo_payload(self, caso): ...
    def test_chave_muda_quando_evento_muda(self, caso): ...
    def test_traducao_e_pura(self, caso): ...                 # sem I/O: rede bloqueada por respx assert_all_mocked
    def test_montar_saida_nao_inclui_segredo(self, caso): ...
    def test_interpretar_usa_classificacao_padrao(self, caso): ...
    def test_saida_preserva_valores_do_servidor(self, caso): ...  # estadia: valor/horas iguais aos da SaidaCanonica
```

Casos de cada adapter (fixtures fictícias, documentadas no README do backend):

| Adapter | Fixtures mínimas |
|---|---|
| `fake` | viagem completa, sem motorista, cancelamento, atualização de versão |
| `webhook_generico` | payload no formato do exemplo do plano; campo faltando; lista com 3 viagens |
| `rest_generico` | 2 páginas com cursor; página vazia; resposta 429 no meio da paginação |
| `arquivo_csv` | modelo oficial; colunas fora de ordem; separador `;` e vírgula decimal; BOM UTF-8; linha inválida no meio (as válidas seguem, a inválida vira erro com número da linha) |
| `rastreador_generico` | posição simples; entrada em cerca; posição sem placa; horário antigo |
| `edi_proceda` | NOTFIS com 2 notas; registro de largura errada; OCOREN gerado comparado byte a byte com arquivo esperado |

## 5. Serviço (Postgres + `respx`)

**Pipeline de entrada**
- Webhook novo → 1 rota `publicada`, 1 `vinculo_externo`, evento `integracao_viagem_recebida`.
- Mesmo webhook 2× → 1 rota; segunda mensagem `duplicada` apontando para a original.
- Mesmo `id_externo`, versão maior → atualiza campos; versão menor → `ignorada_desatualizada`, rota intacta.
- Atualização com rota `em_transito` mudando placa → `erro_funcional` `ROTA_EM_ANDAMENTO`; mudando descrição → aplica.
- Motorista casado por e-mail → rota `planejada` com `motorista_id`; não casado → `publicada` sem motorista, sem criar `Motorista`.
- Local sem código e sem coordenadas → `erro_funcional` `COORDENADAS_AUSENTES`; nenhuma rota criada.
- Com `geocodificar_endereco`: um candidato → rota com `geo.fonte = geocodificacao`, provedor e id; zero ou mais de um candidato → `COORDENADAS_AUSENTES`/`ENDERECO_AMBIGUO`; provedor fora do ar → `erro_transitorio` (retentativa), nunca coordenada inventada.
- Cancelamento do TMS com rota `em_transito` → `cancelada` com motivo e `por = integracao:<conector>`; com rota `no_destino` → `erro_funcional` `CANCELAMENTO_FORA_DE_HORA` + Task, rota intacta.
- Trajeto fornecido → gravado igual ao recebido (sem interpolação); ausente → comportamento atual de `publicar`.
- Conector em `homologacao` → mensagem `processada_homologacao` com canônico gravado; **zero** linhas novas em `rota`, `evento` operacional ou `vinculo_externo`.
- Corpo gravado mascarado (consulta direta ao banco não encontra o CPF do fixture).

**Rastreador**
- Placa com rota ativa → posição `fonte:"rastreador"` publicada; `eta_min`/`status` do celular inalterados.
- Placa com duas rotas ativas → usa a regra definida (mais recente atribuída) e registra aviso; placa sem rota → `erro_funcional` `ROTA_NAO_ENCONTRADA`, sem criar rota.
- Divergência celular × rastreador continua marcando `EventoGeo.status = nao_validado` (regressão de `test_central_metricas_gps.py`).

**Relay e outbox**
- Evento `chegada` → 1 linha de outbox por conector com capacidade; conector sem capacidade → nenhuma.
- Relay rodando 2× → nenhuma linha extra.
- Commits fora de ordem: transação A (id menor) commita depois de B; relay com atraso de 5 s não perde A.
- `estadia_encerrada`: corpo enviado tem `valor`, `horas_paradas`, `horas_excedentes` iguais aos de `POST /rotas/{id}/descarga` (inclusive com `capacidade_t` e `estadia_aceleracao` diferentes do padrão).

**Worker**
- Para cada classe da tabela de classificação, uma rota `respx` e a transição de estado esperada, `tentativas`, `proxima_tentativa_em`.
- 401 → conector `pausado`; mensagens seguintes do conector não são enviadas até reativação.
- Queda após o envio e antes do commit (exceção injetada) → reenvio com a **mesma** `Idempotency-Key`; simulador recebe 2 requisições com a mesma chave e responde 409 na segunda → `enviada`.
- Dois workers concorrentes (`asyncio.gather`) sobre 100 mensagens → cada uma enviada uma vez (`SKIP LOCKED`).
- Rate limit de 2 req/s → 10 mensagens levam ≥ 4,5 s no relógio fixo, sem estourar.
- `reprocessar` de `dlq` usa a versão atual do mapeamento e mantém a chave.

## 6. API

- `POST /integracoes/webhooks/{chave_publica}`: 202 novo, 200 duplicado, 401 assinatura inválida (só metadados gravados), 413 acima de 1 MiB, 415 sem JSON, 404 para chave desconhecida **e** conector desativado (mesma resposta), 503 com `Retry-After` para conector pausado. Resposta em < 200 ms com o worker parado (processamento não é síncrono).
- Assinatura calculada sobre os bytes brutos: o mesmo JSON com espaços diferentes tem assinatura diferente e é rejeitado; JSON reordenado com assinatura correta dos bytes enviados é aceito.
- Cada perfil de assinatura (`avisai`, `hmac_simples`, `api_key`, `basic`, personalizado com prefixo `sha256=` e base64) com caso válido e inválido; perfil sem timestamp não exige o cabeçalho; reenvio fora da janela com tolerância ampliada é aceito e deduplicado pela chave.
- Rotação de chave: chave antiga funciona por 24 h e depois responde 404.
- Admin: sem token → 401; papel `driver` → 403; `cco` → ok (com `AUTH_OBRIGATORIA=true`, como em `tests/api/test_auth.py`).
- `POST /integracoes` com mapeamento inválido → 422 problem+json com `errors[].field`; com `segredo` em texto no corpo → 422 (só `segredo_ref` é aceito).
- `GET /integracoes` nunca devolve `segredo_ref` resolvido nem valores de variável de ambiente.
- `POST /integracoes/{id}/testar` → devolve canônico/erros e não grava nada (contagem de tabelas antes/depois).
- `POST /integracoes/{id}/promover` sem mensagem processada com sucesso → 409.
- `POST /integracoes/{id}/importar` CSV de 500 linhas → 202 e 500 mensagens; arquivo de tipo não aceito → 415.
- `GET /integracoes/{id}/mensagens` paginado por cursor, filtros `status` e `direcao`.
- SSE `/cco/stream` publica `integracao` quando o estado muda.

## 7. Ponta a ponta com simulador de TMS

Simulador em `tests/simuladores/tms_sandbox.py` (FastAPI pequeno, também subível como serviço `tms-sandbox` no `docker-compose.yml` para QA manual). Ele assina webhooks com HMAC, guarda o que recebe e permite programar respostas (`/__programar` com status/Retry-After).

| Cenário | Passos | Esperado |
|---|---|---|
| Viagem completa | Sandbox publica viagem → posições do rastreador → `POST /rotas/{id}/posicao` do celular até chegada → `descarga` | Rota em `/cco/estado`; SSE com posição `rastreador`; sandbox recebe `chegada` e `estadia_encerrada` com valores do servidor |
| Parceiro fora do ar | Sandbox responde 503 por 3 ciclos e depois 200 | 3 tentativas com backoff, depois `enviada`; tela/endpoint mostra backlog durante a queda |
| Credencial revogada | Sandbox passa a responder 401 | Conector `pausado`, erro visível, nenhuma tentativa extra |
| Erro fiscal | Sandbox responde 422 com problem+json | `erro_funcional` com o `errors[]` do parceiro; reprocessar após corrigir mapeamento → `enviada` |
| Reenvio do parceiro | Sandbox reenvia o mesmo webhook 5× | 1 rota |
| Homologação → produção | Mesmo fluxo em homologação, promover, repetir | Primeiro sem efeito em rotas; depois com efeito |

Marcador `@pytest.mark.e2e`, fora do `pytest` padrão; roda no CI em job próprio.

## 8. Painel (`npm test`)

- Adaptador de `GET /integracoes`: preserva IDs, estados e nulos; estado desconhecido mostra “desconhecido”, não `ok`.
- Tela em modo API com lista vazia, `ok`, `degradado`, `erro`, `pausado`; cada estado tem texto e ícone (teste confere o rótulo, não só a classe de cor).
- Reprocessar/promover: um único POST por clique, controle desabilitado durante a pendência, erro do servidor visível, nenhuma repetição automática.
- Modo Demo: todos os itens marcados MOCK; adapters não implementados aparecem como roadmap.
- Chaves de i18n presentes em pt-BR e en (mesmo padrão dos testes existentes).
- `npm run typecheck` e `npm run build` limpos.

## 9. Não funcionais

- **Carga:** 100 webhooks/s por 60 s contra um backend local → p95 de resposta < 200 ms, zero perda, backlog drenado em < 2 min. 50 veículos com posição a cada 30 s por 1 h sem crescimento de memória do worker.
- **Caos:** derrubar o worker no meio de um lote; reiniciar Postgres; parceiro com latência de 15 s (acima do timeout). Nenhuma mensagem perdida ou duplicada com efeito.
- **Segurança:** varredura de segredos no repositório (sem chave real, regra E7); tentativa de SSRF pela configuração de `base_url`; replay de webhook antigo; payload com 10 MB e JSON profundamente aninhado.
- **LGPD:** consulta no banco e nos logs após o e2e não encontra CPF/telefone dos fixtures em claro.

## 10. Homologação com cliente real (checklist)

1. Payloads reais anonimizados pelo cliente, salvos como fixture de contrato do conector.
2. Conector em `homologacao` por pelo menos 3 dias úteis de operação.
3. Relatório da auditoria: recebidas, processadas, erro funcional por código, transitórios.
4. Conferência por amostragem: 20 viagens do TMS × rotas canônicas geradas.
5. Envio de saída para o ambiente sandbox do parceiro, com aceite por escrito do formato.
6. Promoção para produção registrada no conector (quem, quando, versão do mapeamento).

## 11. Dados de teste

Somente fictícios: CNPJ e chaves NF-e gerados com DV válido mas inexistentes, telefones `+55199000000xx` como no seed, placas fictícias. Nenhum payload real de cliente vai para o git sem anonimização. Fixtures novas entram no README do backend, como os mocks atuais.

## 12. Critério de pronto por fase

| Fase | Testes obrigatórios verdes |
|---|---|
| 1 | Unidade (classificação, backoff, segurança), contrato do `fake`, serviço (pipeline, relay, worker), API admin |
| 2 | + contrato `webhook_generico`, `rest_generico`, `arquivo_csv`; mapeamento; e2e “viagem completa” e “reenvio” |
| 3 | + contrato `rastreador_generico`; regressão de GPS/divergência |
| 4 | + `npm test`, `typecheck`, `build` do painel |
| 5 | + contrato `edi_proceda` com comparação byte a byte |

Em todas: suíte completa do backend (`pytest`) e do painel sem regressão, `ruff` limpo e registro em `docs/INTEGRACAO-BACKEND.md` do que foi executado e do que não foi.
