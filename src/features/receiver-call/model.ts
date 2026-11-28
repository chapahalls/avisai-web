/** Celular brasileiro com DDD (11 dígitos, começando com 9 depois do DDD), com ou sem +55. Devolve E.164 ou null. */
export function normalizeBrazilianMobile(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) digits = digits.slice(2);
  return /^[1-9][0-9]9[0-9]{8}$/.test(digits) ? `+55${digits}` : null;
}
