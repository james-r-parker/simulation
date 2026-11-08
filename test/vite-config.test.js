import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import viteConfig from '../vite.config.js';

describe('vite config', () => {
    it('never opens a browser from `vite preview` (the browser smoke and agent runs)', () => {
        const config =
            typeof viteConfig === 'function' ? viteConfig({ command: 'serve', mode: 'development' }) : viteConfig;
        expect(config.preview?.open).toBe(false);
    });

    it('starts the browser smoke preview with the browser closed', () => {
        const script = readFileSync('scripts/browser-smoke.sh', 'utf8');
        const preview = script.split('\n').find((line) => line.includes('bin/vite preview'));
        expect(preview).toContain('--open false');
        expect(preview).toContain('BROWSER=none');
    });
});

describe('vite config build constants', () => {
    const root = JSON.parse(readFileSync('package.json', 'utf8'));
    /**
     * @param {string | undefined} appVersion the APP_VERSION environment variable for the build
     * @returns {{base: string, define: Record<string, unknown>}} the resolved build config
     */
    const resolve = (appVersion) => {
        const saved = process.env.APP_VERSION;
        if (appVersion === undefined) {
            delete process.env.APP_VERSION;
        } else {
            process.env.APP_VERSION = appVersion;
        }
        try {
            return /** @type {any} */ (viteConfig)({ command: 'build', mode: 'production' });
        } finally {
            if (saved === undefined) {
                delete process.env.APP_VERSION;
            } else {
                process.env.APP_VERSION = saved;
            }
        }
    };

    it('keeps base at the site root, so a release build overrides it with --base', () => {
        expect(resolve(undefined).base).toBe('/');
    });

    it('reports the package.json version and its major when APP_VERSION is unset', () => {
        const { define } = resolve(undefined);
        expect(define.__APP_VERSION__).toBe(JSON.stringify(root.version));
        expect(define.__SEASON__).toBe(Number(root.version.split('.')[0]));
    });

    it('reports the release build version and its major', () => {
        const { define } = resolve('7.2.1');
        expect(define.__APP_VERSION__).toBe('"7.2.1"');
        expect(define.__SEASON__).toBe(7);
    });

    it('refuses a version that is not major.minor.patch', () => {
        expect(() => resolve('v7.2.1')).toThrow(/APP_VERSION/);
    });
});
