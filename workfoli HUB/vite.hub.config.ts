import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Interface web do Workfoli Hub. Servida pelo próprio servidor do Hub (dist-hub/), sem CDN externo.
export default defineConfig({
  root: 'apps/hub-web',
  base: '/',
  plugins: [react()],
  build: { outDir: '../../dist-hub', emptyOutDir: true, sourcemap: false, assetsInlineLimit: 0, chunkSizeWarningLimit: 900 },
  server: {
    host: '127.0.0.1', port: 5174, strictPort: true,
    // Em desenvolvimento, a API vem do Hub iniciado com `workfoli hub start` (porta da instância).
    proxy: { '/api': { target: process.env.WORKFOLI_HUB_URL ?? 'http://127.0.0.1:4870', changeOrigin: true } },
  },
});
