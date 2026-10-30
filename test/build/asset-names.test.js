import { describe, expect, it } from 'vitest';
import viteConfig from '../../vite.config.js';

/**
 * The emitted-asset name pattern the production build uses.
 * @returns {string | undefined}
 */
function assetPattern() {
    const config = /** @type {any} */ (viteConfig({ command: 'build', mode: 'production' }));
    return config.build?.rollupOptions?.output?.assetFileNames;
}

describe('vite build asset names', () => {
    it('puts a content hash in every emitted asset name, so a deploy never mixes versions', () => {
        expect(assetPattern()).toContain('[hash]');
    });

    it('keeps assets under assets/ and keeps the file extension', () => {
        const pattern = assetPattern() ?? '';
        expect(pattern.startsWith('assets/')).toBe(true);
        expect(pattern).toMatch(/\[extname\]$/);
    });
});
