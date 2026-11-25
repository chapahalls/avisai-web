import { create } from 'zustand';
import { getApiClient } from '../../../services/operations';

interface Session {
  name: string;
  role: string;
}

/** Login simulado (sem senha). No modo API, o JWT do /auth/sso vai em toda chamada: o backend exige papel `cco` nas ações da central. */
export const useSession = create<{ session: Session | null; login: (email?: string, mode?: 'api' | 'demo') => Promise<void>; logout: () => void }>((set) => ({
  session: null,
  login: async (email = 'cco@avisai.test', mode = 'demo') => {
    if (mode === 'api') {
      const client = getApiClient();
      if (!client) throw new Error('api_invalid_configuration');
      const result = await client.authSso(email.trim());
      if (result.user.role !== 'cco') throw new Error('cco_login_only');
      client.setAccessToken(result.token);
      set({ session: { name: result.user.name, role: result.user.role } });
      return;
    }
    await new Promise((r) => setTimeout(r, 600));
    set({ session: { name: 'Operador CCO', role: 'Torre de controle' } });
  },
  logout: () => {
    getApiClient()?.setAccessToken(null);
    set({ session: null });
  },
}));
