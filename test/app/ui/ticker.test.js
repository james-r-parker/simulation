import { describe, expect, it } from 'vitest';
import {
    createTickerQueue,
    formatTickerItem,
    lineOpacity,
    mountTicker,
    TICKER_FADE_MS,
    TICKER_LINES,
    TICKER_MAX_CHARS,
    TICKER_SHOW_MS,
} from '../../../js/app/ui/ticker.js';
import { fakeDocument } from '../helpers/fake-dom.js';

/** @param {string} text @param {string} [kind] @returns {{text: string, kind: string}} an item */
const item = (text, kind = 'elite') => ({ text, kind });

describe('formatTickerItem', () => {
    it('trims and cuts a long line', () => {
        expect(formatTickerItem(item('  family Alba leads  '))).toBe('family Alba leads');
        const cut = formatTickerItem(item('x'.repeat(500)));
        expect(cut).toHaveLength(TICKER_MAX_CHARS);
        expect(cut.endsWith('...')).toBe(true);
    });
});

describe('createTickerQueue', () => {
    it('holds at most four lines, dropping the oldest', () => {
        const queue = createTickerQueue();
        queue.push(
            ['a', 'b', 'c', 'd', 'e'].map((t) => item(t)),
            0,
        );
        expect(queue.current(0).map((l) => l.text)).toEqual(['b', 'c', 'd', 'e']);
        expect(queue.current(0)).toHaveLength(TICKER_LINES);
    });

    it('expires a line after its show time, oldest first', () => {
        const queue = createTickerQueue();
        queue.push([item('old')], 0);
        queue.push([item('new')], 3000);
        expect(queue.current(TICKER_SHOW_MS - 1)).toHaveLength(2);
        expect(queue.current(TICKER_SHOW_MS).map((l) => l.text)).toEqual(['new']);
        expect(queue.current(3000 + TICKER_SHOW_MS)).toHaveLength(0);
    });

    it('clears', () => {
        const queue = createTickerQueue();
        queue.push([item('a')], 0);
        queue.clear();
        expect(queue.current(0)).toHaveLength(0);
    });
});

describe('lineOpacity', () => {
    it('stays at 1, then fades to 0 over the last fade window', () => {
        expect(lineOpacity(0)).toBe(1);
        expect(lineOpacity(TICKER_SHOW_MS - TICKER_FADE_MS)).toBe(1);
        expect(lineOpacity(TICKER_SHOW_MS - TICKER_FADE_MS / 2)).toBeCloseTo(0.5);
        expect(lineOpacity(TICKER_SHOW_MS + 100)).toBe(0);
    });
});

describe('mountTicker', () => {
    it('recycles four nodes: shows the lines, hides the rest, tags the kind', () => {
        const doc = fakeDocument();
        const root = doc.createElement('div');
        const update = mountTicker(doc, root);
        expect(root.children).toHaveLength(TICKER_LINES);
        const queue = createTickerQueue();
        queue.push([item('first', 'extinct'), item('second')], 100);
        update(queue.current(100), 100);
        expect(root.children.map((/** @type {any} */ n) => n.hidden)).toEqual([false, false, true, true]);
        expect(root.children[0].textContent).toBe('first');
        expect(root.children[0].className).toBe('ticker-line ticker-extinct');
        update(queue.current(100 + TICKER_SHOW_MS), 100 + TICKER_SHOW_MS);
        expect(root.children.every((/** @type {any} */ n) => n.hidden && n.textContent === '')).toBe(true);
    });

    it('writes the opacity only when its rounded value changes', () => {
        const doc = fakeDocument();
        const root = doc.createElement('div');
        const update = mountTicker(doc, root);
        const queue = createTickerQueue();
        queue.push([item('a')], 0);
        update(queue.current(0), 0);
        expect(root.children[0].style.opacity).toBe('1');
        update(queue.current(7500), 7500);
        expect(root.children[0].style.opacity).toBe('0.35');
    });
});
