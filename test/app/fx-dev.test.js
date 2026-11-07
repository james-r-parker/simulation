import { describe, expect, it } from 'vitest';
import { createCameraController } from '../../js/app/camera.js';
import { createFxDev, readFxParams } from '../../js/app/fx-dev.js';
import { createEffectsPlayer } from '../../js/app/renderer/effects-player.js';
import { createRingPool } from '../../js/app/renderer/rings.js';
import { createSparkPool } from '../../js/app/renderer/sparks.js';
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
            rings: createRingPool(),
            sparks: createSparkPool(1),
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
        expect(target.__fxdemo.cells[0].size).toBeCloseTo(300);
    });
});
