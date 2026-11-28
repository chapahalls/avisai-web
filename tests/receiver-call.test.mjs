import test from 'node:test';
import assert from 'node:assert/strict';
import { extractBrazilianMobile, formatBrazilianMobile, normalizeBrazilianMobile } from '../.cache/tests/features/receiver-call/model.js';

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

test('acha o celular dito em voz alta, em dígitos ou por extenso', () => {
  assert.equal(extractBrazilianMobile('meu número é 31 99157-0000'), '+5531991570000');
  assert.equal(extractBrazilianMobile('onze, nove nove oito sete seis, cinco quatro três dois'), '+5511998765432');
  assert.equal(extractBrazilianMobile('trinta e um nove nove um cinco sete zero zero zero zero'), '+5531991570000');
  assert.equal(extractBrazilianMobile('vinte nove meia meia meia meia um dois três quatro'), '+5520966661234');
  assert.equal(extractBrazilianMobile('it is eleven… one one nine eight seven six five four three two one'), '+5511987654321');
});

test('número em duas falas e correção: vale a fala mais recente com o número inteiro', () => {
  assert.equal(extractBrazilianMobile('31 99157 | 0000'), '+5531991570000');
  assert.equal(extractBrazilianMobile('31 99157-0000 | não, é 31 99157-1111'), '+5531991571111');
});

test('sem celular válido na fala não inventa número', () => {
  for (const heard of ['', 'pular', 'meu fixo é 31 3157-0000', 'um dois três']) {
    assert.equal(extractBrazilianMobile(heard), null, heard);
  }
});

test('formata o celular para conferir na tela', () => {
  assert.equal(formatBrazilianMobile('+5531991570000'), '(31) 99157-0000');
});
