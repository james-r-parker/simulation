import { describe, expect, it } from 'vitest';
import { createChartsLifecycle } from '../../js/app/interface-charts.js';
import { createChartData } from '../../js/app/interface-data.js';
import { fakeDocument } from './helpers/fake-dom.js';
import { selectedWorld } from './helpers/inspect-world.js';

const { ready } = selectedWorld();

class FakeUPlot {
    static made = 0;
    static paths = { bars: () => 'bars' };
    constructor() {
        FakeUPlot.made += 1;
    }
    setData() {}
    destroy() {}
}

/** @param {() => Promise<any>} loadUPlot @returns {any} a lifecycle with an open charts drawer */
function setup(loadUPlot) {
    FakeUPlot.made = 0;
    const doc = fakeDocument();
    const body = doc.createElement('div');
    const data = createChartData();
    data.ready(ready);
    const toasts = /** @type {string[]} */ ([]);
    const open = { value: true };
    const charts = createChartsLifecycle({
        doc,
        drawers: { state: () => (open.value ? 'charts' : null), body: () => body },
        loadUPlot,
        toast: (t) => toasts.push(t),
        getData: data.data,
    });
    return { charts, toasts, open, body };
}

describe('createChartsLifecycle', () => {
    it('loads uPlot once however often the drawer opens', async () => {
        let loads = 0;
        const { charts } = setup(() => (loads++, Promise.resolve(FakeUPlot)));
        charts.open();
        await Promise.resolve();
        await Promise.resolve();
        charts.close();
        charts.open();
        expect(loads).toBe(1);
        expect(FakeUPlot.made).toBe(10);
    });

    it('toasts when uPlot fails to load', async () => {
        const { charts, toasts } = setup(() => Promise.reject(new Error('offline')));
        charts.open();
        await Promise.resolve();
        await Promise.resolve();
        expect(toasts).toEqual(['The charts could not load']);
        expect(FakeUPlot.made).toBe(0);
    });

    it('builds nothing if the drawer closed during the load, and update is safe when closed', async () => {
        const { charts, open } = setup(() => Promise.resolve(FakeUPlot));
        charts.open();
        open.value = false;
        await Promise.resolve();
        await Promise.resolve();
        expect(FakeUPlot.made).toBe(0);
        expect(() => charts.update()).not.toThrow();
    });
});
