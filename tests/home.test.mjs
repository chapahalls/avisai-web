import test from 'node:test';
import assert from 'node:assert/strict';
import { loaderTarget, nextDisplayed, loaderStage, formatCounter, tickDashArray, LOADER_MIN_MS, LOADER_MAX_MS } from '../.cache/tests/features/home/model.js';

test('contador só chega a 100 com arquivos prontos e tempo mínimo cumprido', () => {
  assert.equal(loaderTarget(1, 0), 0);
  assert.equal(loaderTarget(1, LOADER_MIN_MS / 2), 50);
  assert.equal(loaderTarget(1, LOADER_MIN_MS), 100);
  assert.equal(loaderTarget(0.4, LOADER_MIN_MS * 2), 40);
  assert.equal(loaderTarget(0.999, LOADER_MIN_MS * 2), 99);
});

test('limite de segurança libera a página mesmo com arquivo lento ou progresso inválido', () => {
  assert.equal(loaderTarget(0, LOADER_MAX_MS), 100);
  assert.equal(loaderTarget(Number.NaN, LOADER_MAX_MS - 1), 0);
  assert.equal(loaderTarget(-3, LOADER_MIN_MS), 0);
  assert.equal(loaderTarget(7, LOADER_MIN_MS), 100);
  assert.equal(loaderTarget(1, 10, 0), 100);
});

test('valor exibido avança em passos, nunca recua e nunca passa do alvo', () => {
  assert.equal(nextDisplayed(10, 5), 10);
  assert.equal(nextDisplayed(10, 10), 10);
  assert.equal(nextDisplayed(99, 100), 100);
  let shown = 0;
  const seen = [];
  while (shown < 100) { shown = nextDisplayed(shown, 100); seen.push(shown); }
  assert.ok(seen.length > 5, 'deve haver passos visíveis');
  assert.ok(seen.every((value, i) => i === 0 || value > seen[i - 1]));
  assert.equal(seen.at(-1), 100);
});

test('etapas e contador formatado cobrem as fronteiras', () => {
  assert.equal(loaderStage(0), 'routes');
  assert.equal(loaderStage(35), 'routes');
  assert.equal(loaderStage(36), 'fleet');
  assert.equal(loaderStage(71), 'cco');
  assert.equal(loaderStage(100), 'ready');
  assert.equal(formatCounter(7), '07');
  assert.equal(formatCounter(100), '100');
  assert.equal(formatCounter(-1), '00');
  assert.equal(formatCounter(Number.NaN), '00');
});

test('marcações do anel fecham a volta completa', () => {
  const [on, off] = tickDashArray(209, 120).split(' ').map(Number);
  assert.ok(Math.abs((on + off) * 120 - 2 * Math.PI * 209) < 0.2);
});
