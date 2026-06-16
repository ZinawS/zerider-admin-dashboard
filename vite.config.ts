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
    },
  },
});
