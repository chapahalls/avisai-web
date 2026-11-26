import { create } from 'zustand';

/**
 * Tema do painel CCO. O escuro é o padrão; a escolha do operador fica salva no navegador.
 * Só o shell do painel aplica o tema (`data-theme` no <html>): home, login e demo mobile mantêm o próprio visual.
 */
export type Theme = 'dark' | 'light';

const THEME_KEY = 'rodar.theme';

const savedTheme = (): Theme => {
  try {
    return window.localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
};

interface ThemeState {
  theme: Theme;
  toggle: () => void;
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: savedTheme(),
  toggle: () => {
    const theme: Theme = get().theme === 'light' ? 'dark' : 'light';
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Sem armazenamento (aba privada): a escolha vale só nesta visita.
    }
    set({ theme });
  },
}));
