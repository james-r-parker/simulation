import { describe, expect, it } from 'vitest';
import { CURVE, FX_SHAPES } from '../../../js/app/renderer/fx-curves.js';
import { createFxLayers, FX_SWITCH } from '../../../js/app/renderer/fx-draw.js';
import { createFxPool, spawnFx } from '../../../js/app/renderer/fx-ring.js';

describe('createFxLayers', () => {
    it('draws live particles in their shape mesh and flashes in the glow mesh', () => {
        const pool = createFxPool();
        const base = {
            x: 0,
            y: 0,
            angle: 0,
            size: 4,
            r: 1,
            g: 1,
            b: 1,
            gain: 1,
            tick: 100,
            life: 10,
            seed: 0,
            reach: 10,
            stretch: 1,
            minPx: 2,
        };
        spawnFx(pool, { ...base, curve: CURVE.ring });
        spawnFx(pool, { ...base, curve: CURVE.flash });
        const [particles, flashes] = createFxLayers({ pool });
        particles.update?.(
            /** @type {any} */ ({
                tick: 102,
                camera: { zoom: 1 },
                lenses: { calls: false },
                family: { palette: 'default' },
            }),
        );
        expect(particles.object.children[FX_SHAPES.indexOf('RING')].geometry.instanceCount).toBe(1);
        expect(flashes.object.geometry.instanceCount).toBe(1);
        expect(flashes.object.material.blending).toBe(2);
        FX_SWITCH.on = false;
        particles.update?.(
            /** @type {any} */ ({
                tick: 102,
                camera: { zoom: 1 },
                lenses: { calls: false },
                family: { palette: 'default' },
            }),
        );
        expect(flashes.object.geometry.instanceCount).toBe(0);
        FX_SWITCH.on = true;
        particles.dispose();
        flashes.dispose();
    });
});

describe('createFxLayers lenses', () => {
    it('boosts call effects under the calls lens and the high-contrast palette', () => {
        const pool = createFxPool();
        spawnFx(pool, {
            x: 0,
            y: 0,
            angle: 0,
            size: 4,
            r: 1,
            g: 1,
            b: 1,
            gain: 1,
            tick: 100,
            life: 10,
            seed: 0,
            reach: 10,
            stretch: 1,
            minPx: 2,
            curve: CURVE.callRing,
        });
        const [particles] = createFxLayers({ pool });
        particles.update?.(
            /** @type {any} */ ({
                tick: 101,
                camera: { zoom: 1 },
                lenses: { calls: true },
                family: { palette: 'high-contrast' },
            }),
        );
        expect(particles.object.children[FX_SHAPES.indexOf('RING')].geometry.instanceCount).toBe(1);
        particles.dispose();
    });
});
