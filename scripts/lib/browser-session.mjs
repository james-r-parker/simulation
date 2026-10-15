// Runs a function against Playwright's Chromium (or a Chrome over CDP) and a Vite dev server, then tears both down.
import { chromium } from '@playwright/test';
import { startServer } from './vite-server.mjs';

/**
 * Runs `work` with a browser and the dev server URL, closing both afterwards.
 * @template T
 * @param {{ headed: boolean, cdp: string, args?: string[] }} options Browser options; `cdp` connects to a running Chrome.
 * @param {(session: { browser: import('@playwright/test').Browser, url: string }) => Promise<T>} work The job.
 * @returns {Promise<T>} What `work` returned.
 */
export async function withBrowserSession(options, work) {
    const { server, url } = await startServer();
    /** @type {import('@playwright/test').Browser | null} */
    let browser = null;
    try {
        browser = options.cdp
            ? await chromium.connectOverCDP(options.cdp)
            : await chromium.launch({ headless: !options.headed, args: options.args ?? [] });
        return await work({ browser, url });
    } finally {
        await browser?.close();
        await server.close();
    }
}
