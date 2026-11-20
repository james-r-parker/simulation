// Playwright config for the browser smoke. scripts/browser-smoke.sh builds, serves and passes the URL in SMOKE_URL.
import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: 'test/browser',
    testMatch: '*.spec.js',
    outputDir: '.checklogs/playwright',
    fullyParallel: false,
    workers: 1,
    // A failed test reruns once. One that passes the rerun is a flake: it passes the gate and is recorded in
    // .checklogs/smoke-flakes.json (scripts/lib/smoke-flakes.mjs); one that fails twice fails. The 30-frames-in-5-s bar
    // of test/browser/smoke.spec.js is not touched, and tracing records the rerun only so a first attempt is not slowed.
    retries: 1,
    use: { trace: 'on-first-retry' },
    timeout: 60_000,
    reporter: [['list'], ['json', { outputFile: '.checklogs/playwright-report.json' }]],
    projects: [{ name: 'chromium', use: { browserName: 'chromium', headless: true } }],
});
