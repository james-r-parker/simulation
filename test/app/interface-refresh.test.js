import { describe, expect, it } from 'vitest';
import { REFRESH_MS, refreshParts } from '../../js/app/interface-refresh.js';

/**
 * @param {{drawer?: string | null}} [options] the open drawer
 * @returns {{ctx: any, log: string[]}} shared parts that log what is refreshed
 */
function setup({ drawer = null } = {}) {
    const log = /** @type {string[]} */ ([]);
    const ctx = {
        last: Object.fromEntries(Object.keys(REFRESH_MS).map((k) => [k, -Infinity])),
        shifted: { x: 0, y: 0 },
        deps: {
            elements: { bar: { style: {} }, ticker: { style: {} } },
            getClient: () => ({ paused: false, latest: null, stats: null }),
            getReady: () => null,
            overrides: {},
            state: { requestedTicksPerSecond: 60, notice: '' },
            slots: {},
        },
        chartData: { data: () => null },
        barUpdate: () => log.push('bar'),
        help: { setDebug: () => log.push('debug'), setRun: () => undefined },
        controls: { update: () => log.push('controls') },
        fade: { tick: () => log.push('fade') },
        idle: { idleMs: () => 0 },
        card: { element: { style: {} }, visible: () => false, expired: () => false },
        queue: { current: () => [] },
        tickerUpdate: () => log.push('ticker'),
        drawers: { state: () => drawer },
        inspector: { update: () => log.push('inspector') },
        charts: { update: () => log.push('charts') },
        peek: { hide: () => log.push('peekHide'), show() {} },
        peekTracker: { position: () => ({ x: 0, y: 0 }), rested: () => false },
    };
    return { ctx, log };
}

describe('refreshParts', () => {
    it('refreshes the always-on parts at their rates and leaves the drawer parts alone while closed', () => {
        const { ctx, log } = setup();
        refreshParts(ctx, 1000);
        expect(log).toEqual(expect.arrayContaining(['fade', 'bar', 'debug', 'controls', 'peekHide', 'ticker']));
        expect(log).not.toContain('inspector');
        expect(log).not.toContain('charts');
        log.length = 0;
        refreshParts(ctx, 1000 + REFRESH_MS.ticker - 1);
        expect(log).not.toContain('ticker');
        expect(log).not.toContain('bar');
        refreshParts(ctx, 1000 + REFRESH_MS.ticker);
        expect(log).toContain('ticker');
        expect(log).not.toContain('bar');
    });

    it('refreshes the inspector or the charts while their drawer is open', () => {
        const inspector = setup({ drawer: 'inspector' });
        refreshParts(inspector.ctx, 0);
        expect(inspector.log).toContain('inspector');
        const charts = setup({ drawer: 'charts' });
        refreshParts(charts.ctx, 0);
        expect(charts.log).toContain('charts');
    });

    it('shifts the persistent nodes with whole-pixel offsets', () => {
        const { ctx } = setup();
        refreshParts(ctx, 100_000);
        expect(ctx.deps.elements.bar.style.transform).toMatch(/^translate\(/);
    });
});
