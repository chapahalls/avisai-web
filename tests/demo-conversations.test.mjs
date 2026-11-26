import test from 'node:test';
import assert from 'node:assert/strict';
import { conversationsStore, respondDemoRequest, sendDemoMessage, DEMO_MESSAGE_DELAYS_MS } from '../.cache/tests/services/mock/conversations.js';
import { registerDemoDriver, registerDemoOperator, registrationIssue, registryStore } from '../.cache/tests/services/mock/registry.js';

test('demo: chamados semeados usam chaves i18n e a resposta do CCO tira o chamado da fila', () => {
  const { requests } = conversationsStore.getState();
  assert.equal(requests.filter((request) => request.status !== 'respondido').length, 3);
  assert.ok(requests.every((request) => request.subjectKey.startsWith('driverRequests.demo.') && request.tripId.startsWith('trip-')));
  respondDemoRequest(1, '   ');
  assert.equal(conversationsStore.getState().requests.find((request) => request.id === 1).status, 'aguardando_cco');
  respondDemoRequest(1, 'Siga até o borracheiro do km 84.');
  assert.equal(conversationsStore.getState().requests.find((request) => request.id === 1).status, 'respondido');
});

test('demo: mensagem ao motorista passa por enviada, falada e respondida', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const message = sendDemoMessage('trip-3', ' Operador CCO ', ' Qual a previsão? ');
  const status = () => conversationsStore.getState().messages.find((item) => item.id === message.id);
  assert.deepEqual([status().sender, status().text, status().status], ['Operador CCO', 'Qual a previsão?', 'enviada']);
  t.mock.timers.tick(DEMO_MESSAGE_DELAYS_MS.spoken);
  assert.equal(status().status, 'falada');
  t.mock.timers.tick(DEMO_MESSAGE_DELAYS_MS.answered - DEMO_MESSAGE_DELAYS_MS.spoken);
  assert.deepEqual([status().status, status().replyKey], ['respondida', 'driverMessages.demoReply']);
});

test('demo: cadastro local de motorista e operador valida formato e e-mail único', () => {
  assert.equal(registrationIssue({ name: '', email: 'a@demo.test' }), 'required');
  assert.equal(registrationIssue({ name: 'A', email: 'sem-arroba' }), 'email');
  assert.equal(registrationIssue({ name: 'A', email: 'a@demo.test', phone: '11999' }), 'phone');
  assert.equal(registrationIssue({ name: 'A', email: ' MOTORISTA.A@DEMO.TEST ' }), 'duplicate');
  const driver = registerDemoDriver({ name: ' Joana ', email: 'JOANA@demo.test', phone: '+5511988887777' });
  assert.deepEqual([driver.name, driver.email, driver.phone], ['Joana', 'joana@demo.test', '+5511988887777']);
  assert.throws(() => registerDemoOperator({ name: 'Outra', email: 'joana@demo.test' }), /duplicate/);
  registerDemoOperator({ name: 'Carla', email: 'carla@demo.test' });
  assert.equal(registryStore.getState().operators.at(-1).email, 'carla@demo.test');
});
