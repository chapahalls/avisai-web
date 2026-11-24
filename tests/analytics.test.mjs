import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agentDailySeries, ccoContacts, demoKpis, filterDeliveries, occurrences, receiverStats, requestFunnel, toCsv } from '../.cache/tests/features/analytics/model.js';
import { buildHistoricalData } from '../.cache/tests/services/mock/history.js';

const { deliveries, calls } = buildHistoricalData();
const input = { deliveries, calls, tasks: [], feed: [], tripMeta: {}, simMinutes: 0 };
const filters = (overrides = {}) => ({ period: '7d', receiverId: 'all', driver: 'all', occurrence: 'all', ...overrides });

test('análises: o histórico da Demo cobre 7 dias e o período "hoje" só o último', () => {
  assert.equal(filterDeliveries(deliveries, filters(), 0).length, 63);
  assert.equal(filterDeliveries(deliveries, filters({ period: 'today' }), 0).length, 9);
  assert.ok(deliveries.every((delivery) => delivery.plate && delivery.driver && delivery.arrivalMinuteOfDay !== undefined));
});

test('análises: funil soma as respostas e não passa do total de avisos', () => {
  const funnel = Object.fromEntries(requestFunnel(deliveries, calls).map((step) => [step.key, step.value]));
  assert.equal(funnel.sent, 63);
  assert.equal(funnel.first + funnel.afterInsisting + funnel.noAnswer, funnel.sent);
  assert.ok(funnel.escalated <= funnel.sent);
});

test('análises: ocorrências e contatos vêm das escaladas e das esperas acima da franquia', () => {
  const rows = occurrences(input, filters());
  const escalated = deliveries.filter((delivery) => delivery.escalated).length;
  const over = deliveries.filter((delivery) => delivery.waitMin > 300).length;
  assert.equal(rows.filter((row) => row.kind === 'receiverNoAnswer').length, escalated);
  assert.equal(rows.filter((row) => row.kind === 'overFranchise').length, over);
  assert.equal(occurrences(input, filters({ occurrence: 'overFranchise' })).length, over);
  assert.equal(ccoContacts(input, filters()).length, escalated);
  const kpis = demoKpis(deliveries, calls, rows);
  assert.equal(kpis.trips, 63);
  assert.equal(kpis.escalations, escalated);
  assert.equal(kpis.occurrences, rows.length);
});

test('análises: série diária, ranking de recebedores e CSV', () => {
  const series = agentDailySeries(deliveries, calls, 0, '7d');
  assert.deepEqual(series.map((point) => point.offset), [-6, -5, -4, -3, -2, -1, 0]);
  assert.equal(series.reduce((total, point) => total + point.calls, 0), calls.length);
  const receivers = receiverStats(deliveries, calls, []);
  assert.equal(receivers.reduce((total, row) => total + row.deliveries, 0), 63);
  assert.equal(toCsv(['a', 'b'], [['x;y', 1], [null, 'diz "oi"']]), 'a;b\n"x;y";1\n;"diz ""oi"""');
});
