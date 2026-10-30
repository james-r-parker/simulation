import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../css/app.css', import.meta.url), 'utf8');

/** @param {string} selector a selector that starts a rule @returns {string} the rule's body */
function rule(selector) {
    const at = css.indexOf(`${selector} {`);
    return css.slice(at, css.indexOf('}', at));
}

describe('css/app.css', () => {
    it('sizes the HUD in rem: no length in px but the 16 px of the root', () => {
        const px = css
            .split('\n')
            .filter(
                (line) =>
                    /^\s*(font-size|height|gap|padding|width|top|left|bottom):.*\dpx/.test(line) &&
                    !line.includes('16px'),
            );
        expect(px).toEqual([]);
    });

    it('leaves the top bar without a background slab and gives its text a shadow', () => {
        const bar = rule('#top-bar');
        expect(bar).not.toMatch(/background/);
        expect(bar).toMatch(/text-shadow/);
        expect(rule(':root')).toMatch(/--bar-height: 2\.5rem/);
    });

    it('keeps the text at most 70% luminance', () => {
        const match = /--text: rgb\((\d+), (\d+), (\d+)\)/.exec(css);
        const [r, g, b] = (match ?? []).slice(1).map(Number);
        const linear = (/** @type {number} */ c) =>
            c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4;
        expect(0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)).toBeLessThanOrEqual(0.7);
    });
});
