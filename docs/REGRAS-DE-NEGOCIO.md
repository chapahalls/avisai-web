# AvisAI — Regras de negócio

Fonte: repositório de ideias (`chapahalls-ideas`): `ideas/parceiro-de-estrada/contexto-produto.md`, `problemas-e-decisoes.md` e `ajustes-pos-mentoria.md`. Este arquivo é o mesmo nos repositórios mobile e web.

## Foco

O caminhão parado em torno da janela de descarga combinada com o recebedor. O agente reduz ou prova o tempo parado. Ocorrências, documentos e pedidos da central são complementos.

## Atores

| Ator | Papel |
|---|---|
| Transportadora / CCO | cadastra rota, regras e documentos; recebe eventos e Tasks; assume casos |
| Motorista | fala com o agente pelo app; só voz com o caminhão andando |
| Agente de voz (AvisAI) | pergunta, valida, registra, avisa e escala |
| Recebedor | recebe o aviso e a ligação do agente; responde doca e horário |

## Regras

### R1. Reporte com campos obrigatórios
- Cada momento tem campos obrigatórios (retirada: carga e caminhão; check-in: estado da carga, avarias e ocorrências; descarga: confirmação).
- O agente pergunta **só o que faltou**, nunca repete o formulário.
- "Tudo certo" sozinho **não** preenche nenhum campo (critério de aceite por campo).
- Saúde do motorista **não** é coletada (saiu do produto).
- Até o time decidir, a demo faz reporte só com o caminhão parado.

### R2. Aviso prévio na aproximação
- A X km do destino (padrão 8 km), o agente avisa o CCO **e liga para o recebedor**: placa, NF e horário previsto.
- Respostas possíveis: confirma doca e horário → avisa o motorista por voz (aviso só de ida, como um GPS); não recebe hoje → aplica a regra da transportadora e avisa CCO e motorista; não atende → registra a tentativa como prova.
- Motivo: uma decisão da 3ª Turma Recursal do TJMT (jun/2026) condicionou a estadia à comunicação prévia da chegada.

### R3. Chegada e Task no CCO
- A chegada é a entrada na geocerca do destino (padrão 400 m) **e** o check-in por voz.
- A chegada cria uma Task no CCO e inicia o contador de espera.

### R4. Escalonamento
- Sem resposta do CCO, nova notificação a cada intervalo (padrão 20 min), até 3 tentativas.
- O canal sobe a cada tentativa: push → destaque no painel → ligação para a central.
- Depois de 3 tentativas sem resposta: o agente avisa CCO e motorista, **liga de novo para o recebedor** e repassa a resposta aos dois.
- Número de tentativas, intervalo e canais vêm da regra da transportadora.

### R5. Estadia
- Conta a partir da **chegada ao endereço** (não da confirmação do CCO).
- Franquia padrão de 5 h (Lei 11.442/2007, art. 11), configurável por contrato.
- Depois da franquia: horas excedentes (ou fração) × capacidade total do veículo (t) × valor por t/h. Valor vigente desde abr/2026: R$ 2,50 por t/h. **Configurável, nunca fixo no código real.**
- Termina com a confirmação da descarga (voz do motorista ou CCO).

### R6. Prova
- Cada evento guarda horário do celular (`occurredAt`) e horário do servidor (`receivedAt`).
- Chegada: GPS do celular + GPS do rastreador (simulado) + confirmação por voz. Posições divergentes → evento `nao_validado` e alerta ao CCO.
- A resposta do recebedor na ligação fica registrada na Task (prova do outro lado).
- Áudio: **decisão pendente** (só transcrição × guardar áudio). No mock, só transcrição.

### R7. Documentos
- Números (NF, peso, valor) vêm **só** dos campos extraídos, citando o documento.
- Sem campo correspondente: "não encontrei". Nunca aproximar.

### R8. Offline-first
- Toda escrita vira evento local + item na fila (`outbox`) com `idempotencyKey`.
- Sem rede: guarda. Rede fraca: envia só eventos críticos (chegada, ocorrência, descarga, resposta do recebedor).
- Envio em ordem, com nova tentativa crescente (2 s, 4 s, 8 s… até 60 s). Reenvio nunca duplica.

### R9. Ligação a terceiros
- O agente se identifica como assistente virtual da transportadora logo no início e não promete nada em nome do CCO.
- O telefone do recebedor vem do cadastro da rota. No repositório, só números fictícios (E7).

## Parâmetros padrão (demo)

| Parâmetro | Valor |
|---|---|
| Franquia | 5 h |
| Valor da estadia | R$ 2,50 por t/h |
| Capacidade do veículo | 30 t |
| Tentativas ao CCO | 3 |
| Intervalo entre tentativas | 20 min |
| Distância de aproximação | 8 km |
| Geocerca | 400 m |
| Relógio simulado | 1 s real = 1 min |
