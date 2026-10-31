import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, Vite serves the UI and proxies the API to the orchestrator (`npm run desk` on :4321).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4321', '/files': 'http://localhost:4321' },
  },
});
