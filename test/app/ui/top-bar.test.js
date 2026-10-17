import { describe, expect, it } from 'vitest';
import { elapsedLabel, mountTopBar, topBarInput, topBarView } from '../../../js/app/ui/top-bar.js';
import { byClass, fakeDocument } from '../helpers/fake-dom.js';

const STATE = { requestedTicksPerSecond: 60, notice: '' };
const INFO = {
    seasonNames: ['spring', 'summer'],
    specs: [
        { index: 0, name: 'predator' },
        { index: 1, name: 'forager' },
    ],
};

/** @param {Record<string, any>} [over] fields to change @returns {any} an input as `topBarInput` makes it */
function input(over = {}) {
    return {
        tick: 1,
        ticksPerSecond: 60,
        population: 1,
        season: 'spring',
        seasonProgress: 0.5,
        types: [],
        bornShare: null,
        ...over,
    };
}

describe('elapsedLabel', () => {
    it('counts simulated seconds at x1', () => {
        expect(elapsedLabel(0)).toBe('0:00');
        expect(elapsedLabel(60 * 42)).toBe('0:42');
        expect(elapsedLabel(60 * 125)).toBe('2:05');
        expect(elapsedLabel(60 * 3909)).toBe('1:05:09');
    });
});

describe('topBarView', () => {
    it('shows zeros before the first stats', () => {
        expect(topBarView(null, STATE, false)).toEqual({
            tick: 'tick 0',
            elapsed: '0:00',
            speed: 'x1',
            season: '',
            seasonProgress: 0,
            types: [],
            born: 'born -',
            population: 'pop 0',
            notice: '',
        });
    });

    it('groups the tick and shows the population, the season and the counts by type', () => {
        const view = topBarView(
            input({ tick: 1234567, population: 250, types: [{ name: 'predator', count: 1500 }], bornShare: 0.424 }),
            STATE,
            false,
        );
        expect(view).toMatchObject({
            tick: 'tick 1,234,567',
            population: 'pop 250',
            speed: 'x1',
            season: 'spring',
            types: [{ name: 'predator', count: '1,500' }],
            born: 'born 42%',
        });
    });

    it('shows the actual rate beside the requested speed only when they differ', () => {
        const state = { requestedTicksPerSecond: 240, notice: '' };
        expect(topBarView(input({ ticksPerSecond: 240 }), state, false).speed).toBe('x4');
        expect(topBarView(input({ ticksPerSecond: 150 }), state, false).speed).toBe('x4 (x2.5)');
    });

    it('says paused while paused and carries the notice', () => {
        const state = { requestedTicksPerSecond: 60, notice: 'hello' };
        expect(topBarView(null, state, true)).toMatchObject({ speed: 'paused', notice: 'hello' });
    });
});

describe('topBarInput', () => {
    it('is null before a client or a snapshot exists', () => {
        expect(topBarInput(null)).toBeNull();
        expect(topBarInput({ latest: null, stats: null })).toBeNull();
    });

    it('reads the tick and population from the newest snapshot and the rest from the stats', () => {
        const u32 = new Uint32Array([0, 37]);
        const stats = { ticksPerSecond: 58, season: 1, seasonProgress: 0.25, bySpec: [3, 34], bornShare: 0.5 };
        expect(topBarInput({ latest: { tick: 912, u32 }, stats, ready: { info: INFO } })).toEqual({
            tick: 912,
            population: 37,
            ticksPerSecond: 58,
            season: 'summer',
            seasonProgress: 0.25,
            types: [
                { name: 'predator', count: 3 },
                { name: 'forager', count: 34 },
            ],
            bornShare: 0.5,
        });
    });

    it('reports zeros before the first stats, and keeps counting steps while paused', () => {
        const u32 = new Uint32Array([0, 5]);
        const before = topBarInput({ latest: { tick: 3, u32 }, stats: null, ready: { info: INFO } });
        expect(before).toMatchObject({ ticksPerSecond: 0, season: '', bornShare: null });
        expect(before?.types.map((t) => t.count)).toEqual([0, 0]);
        expect(topBarInput({ latest: { tick: 4, u32 }, stats: null })?.tick).toBe(4);
    });
});

describe('mountTopBar', () => {
    it('writes the view into its nodes and builds one icon node per type', () => {
        const doc = fakeDocument();
        const root = doc.createElement('div');
        const update = mountTopBar(doc, root);
        update(topBarView(input({ tick: 5, types: [{ name: 'predator', count: 2 }] }), STATE, false));
        expect(byClass(root, 'top-bar-tick')[0].textContent).toBe('tick 5');
        expect(byClass(root, 'top-bar-season')).toHaveLength(0);
        expect(byClass(root, 'season-ring')[0].style['--p']).toBe('50%');
        const [type] = byClass(root, 'top-bar-type');
        expect(type.getAttribute('title')).toBe('predator');
        expect(type.children[1].textContent).toBe('2');
    });

    it('rebuilds a type node when the specialisation at its place changes, and reuses it otherwise', () => {
        const doc = fakeDocument();
        const root = doc.createElement('div');
        const update = mountTopBar(doc, root);
        const view = (/** @type {string} */ name, /** @type {number} */ count) =>
            topBarView(input({ types: [{ name, count }] }), STATE, false);
        update(view('predator', 1));
        const first = byClass(root, 'top-bar-type')[0];
        update(view('predator', 9));
        expect(byClass(root, 'top-bar-type')[0]).toBe(first);
        expect(first.children[1].textContent).toBe('9');
        update(view('scout', 9));
        expect(byClass(root, 'top-bar-type')).toHaveLength(1);
        expect(byClass(root, 'top-bar-type')[0]).not.toBe(first);
    });

    it('rewrites a node only when its text changed', () => {
        const doc = fakeDocument();
        const root = doc.createElement('div');
        const update = mountTopBar(doc, root);
        let writes = 0;
        for (const node of root.children) {
            let text = '';
            Object.defineProperty(node, 'textContent', {
                get: () => text,
                set: (v) => {
                    writes += 1;
                    text = v;
                },
            });
        }
        const view = topBarView(input({ tick: 5, population: 9 }), STATE, false);
        update(view);
        const first = writes;
        update(view);
        expect(writes).toBe(first);
        update({ ...view, tick: 'tick 6' });
        expect(writes).toBe(first + 1);
    });
});
