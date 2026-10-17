import { describe, expect, it } from 'vitest';
import { dismissCard, FIRST_VISIT_TICKS_PER_SECOND, firstVisit } from '../../js/app/interface-visit.js';
import { mountTitleCard } from '../../js/app/ui/title-card.js';
import { byClass, fakeDocument } from './helpers/fake-dom.js';

const READY = { info: { specs: [{ name: 'predator' }, { name: 'forager' }] } };

/**
 * @param {{seen?: boolean, pinned?: boolean}} [options] whether the card was seen and the speed pinned
 * @returns {any} shared parts over fakes
 */
function setup({ seen = false, pinned = false } = {}) {
    const doc = fakeDocument();
    const root = doc.createElement('div');
    const calls = /** @type {any[]} */ ([]);
    const ctx = {
        deps: {
            now: () => 500,
            speedPinned: pinned,
            state: { requestedTicksPerSecond: 60 },
            getClient: () => ({ setSpeed: (/** @type {number} */ n) => calls.push(['setSpeed', n]) }),
        },
        prefs: { seen },
        card: mountTitleCard(doc, root),
        help: { setLegend: (/** @type {any} */ v) => calls.push(['legend', v.legend.length]) },
        shownCard: false,
        persist: () => calls.push(['persist']),
    };
    return { ctx, calls, root };
}

describe('firstVisit', () => {
    it('shows the card, fills the help legend and starts at x2', () => {
        const { ctx, calls } = setup();
        firstVisit(ctx, READY);
        expect(ctx.card.visible()).toBe(true);
        expect(calls).toEqual([
            ['legend', 2],
            ['setSpeed', FIRST_VISIT_TICKS_PER_SECOND],
        ]);
        expect(ctx.deps.state.requestedTicksPerSecond).toBe(120);
    });

    it('keeps a pinned speed', () => {
        const { ctx, calls } = setup({ pinned: true });
        firstVisit(ctx, READY);
        expect(ctx.card.visible()).toBe(true);
        expect(calls).toEqual([['legend', 2]]);
    });

    it('shows nothing on a later visit and nothing again for a second world in the same visit', () => {
        const seen = setup({ seen: true });
        firstVisit(seen.ctx, READY);
        expect(seen.ctx.card.visible()).toBe(false);
        const twice = setup();
        firstVisit(twice.ctx, READY);
        twice.ctx.card.hide();
        firstVisit(twice.ctx, READY);
        expect(twice.ctx.card.visible()).toBe(false);
        expect(twice.calls.filter((/** @type {any[]} */ c) => c[0] === 'setSpeed')).toHaveLength(1);
    });
});

describe('dismissCard', () => {
    it('hides the card and remembers it once, and does nothing when it is not showing', () => {
        const { ctx, calls, root } = setup();
        dismissCard(ctx);
        expect(calls).toEqual([]);
        firstVisit(ctx, READY);
        calls.length = 0;
        dismissCard(ctx);
        dismissCard(ctx);
        expect(ctx.prefs.seen).toBe(true);
        expect(calls).toEqual([['persist']]);
        expect(byClass(root, 'title-card')[0].hidden).toBe(true);
    });
});
