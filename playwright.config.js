// Playwright config for the browser smoke. scripts/browser-smoke.sh builds, serves and passes the URL in SMOKE_URL.
import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: 'test/browser',
    testMatch: '*.spec.js',
    outputDir: '.checklogs/playwright',
    fullyParallel: false,
    workers: 1,
    retries: 0,
    timeout: 60_000,
    reporter: [['list']],
    projects: [{ name: 'chromium', use: { browserName: 'chromium', headless: true } }],
});
