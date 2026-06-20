import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/uploads': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
      '/v1/admin/users/documents': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // Proxy all /v1/admin/* API calls through Vite to avoid CORS issues
      '/v1/admin': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      // Auth endpoints (login, token refresh, logout, /me) — must come after /v1/admin
      '/auth': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      // Analytics endpoints — proxy to analytics service (versioned path)
      '/v1/analytics': {
        target: 'http://localhost:3018',
        changeOrigin: true,
      },
    },
  },
});
