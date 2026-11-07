// Regenerates every icon file and the share card from public/icons/icon.svg with Playwright's Chromium
// (docs/designs/web-presence.md). Usage: node scripts/build-icons.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    FAVICON_ICO,
    FAVICON_SVG,
    ICON_OUTPUTS,
    ICON_SOURCE,
    ICO_SIZES,
    OG_IMAGE,
    encodeIco,
    variantSvg,
} from './lib/icon-files.mjs';
import { ogCardHtml } from './lib/og-card.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* v8 ignore start -- drives Chromium; covered by running `node scripts/build-icons.mjs`, not by unit tests */
/**
 * Writes a file under the repo root, creating its folder, and prints its path.
 * @param {string} path Repo-relative path.
 * @param {string | Uint8Array} data The contents.
 */
function write(path, data) {
    const abs = resolve(ROOT, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, data);
    console.log(`wrote ${path}`);
}

/**
 * Screenshots one square variant of the icon with a transparent background.
 * @param {import('@playwright/test').Page} page A page in the light colour scheme.
 * @param {{ source: string, variant: string, size: number }} icon What to draw.
 * @returns {Promise<Uint8Array>} The PNG.
 */
async function renderIcon(page, { source, variant, size }) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
        `<!doctype html><body style="margin:0;background:transparent">${variantSvg(source, { variant, size })}</body>`,
    );
    return page.locator('svg').first().screenshot({ omitBackground: true });
}

/**
 * Renders every output and writes it.
 * @param {import('@playwright/test').Browser} browser A launched Chromium.
 * @param {string} source The source SVG text.
 */
async function buildAll(browser, source) {
    const page = await browser.newPage({ deviceScaleFactor: 1, colorScheme: 'light' });
    write(FAVICON_SVG, variantSvg(source, { variant: 'favicon' }));
    for (const icon of ICON_OUTPUTS) {
        write(icon.path, await renderIcon(page, { source, variant: icon.variant, size: icon.size }));
    }
    const images = [];
    for (const size of ICO_SIZES) {
        images.push({ size, png: await renderIcon(page, { source, variant: 'favicon', size }) });
    }
    write(FAVICON_ICO, encodeIco(images));
    const { width, height } = OG_IMAGE;
    await page.setViewportSize({ width, height });
    await page.setContent(ogCardHtml({ mark: variantSvg(source, { variant: '' }), width, height }));
    await page.evaluate('document.fonts.ready');
    const clip = { x: 0, y: 0, width, height };
    write(OG_IMAGE.path, await page.screenshot({ clip, type: 'jpeg', quality: OG_IMAGE.quality }));
    await page.close();
}

async function main() {
    const { chromium } = await import('@playwright/test');
    const source = readFileSync(resolve(ROOT, ICON_SOURCE), 'utf8');
    let browser;
    try {
        browser = await chromium.launch();
    } catch (err) {
        console.error(`build-icons: Chromium failed to launch (npx playwright install chromium): ${err}`);
        process.exit(1);
    }
    try {
        await buildAll(browser, source);
    } finally {
        await browser.close();
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    await main();
}
/* v8 ignore stop */
