// The page head, the manifest and the committed icon files agree (docs/designs/web-presence.md).
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    FAVICON_ICO,
    FAVICON_SVG,
    ICON_OUTPUTS,
    ICON_SOURCE,
    ICO_SIZES,
    OG_IMAGE,
    jpegSize,
    pngSize,
    readIco,
    variantSvg,
} from '../scripts/lib/icon-files.mjs';

const SITE = 'https://matrix.dotnethelp.co.uk/';
const html = readFileSync('index.html', 'utf8');
const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));

/**
 * Every tag of one name in the head (outside the noscript block), as attribute maps.
 * @param {string} name Tag name.
 * @returns {Record<string, string>[]} One map per tag.
 */
function tags(name) {
    const visible = head.replace(/<noscript>[\s\S]*?<\/noscript>/g, '');
    return [...visible.matchAll(new RegExp(`<${name}\\s([^>]*)>`, 'g'))].map(([, body]) =>
        Object.fromEntries([...body.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map(([, k, v]) => [k, v])),
    );
}

/**
 * The tags matching one attribute value.
 * @param {string} name Tag name.
 * @param {string} attr Attribute name.
 * @param {string} value Attribute value.
 * @returns {Record<string, string>[]} The matches.
 */
function tagsWith(name, attr, value) {
    return tags(name).filter((t) => t[attr] === value);
}

/**
 * The single meta tag's content; fails unless there is exactly one.
 * @param {string} attr `name` or `property`.
 * @param {string} value Its value.
 * @returns {string} The content.
 */
function metaContent(attr, value) {
    const found = tagsWith('meta', attr, value);
    expect(found, `${attr}="${value}"`).toHaveLength(1);
    return found[0].content;
}

/**
 * The public file a link href or manifest src names.
 * @param {string} href A root-absolute path, a path relative to the site root or a production URL.
 * @returns {string} The repo path.
 */
function publicPath(href) {
    return `public/${href.replace(SITE, '').replace(/^\//, '')}`;
}

/**
 * Reads a committed image's pixel size.
 * @param {string} path Repo path.
 * @returns {{ width: number, height: number }} Its size.
 */
function imageSize(path) {
    const bytes = new Uint8Array(readFileSync(path));
    return path.endsWith('.jpg') ? jpegSize(bytes) : pngSize(bytes);
}

describe('the page head', () => {
    it('has exactly one of each key tag', () => {
        expect(head.match(/<title>/g)).toHaveLength(1);
        for (const name of ['description', 'robots', 'color-scheme', 'viewport', 'twitter:card', 'twitter:image']) {
            expect(metaContent('name', name)).not.toBe('');
        }
        for (const property of ['og:title', 'og:description', 'og:type', 'og:url', 'og:site_name', 'og:image:alt']) {
            expect(metaContent('property', property)).not.toBe('');
        }
        for (const rel of ['canonical', 'manifest', 'apple-touch-icon']) {
            expect(tagsWith('link', 'rel', rel), rel).toHaveLength(1);
        }
        expect(metaContent('name', 'twitter:card')).toBe('summary_large_image');
    });

    it('points the canonical link and og:url at the production site', () => {
        expect(tagsWith('link', 'rel', 'canonical')[0].href).toBe(SITE);
        expect(metaContent('property', 'og:url')).toBe(SITE);
    });

    it('sets one theme-color per colour scheme, matching the manifest', () => {
        const themes = tagsWith('meta', 'name', 'theme-color');
        expect(themes.map((t) => t.media).sort()).toEqual([
            '(prefers-color-scheme: dark)',
            '(prefers-color-scheme: light)',
        ]);
        expect(themes.every((t) => t.content === manifest.theme_color)).toBe(true);
    });

    it('links an existing file for every icon and the manifest, at its declared size', () => {
        const links = tags('link').filter((t) => ['icon', 'apple-touch-icon', 'manifest'].includes(t.rel));
        expect(links.length).toBeGreaterThanOrEqual(4);
        for (const link of links) {
            expect(link.href.startsWith('/'), `${link.href} is root-absolute for Vite's base`).toBe(true);
            expect(existsSync(publicPath(link.href)), link.href).toBe(true);
            if (link.href.endsWith('.png')) {
                expect(imageSize(publicPath(link.href)).width).toBe(180);
            }
        }
        expect(tagsWith('link', 'rel', 'icon').map((t) => t.href)).toEqual(['/favicon.ico', '/favicon.svg']);
    });

    it('shows a message to readers without JavaScript', () => {
        expect(head).toMatch(/<noscript>[\s\S]*needs JavaScript[\s\S]*<\/noscript>/);
    });
});

describe('the share card', () => {
    it('is a 1200 x 630 image whose tags match it', () => {
        const url = metaContent('property', 'og:image');
        expect(url.startsWith(SITE)).toBe(true);
        expect(metaContent('name', 'twitter:image')).toBe(url);
        expect(publicPath(url)).toBe(OG_IMAGE.path);
        expect(imageSize(OG_IMAGE.path)).toEqual({ width: 1200, height: 630 });
        expect(metaContent('property', 'og:image:width')).toBe('1200');
        expect(metaContent('property', 'og:image:height')).toBe('630');
        expect(metaContent('property', 'og:image:type')).toBe('image/jpeg');
    });
});

describe('the manifest', () => {
    it('has every field install and the splash need', () => {
        for (const field of ['name', 'short_name', 'description', 'start_url', 'scope', 'id']) {
            expect(typeof manifest[field], field).toBe('string');
        }
        expect(manifest.display).toBe('standalone');
        expect(manifest.orientation).toBe('any');
        expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/);
        expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/);
        expect(manifest.categories.length).toBeGreaterThan(0);
    });

    it('uses only relative paths, so a /v/<version>/ copy describes itself', () => {
        const paths = [
            manifest.start_url,
            manifest.scope,
            manifest.id,
            ...manifest.icons.map((/** @type {any} */ i) => i.src),
        ];
        for (const path of paths) {
            expect(path, path).not.toMatch(/^(\/|https?:)/);
        }
    });

    it('lists existing icons at their declared sizes, with 192 and 512 px for any and maskable', () => {
        for (const icon of manifest.icons) {
            const path = publicPath(icon.src);
            expect(existsSync(path), icon.src).toBe(true);
            if (icon.type === 'image/png') {
                const [w, h] = icon.sizes.split('x').map(Number);
                expect(imageSize(path), icon.src).toEqual({ width: w, height: h });
            }
        }
        for (const purpose of ['any', 'maskable']) {
            const sizes = manifest.icons
                .filter((/** @type {any} */ i) => i.purpose === purpose)
                .map((/** @type {any} */ i) => i.sizes);
            expect(sizes, purpose).toEqual(expect.arrayContaining(['192x192', '512x512']));
        }
    });
});

describe('the generated icon files', () => {
    it('exist at the size the build list gives', () => {
        for (const icon of ICON_OUTPUTS) {
            expect(imageSize(icon.path), icon.path).toEqual({ width: icon.size, height: icon.size });
        }
    });

    it('include an ICO holding 16, 32 and 48 px PNGs', () => {
        const bytes = new Uint8Array(readFileSync(FAVICON_ICO));
        const entries = readIco(bytes);
        expect(entries.map((e) => e.width)).toEqual([...ICO_SIZES]);
        for (const entry of entries) {
            const png = bytes.subarray(entry.offset, entry.offset + entry.bytes);
            expect(pngSize(png)).toEqual({ width: entry.width, height: entry.width });
        }
    });

    it('keep favicon.svg in step with the source', () => {
        const source = readFileSync(ICON_SOURCE, 'utf8');
        expect(readFileSync(FAVICON_SVG, 'utf8')).toBe(variantSvg(source, { variant: 'favicon' }));
    });
});

describe('the crawler files', () => {
    it('name the sitemap, which lists the canonical page', () => {
        expect(readFileSync('public/robots.txt', 'utf8')).toContain(`Sitemap: ${SITE}sitemap.xml`);
        expect(readFileSync('public/sitemap.xml', 'utf8')).toContain(`<loc>${SITE}</loc>`);
    });
});
