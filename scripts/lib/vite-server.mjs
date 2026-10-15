// Starts the Vite dev server on a free loopback port for the browser scripts.
import { createServer } from 'vite';

/**
 * Starts the Vite dev server on a free port.
 * @returns {Promise<{ server: import('vite').ViteDevServer, url: string }>} The server and its URL.
 */
export async function startServer() {
    const server = await createServer({
        server: { host: '127.0.0.1', port: 0, open: false, strictPort: false },
        logLevel: 'error',
    });
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === 'string') {
        throw new Error('Vite dev server did not report a port');
    }
    return { server, url: `http://127.0.0.1:${address.port}/` };
}
