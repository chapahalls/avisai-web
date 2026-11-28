import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBrazilianMobile } from '../.cache/tests/features/receiver-call/model.js';

test('aceita celular brasileiro com DDD, com ou sem +55, e devolve E.164', () => {
  assert.equal(normalizeBrazilianMobile('(31) 99157-0000'), '+5531991570000');
  assert.equal(normalizeBrazilianMobile('+55 11 91234-5678'), '+5511912345678');
  assert.equal(normalizeBrazilianMobile('5511912345678'), '+5511912345678');
});

test('recusa fixo, celular sem o 9, DDD inválido e número estrangeiro', () => {
  for (const invalid of ['(31) 3157-0000', '+55 31 9157-4782', '(01) 99157-0000', '+1 415 555 0100', '']) {
    assert.equal(normalizeBrazilianMobile(invalid), null, invalid);
  }
});
