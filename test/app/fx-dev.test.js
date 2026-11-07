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

describe('the page hooks', () => {
    it('fxSink tells the interface, then the overlay when there is one', () => {
        /** @type {string[]} */
        const seen = [];
        const effect = { kind: 1 };
        const app = { iface: { onEffect: () => seen.push('iface') }, fxDev: null };
        fxSink(app, effect);
        fxSink({ ...app, fxDev: { onEffect: () => seen.push('dev') } }, effect);
        expect(seen).toEqual(['iface', 'iface', 'dev']);
    });

    it('fxAfterDraw always runs the interface hook and the overlay only when the URL asked for it', () => {
        /** @type {any[]} */
        const calls = [];
        const player = {};
        const app = {
            iface: { afterDraw: () => calls.push('iface') },
            fxDev: null,
            deps: { refs: { player } },
            camera: { canvas: { width: 200 } },
            supervisor: { client: () => 'client' },
            ready: 'ready',
            container: { clientWidth: 100 },
        };
        fxAfterDraw(app, { tick: 1 });
        expect(calls).toEqual(['iface']);
        const dev = { afterDraw: (/** @type {any} */ f, /** @type {any} */ ctx) => calls.push(ctx) };
        fxAfterDraw({ ...app, fxDev: dev }, { tick: 2 });
        expect(calls[2]).toEqual({ player, camera: app.camera, client: 'client', ready: 'ready', cssScale: 0.5 });
    });

    it('fxPerf reports nulls before the player and the budget counts after it', () => {
        expect(fxPerf({ deps: { refs: { player: null }, scene: null } })).toEqual({ fx: null, drawCalls: null });
        const layout = { effectKinds: {}, deathCauses: {}, bornCauses: {} };
        const player = createEffectsPlayer({ layout, info: { callRadius: 1, callTicks: 1, maxAgents: 4 } });
        const scene = { renderer: { info: { render: { calls: 7 } } } };
        const perf = fxPerf({ deps: { refs: { player }, scene } });
        expect(perf.drawCalls).toBe(7);
        expect(Object.keys(perf.fx ?? {}).length).toBeGreaterThan(0);
    });
});
