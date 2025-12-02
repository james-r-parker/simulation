// Vite configuration for development server and Cloudflare Pages
import { defineConfig } from 'vite';

export default defineConfig(({ command, mode }) => {
  // Determine if we're in production build
  const isProduction = command === 'build' || mode === 'production';
  
  return {
    base: '/', // Use relative paths for Cloudflare Pages
    publicDir: 'public', // Explicitly set public directory
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
          assetFileNames: 'assets/[name].[ext]',
          // Split vendor libraries into separate chunks for better caching
          manualChunks: {
            vendor: ['three']
          }
        }
      }
    },
    // Define environment variables based on build mode
    define: {
      __PRODUCTION__: isProduction
    }
  };
});



