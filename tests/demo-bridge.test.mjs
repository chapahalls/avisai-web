import test from 'node:test';
import assert from 'node:assert/strict';
import { effectForClientAction, effectForEvent, effectForSpeech } from '../.cache/tests/services/livekit/demoBridge.js';

test('comandos do agente abrem as mesmas telas que no app', () => {
  assert.deepEqual(effectForClientAction('open_screen', 'mapa'), { kind: 'screen', screen: 'map' });
  assert.deepEqual(effectForClientAction('open_screen', 'documentos'), { kind: 'screen', screen: 'documents' });
  assert.deepEqual(effectForClientAction('open_screen', 'mensagens'), { kind: 'screen', screen: 'messages' });
  assert.deepEqual(effectForClientAction('open_screen', 'fila'), { kind: 'screen', screen: 'queue' });
  assert.deepEqual(effectForClientAction('open_document'), { kind: 'screen', screen: 'documents' });
  assert.deepEqual(effectForClientAction('open_navigation'), { kind: 'screen', screen: 'map' });
  assert.deepEqual(effectForClientAction('end_voice'), { kind: 'end_voice' });
  assert.equal(effectForClientAction('logout'), null);
  assert.equal(effectForClientAction('open_screen', 'desconhecida'), null);
});

test('marcos da viagem confirmados por voz avançam a viagem simulada', () => {
  assert.deepEqual(effectForEvent('retirada', '', {}), { kind: 'trip', command: 'start' });
  assert.deepEqual(effectForEvent('aproximacao', '', {}), { kind: 'trip', command: 'approach' });
  assert.deepEqual(effectForEvent('chegada_confirmada_voz', '', {}), { kind: 'trip', command: 'arrive' });
  assert.deepEqual(effectForEvent('descarga', '', {}), { kind: 'trip', command: 'unload' });
  assert.equal(effectForEvent('notificacao_cco', '', {}), null);
});

test('a ligação real ao recebedor aparece fala a fala e termina com a doca', () => {
  assert.deepEqual(effectForSpeech('recebedor', ' Olá, aqui é o AvisAI. '), { kind: 'receiver_line', who: 'agent', text: 'Olá, aqui é o AvisAI.' });
  assert.equal(effectForSpeech('motorista', 'Abrindo o mapa.'), null);
  assert.deepEqual(effectForEvent('fala_recebedor', 'Pode mandar para a doca 3', {}), { kind: 'receiver_line', who: 'receiver', text: 'Pode mandar para a doca 3' });
  assert.deepEqual(effectForEvent('resposta_recebedor', 'Recebedor respondeu', { doca: '3', previsao: '15:30' }), { kind: 'receiver_answer', dock: '3', time: '15:30' });
  assert.deepEqual(effectForEvent('ligacao_nao_atendida', '', {}), { kind: 'receiver_no_answer' });
});
