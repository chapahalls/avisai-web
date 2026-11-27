import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Único hospedeiro do deploy: a Vercel serve este app a partir da raiz do domínio.
  base: '/',
  plugins: [react(), tailwindcss()],
});
