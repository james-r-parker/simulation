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

    it('keeps the HUD clear of the safe-area insets', () => {
        expect(css).toMatch(/#top-bar \{[^}]*top: env\(safe-area-inset-top/);
        expect(css).toMatch(/#ticker \{[^}]*bottom: max\(0\.75rem, env\(safe-area-inset-bottom/);
        expect(css).toMatch(/\.toasts \{[^}]*top: calc\(var\(--bar-height\) \+ 0\.625rem \+ env\(safe-area-inset-top/);
        expect(css).toMatch(/\.drawer \{[^}]*padding-bottom: max\(0\.75rem, env\(safe-area-inset-bottom/);
    });

    it('makes a drawer a bottom sheet on a phone held upright', () => {
        const at = css.indexOf('@media (orientation: portrait) and (max-width: 760px)');
        expect(at).toBeGreaterThan(0);
        const block = css.slice(at, css.indexOf('\n}\n', at));
        expect(block).toMatch(/top: auto/);
        expect(block).toMatch(/transform: translateY\(100%\)/);
        expect(rule('.drawer.open')).toMatch(/transform: none/);
    });

    it('scrolls the top bar sideways on a narrow screen and gives a coarse pointer 2.75rem buttons', () => {
        const narrow = css.slice(css.indexOf('@media (max-width: 760px)'));
        expect(narrow).toMatch(/#top-bar \{[^}]*overflow-x: auto/);
        const coarse = css.slice(css.indexOf('@media (pointer: coarse)'));
        expect(coarse).toMatch(/min-height: 2\.75rem/);
    });
});
