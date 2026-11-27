import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Vercel serves this app from the domain root. GitHub Pages overrides this
  // with `/rodar-web/` in its build workflow.
  base: '/',
  plugins: [react(), tailwindcss()],
});
