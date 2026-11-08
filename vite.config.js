// Vite configuration for development server and Cloudflare Pages
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// The version the build reports (`__APP_VERSION__`) and the season it belongs to (`__SEASON__`, its major). The release
// build sets APP_VERSION; anything else reports package.json's version (docs/designs/deployment-and-community.md,
// "Versioned build and paths"). The release build also passes `--base /v/<version>/` (or `/next/`), which overrides `base`.
const packageVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;

/**
 * @param {string | undefined} fromEnv the APP_VERSION environment variable
 * @returns {{version: string, season: number}} the version to report and its major
 */
export function appVersion(fromEnv) {
  const version = fromEnv !== undefined && fromEnv !== '' ? fromEnv : packageVersion;
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`APP_VERSION must be major.minor.patch, got "${version}"`);
  }
  return { version, season: Number(version.split('.')[0]) };
}

export default defineConfig(({ command, mode }) => {
  const { version, season } = appVersion(process.env.APP_VERSION);
  // Determine if we're in production build
  const isProduction = command === 'build' || mode === 'production';
  
  return {
    base: '/', // The site root; a versioned or /next/ build passes `--base`
    publicDir: 'public', // Explicitly set public directory
    server: {
      port: 5173,
      open: true, // Automatically open browser for `npm run dev` (BROWSER=none turns it off)
      cors: true
    },
    // `vite preview` would otherwise inherit server.open: the browser smoke and agents' runs must never open a window
    // on the user's desktop.
    preview: {
      open: false
    },
    // The sim worker (js/worker/sim-worker.js) is an ES module worker.
    worker: {
      format: 'es'
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      // No minification for easier debugging
      minify: false,
      // Ensure proper asset handling for Cloudflare Pages
      rollupOptions: {
        output: {
          // Content-hash every asset name (a fixed name stays cached across deploys)
          assetFileNames: 'assets/[name]-[hash][extname]',
          // Split vendor libraries into separate chunks for better caching
          manualChunks(id) {
            if (id.includes('/node_modules/three/')) return 'vendor';
          }
        }
      }
    },
    // Define environment variables based on build mode
    define: {
      __PRODUCTION__: isProduction,
      __APP_VERSION__: JSON.stringify(version),
      __SEASON__: season
    }
  };
});



