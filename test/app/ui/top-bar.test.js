import { describe, expect, it } from 'vitest';
import { mountTopBar, topBarInput, topBarView } from '../../../js/app/ui/top-bar.js';

const STATE = { requestedTicksPerSecond: 60, notice: '' };

describe('topBarView', () => {
    it('shows zeros before the first stats', () => {
        expect(topBarView(null, STATE, false)).toEqual({
            tick: 'tick 0',
            speed: 'x1',
            population: 'pop 0',
            notice: '',
        });
    });

    it('groups the tick and shows the population', () => {
        const view = topBarView({ tick: 1234567, ticksPerSecond: 60, population: 250 }, STATE, false);
        expect(view).toMatchObject({ tick: 'tick 1,234,567', population: 'pop 250', speed: 'x1' });
    });

    it('shows the actual rate beside the requested speed only when they differ', () => {
        const state = { requestedTicksPerSecond: 240, notice: '' };
        expect(topBarView({ tick: 1, ticksPerSecond: 240, population: 1 }, state, false).speed).toBe('x4');
        expect(topBarView({ tick: 1, ticksPerSecond: 150, population: 1 }, state, false).speed).toBe('x4 (x2.5)');
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

    it('reads the tick and population from the newest snapshot and the rate from the stats', () => {
        const u32 = new Uint32Array([0, 37]);
        expect(topBarInput({ latest: { tick: 912, u32 }, stats: { ticksPerSecond: 58 } })).toEqual({
            tick: 912,
            population: 37,
            ticksPerSecond: 58,
        });
    });

    it('reports a zero rate before the first stats, and keeps counting steps while paused', () => {
        const u32 = new Uint32Array([0, 5]);
        expect(topBarInput({ latest: { tick: 3, u32 }, stats: null })?.ticksPerSecond).toBe(0);
        expect(topBarInput({ latest: { tick: 4, u32 }, stats: null })?.tick).toBe(4);
    });
});

describe('mountTopBar', () => {
    /**
     * @returns {{doc: any, root: any}} a minimal document and a root that records its children
     */
    function fakeDom() {
        const doc = { createElement: () => ({ className: '', textContent: '' }) };
        const children = /** @type {any[]} */ ([]);
        return { doc, root: { appendChild: (/** @type {any} */ c) => children.push(c), children } };
    }

    it('creates one node per field and writes the view', () => {
        const { doc, root } = fakeDom();
        const update = mountTopBar(doc, root);
        update({ tick: 'tick 5', speed: 'x1', population: 'pop 9', notice: '' });
        expect(root.children.map((/** @type {any} */ c) => c.textContent)).toEqual(['tick 5', 'x1', 'pop 9', '']);
        expect(root.children[0].className).toBe('top-bar-tick');
    });

    it('rewrites a node only when its text changed', () => {
        const { doc, root } = fakeDom();
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
        const view = { tick: 'tick 5', speed: 'x1', population: 'pop 9', notice: '' };
        update(view);
        update(view);
        update({ ...view, tick: 'tick 6' });
        expect(writes).toBe(4);
    });
});
