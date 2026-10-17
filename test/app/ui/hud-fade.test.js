import { describe, expect, it } from 'vitest';
import { createHudFade, HUD_IDLE_MS, persistentNodes } from '../../../js/app/ui/hud-fade.js';

describe('createHudFade', () => {
    it('fades after 30 s idle and returns on the next input, calling apply only on a change', () => {
        const calls = /** @type {boolean[]} */ ([]);
        const fade = createHudFade({ apply: (idle) => calls.push(idle) });
        expect(fade.tick(0)).toBe(false);
        expect(fade.tick(HUD_IDLE_MS - 1)).toBe(false);
        expect(fade.tick(HUD_IDLE_MS)).toBe(true);
        expect(fade.tick(HUD_IDLE_MS + 5000)).toBe(false);
        expect(fade.tick(0)).toBe(true);
        expect(calls).toEqual([true, false]);
    });

    it('takes another threshold', () => {
        const calls = /** @type {boolean[]} */ ([]);
        createHudFade({ apply: (i) => calls.push(i), idleAfterMs: 100 }).tick(100);
        expect(calls).toEqual([true]);
    });
});

describe('persistentNodes', () => {
    it('lists the nodes that exist, in a fixed order', () => {
        const bar = {};
        const title = {};
        expect(persistentNodes({ title, bar, ticker: null })).toEqual([bar, title]);
        expect(persistentNodes({})).toEqual([]);
    });
});
