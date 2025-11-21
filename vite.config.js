// Vite configuration for development server and Cloudflare Pages
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/', // Use relative paths for Cloudflare Pages
  server: {
    port: 5173,
    open: true, // Automatically open browser
    cors: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // No minification for easier debugging
    minify: false,
    // Ensure proper asset handling for Cloudflare Pages
    rollupOptions: {
      output: {
        // Use relative paths for assets
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  }
});



