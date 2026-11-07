import { describe, expect, it } from 'vitest';
import { motes, ogCardHtml, seededRandom } from '../scripts/lib/og-card.mjs';

describe('seededRandom', () => {
    it('repeats for a seed, differs between seeds and stays in [0, 1)', () => {
        const a = seededRandom(7);
        const b = seededRandom(7);
        const c = seededRandom(8);
        const first = Array.from({ length: 50 }, a);
        expect(Array.from({ length: 50 }, b)).toEqual(first);
        expect(c()).not.toBe(first[0]);
        expect(first.every((x) => x >= 0 && x < 1)).toBe(true);
    });
});

describe('motes', () => {
    const field = { seed: 3, count: 200, width: 1200, height: 630 };

    it('places the same motes for the same seed, inside the card', () => {
        const dots = motes(field);
        expect(motes(field)).toEqual(dots);
        expect(dots).toHaveLength(200);
        for (const m of dots) {
            expect(m.x).toBeGreaterThanOrEqual(0);
            expect(m.x).toBeLessThanOrEqual(1200);
            expect(m.y).toBeLessThanOrEqual(630);
            expect(m.r).toBeGreaterThanOrEqual(1.2);
            expect(m.r).toBeLessThanOrEqual(6);
        }
    });

    it('keeps motes behind the text fainter than the brightest on the left', () => {
        const dots = motes(field);
        const right = dots.filter((m) => m.x > 1200 * 0.42);
        expect(right.length).toBeGreaterThan(0);
        expect(Math.max(...right.map((m) => m.alpha))).toBeLessThanOrEqual(0.45);
    });
});

describe('ogCardHtml', () => {
    it('sizes the page to the card and carries the mark, the name and the address', () => {
        const html = ogCardHtml({ mark: '<svg id="mark"></svg>', width: 1200, height: 630 });
        expect(html).toContain('width: 1200px; height: 630px');
        expect(html).toContain('<svg id="mark"></svg>');
        expect(html).toContain('Blob <span>Evolution</span>');
        expect(html).toContain('matrix.dotnethelp.co.uk');
        expect(html.match(/<circle /g)).toHaveLength(90);
    });
});
