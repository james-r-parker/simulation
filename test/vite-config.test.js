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
