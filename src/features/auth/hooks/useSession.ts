import { create } from 'zustand';

interface Session {
  name: string;
  role: string;
}

/** SSO genérico MOCK: qualquer clique entra como operador. Para OIDC real, trocar só este hook. */
export const useSession = create<{ session: Session | null; login: () => Promise<void>; logout: () => void }>((set) => ({
  session: null,
  login: async () => {
    await new Promise((r) => setTimeout(r, 600));
    set({ session: { name: 'Operador CCO', role: 'Torre de controle' } });
  },
  logout: () => set({ session: null }),
}));
