import { describe, expect, it } from 'vitest';
import { createCameraController } from '../../js/app/camera.js';
import { createFxDev, fxAfterDraw, fxPerf, fxSink, readFxParams } from '../../js/app/fx-dev.js';
import { createEffectsPlayer } from '../../js/app/renderer/effects-player.js';
import { fakeDocument } from './helpers/fake-dom.js';

const fakeElement = () => fakeDocument().createElement('div');

describe('readFxParams', () => {
    it('reads the overlay, demo, hold and stress switches and ignores bad values', () => {
        expect(readFxParams('?fxlog=1&fxdemo=combat&fxhold=12&fxstress=1')).toEqual({
            fxlog: true,
            fxdemo: 'combat',
            fxhold: 12,
            fxstress: true,
        });
        expect(readFxParams('?fxdemo=all').fxdemo).toBe('all');
        expect(readFxParams('?fxdemo=sparkles&fxhold=x')).toEqual({
            fxlog: false,
            fxdemo: null,
            fxhold: null,
            fxstress: false,
        });
    });
});

describe('createFxDev', () => {
    it('is null when no tool is asked for', () => {
        const params = readFxParams('');
        expect(createFxDev({ params, doc: fakeDocument(), parent: fakeElement(), target: {} })).toBeNull();
    });

    it('mounts the overlay once a world is ready, logs effects, and lists the demo cells on the target', () => {
        const layout = { effectKinds: { BITE: 3 }, deathCauses: {}, bornCauses: {} };
        const parent = fakeElement();
        /** @type {Record<string, any>} */
        const target = {};
        const dev = /** @type {any} */ (
            createFxDev({ params: readFxParams('?fxlog=1&fxdemo=calls'), doc: fakeDocument(), parent, target })
        );
        const player = createEffectsPlayer({
            layout,
            info: { callRadius: 100, callTicks: 30, maxAgents: 4 },
        });
        const camera = createCameraController({
            canvas: /** @type {any} */ ({ width: 800, height: 400 }),
            world: { width: 4000, height: 2000 },
        });
        const ctx = { player, camera, client: null, ready: { layout }, cssScale: 1 };
        dev.afterDraw({ tick: 1, dtMs: 16, nowMs: 1000 }, ctx);
        expect(parent.children).toHaveLength(1);
        dev.onEffect({ kind: 3, x: 0, y: 0, c: 0, d: 0 }, 1000);
        expect(target.__fxdemo.cells.length).toBeGreaterThan(0);
        expect(target.__fxdemo.cells[0].size).toBeCloseTo(150 * camera.zoom);
    });
});

describe('fxSink, fxAfterDraw and fxPerf', () => {
    /** @returns {any} a page with no effect tools */
    function page() {
        const seen = /** @type {string[]} */ ([]);
        return {
            seen,
            fxDev: null,
            iface: { onEffect: () => seen.push('effect'), afterDraw: () => seen.push('draw') },
            deps: { refs: { player: null }, scene: null },
        };
    }

    it('always tells the interface, and the tools only when they exist', () => {
        const app = page();
        fxSink(app, { kind: 3 });
        fxAfterDraw(app, {});
        expect(app.seen).toEqual(['effect', 'draw']);
        expect(fxPerf(app)).toEqual({ fx: null, drawCalls: null });
        const calls = /** @type {string[]} */ ([]);
        app.fxDev = {
            onEffect: () => calls.push('note'),
            afterDraw: (/** @type {any} */ _f, /** @type {any} */ ctx) => calls.push(`draw ${ctx.cssScale}`),
        };
        Object.assign(app, {
            camera: { canvas: { width: 200 } },
            container: { clientWidth: 100 },
            supervisor: { client: () => null },
            ready: null,
        });
        fxSink(app, { kind: 3 });
        fxAfterDraw(app, {});
        expect(calls).toEqual(['note', 'draw 0.5']);
    });

    it('reports the budget counts, the pool occupancy and the draw calls once a world exists', () => {
        const app = page();
        app.deps.refs.player = createEffectsPlayer({
            layout: { effectKinds: {}, deathCauses: {} },
            info: { callRadius: 1, callTicks: 1 },
        });
        app.deps.scene = { renderer: { info: { render: { calls: 7 } } } };
        const perf = fxPerf(app);
        expect(perf.drawCalls).toBe(7);
        expect(perf.fx?.occupancy).toBe(0);
        expect(perf.fx?.combat).toEqual({ spawned: 0, dropped: 0, culled: 0 });
    });
});

describe('createFxDev with the overlay alone', () => {
    it('mounts once per world, replaces the overlay for a new world, and lists no demo', () => {
        const parent = fakeElement();
        /** @type {Record<string, any>} */
        const target = {};
        const dev = /** @type {any} */ (
            createFxDev({ params: readFxParams('?fxlog=1'), doc: fakeDocument(), parent, target })
        );
        const camera = createCameraController({
            canvas: /** @type {any} */ ({ width: 100, height: 100 }),
            world: { width: 100, height: 100 },
        });
        const layout = { effectKinds: {}, deathCauses: {} };
        const ctx = { player: null, camera, client: null, ready: null, cssScale: 1 };
        dev.afterDraw({ nowMs: 1 }, ctx);
        expect(parent.children).toHaveLength(0);
        const ready = { layout };
        dev.afterDraw({ nowMs: 2 }, { ...ctx, ready });
        dev.afterDraw({ nowMs: 3 }, { ...ctx, ready });
        expect(parent.children).toHaveLength(1);
        dev.afterDraw({ nowMs: 4 }, { ...ctx, ready: { layout } });
        expect(parent.children).toHaveLength(1);
        expect(target.__fxdemo).toBeUndefined();
    });
});
