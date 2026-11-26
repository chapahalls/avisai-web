import { createStore } from 'zustand/vanilla';
import { DRIVERS } from './data.js';

/**
 * Cadastros da Demo: operadores do CCO e motoristas. Ficam só em memória, como o
 * restante da Demo; nada aqui é enviado à API. Os e-mails usam o domínio
 * reservado `.test` e não identificam pessoas reais.
 */
export interface DemoDriver { id: number; name: string; email: string; phone: string | null; companyId: number }
export interface DemoOperator { id: string; name: string; email: string }
export interface DemoRegistry { drivers: DemoDriver[]; operators: DemoOperator[] }
export type RegistrationIssue = 'required' | 'email' | 'phone' | 'duplicate';

const E164 = /^\+[1-9]\d{7,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const DEMO_OPERATOR_EMAIL = 'cco@demo.test';

export const registryStore = createStore<DemoRegistry>(() => ({
  drivers: DRIVERS.map((name, index) => ({
    id: index + 1, name, email: `motorista.${name.slice(-1).toLowerCase()}@demo.test`, phone: null, companyId: 1,
  })),
  operators: [{ id: 'demo-cco-1', name: 'Operador CCO', email: DEMO_OPERATOR_EMAIL }],
}));

/** Formato exigido também pelo backend (`POST /motoristas`): nome e e-mail obrigatórios, telefone E.164 opcional. */
export function registrationFormatIssue(input: { name: string; email: string; phone?: string }): Exclude<RegistrationIssue, 'duplicate'> | null {
  if (!input.name.trim() || !input.email.trim()) return 'required';
  if (!EMAIL.test(input.email.trim())) return 'email';
  if (input.phone?.trim() && !E164.test(input.phone.trim())) return 'phone';
  return null;
}

/** Na Demo, o e-mail também precisa ser único entre motoristas e operadores locais. */
export function registrationIssue(input: { name: string; email: string; phone?: string }): RegistrationIssue | null {
  const format = registrationFormatIssue(input);
  if (format) return format;
  const email = input.email.trim().toLowerCase();
  const { drivers, operators } = registryStore.getState();
  if ([...drivers, ...operators].some((item) => item.email === email)) return 'duplicate';
  return null;
}

export function registerDemoDriver(input: { name: string; email: string; phone?: string }): DemoDriver {
  const issue = registrationIssue(input);
  if (issue) throw new Error(issue);
  const { drivers } = registryStore.getState();
  const driver: DemoDriver = {
    id: Math.max(0, ...drivers.map((item) => item.id)) + 1, name: input.name.trim(), email: input.email.trim().toLowerCase(),
    phone: input.phone?.trim() || null, companyId: 1,
  };
  registryStore.setState({ drivers: [...drivers, driver] });
  return driver;
}

export function registerDemoOperator(input: { name: string; email: string }): DemoOperator {
  const issue = registrationIssue(input);
  if (issue) throw new Error(issue);
  const { operators } = registryStore.getState();
  const operator: DemoOperator = { id: `demo-cco-${operators.length + 1}`, name: input.name.trim(), email: input.email.trim().toLowerCase() };
  registryStore.setState({ operators: [...operators, operator] });
  return operator;
}
