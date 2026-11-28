/** Celular brasileiro com DDD (11 dígitos, começando com 9 depois do DDD), com ou sem +55. Devolve E.164 ou null. */
export function normalizeBrazilianMobile(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) digits = digits.slice(2);
  return /^[1-9][0-9]9[0-9]{8}$/.test(digits) ? `+55${digits}` : null;
}

const UNITS: Record<string, string> = {
  zero: '0', um: '1', uma: '1', dois: '2', duas: '2', tres: '3', quatro: '4', cinco: '5', seis: '6', meia: '6',
  sete: '7', oito: '8', nove: '9', oh: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6',
  seven: '7', eight: '8', nine: '9',
};
const TEENS: Record<string, string> = {
  dez: '10', onze: '11', doze: '12', treze: '13', quatorze: '14', catorze: '14', quinze: '15', dezesseis: '16',
  dezasseis: '16', dezessete: '17', dezoito: '18', dezenove: '19',
};
const TENS: Record<string, number> = {
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
};

/** Dígitos de uma fala ("onze, nove nove oito…", "11 99876-5432"), na ordem em que foram ditos. */
function spokenDigits(text: string) {
  const words = text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').match(/[a-z]+|\d+/g) ?? [];
  let digits = '';
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    if (/^\d+$/.test(word)) digits += word;
    else if (word in TENS) {
      const unit = words[index + 1] === 'e' ? UNITS[words[index + 2]] : undefined;
      digits += unit && unit !== '0' ? String(TENS[word] + Number(unit)) : String(TENS[word]);
      if (unit && unit !== '0') index += 2;
    } else if (word in TEENS) digits += TEENS[word];
    else if (word in UNITS) digits += UNITS[word];
  }
  return digits;
}

/**
 * Celular brasileiro dito em voz alta (transcrição do visitante), em E.164, ou null.
 * Trechos separados por " | " são falas diferentes: vale a mais recente que tenha um celular inteiro,
 * e só então as falas juntas (o número dito em duas partes).
 */
export function extractBrazilianMobile(heard: string): string | null {
  const parts = heard.split('|');
  for (const candidate of [...parts].reverse().concat(parts.join(' '))) {
    const matches = [...spokenDigits(candidate).matchAll(/(?:55)?([1-9][0-9]9[0-9]{8})/g)];
    const last = matches.at(-1);
    if (last) return `+55${last[1]}`;
  }
  return null;
}

/** "+5531991570000" → "(31) 99157-0000", para conferir na tela. */
export function formatBrazilianMobile(e164: string) {
  const digits = e164.replace(/\D/g, '').replace(/^55/, '');
  return digits.length === 11 ? `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}` : e164;
}
