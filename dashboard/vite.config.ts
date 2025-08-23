import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue()],
  
  server: {
    port: 5173,
    proxy: {
      // Proxy API requests to Hono server during development
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true // Enable WebSocket proxying
      }
    }
  },
  
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      }
    }
  },
  
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
});