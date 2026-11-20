import { describe, expect, it } from 'vitest';
import { createDirectorFeed, FEED_EFFECTS, WINDOW_S } from '../../../js/app/director/feed.js';

const effect = (/** @type {number} */ tick) => ({ kind: 2, tick, x: 1, y: 2, a: 3, b: 4, c: 5, d: 6 });

describe('createDirectorFeed', () => {
    it('copies each effect, since the caller reuses its record', () => {
        const feed = createDirectorFeed();
        const e = effect(100);
        feed.noteEffect(e);
        e.tick = 999;
        expect(feed.recent(100, 60).effects).toEqual([effect(100)]);
    });

    it('returns only what is inside the window, oldest first', () => {
        const feed = createDirectorFeed();
        for (const t of [10, 700, 800]) {
            feed.noteEffect(effect(t));
        }
        feed.noteTicker([
            { tick: 5, kind: 'extinct' },
            { tick: 790, kind: 'last-stand', lineageId: 4, x: 7, y: 8 },
        ]);
        const out = feed.recent(800, 60);
        expect(WINDOW_S * 60).toBe(600);
        expect(out.effects.map((e) => e.tick)).toEqual([700, 800]);
        expect(out.ticker).toEqual([{ tick: 790, kind: 'last-stand', lineageId: 4, x: 7, y: 8 }]);
    });

    it('overwrites the oldest past capacity and forgets on clear', () => {
        const feed = createDirectorFeed();
        for (let t = 1; t <= FEED_EFFECTS + 5; t++) {
            feed.noteEffect(effect(t));
        }
        const all = feed.recent(FEED_EFFECTS + 5, 1e9).effects;
        expect(all).toHaveLength(FEED_EFFECTS);
        expect(all[0].tick).toBe(6);
        feed.clear();
        expect(feed.recent(FEED_EFFECTS + 5, 1e9).effects).toEqual([]);
    });
});
