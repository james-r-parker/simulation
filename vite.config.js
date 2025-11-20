// Vite configuration for development server
// Optional: Use if you prefer Vite over http-server

import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    open: true, // Automatically open browser
    cors: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // No minification for easier debugging
    minify: false
  }
});



