import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const srcDir = fileURLToPath(new URL('./src', import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': `${srcDir}/shared`,
      '@client': `${srcDir}/client`,
    },
  },
  build: {
    // The web server serves only this directory. The compiled backend is emitted
    // to dist/server by tsc; keeping the client bundle in its own root means the
    // static handler physically cannot reach server source. Serving dist/ itself
    // exposed every compiled .js under dist/server as a public file.
    outDir: 'dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
});
