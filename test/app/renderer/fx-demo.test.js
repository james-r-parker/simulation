import { describe, expect, it } from 'vitest';
import { createCameraController } from '../../../js/app/camera.js';
import { createEffectsPlayer } from '../../../js/app/renderer/effects-player.js';
import { createFxDemo, DEMO_PERIOD, demoGrid, demoRecipes, demoZoom } from '../../../js/app/renderer/fx-demo.js';
import { FX_RECIPES } from '../../../js/app/renderer/fx-recipes.js';

/** @returns {{player: any, camera: any, client: any}} a context */
function ctx() {
    const player = createEffectsPlayer({
        layout: { effectKinds: {}, deathCauses: {} },
        info: { callRadius: 100, callTicks: 30, maxAgents: 8 },
    });
    const camera = createCameraController({
        canvas: /** @type {any} */ ({ width: 1920, height: 1080 }),
        world: { width: 8000, height: 4000 },
    });
    let paused = false;
    return {
        player,
        camera,
        client: {
            pause: () => (paused = true),
            get paused() {
                return paused;
            },
        },
    };
}

describe('demoRecipes and demoGrid', () => {
    it('lists every recipe for all, and only one family otherwise', () => {
        expect(demoRecipes('all')).toHaveLength(Object.keys(FX_RECIPES).length);
        expect(demoRecipes('feeding').map(([name]) => name)).toContain('eatMeat');
        expect(demoRecipes('feeding').map(([name]) => name)).not.toContain('eaten');
    });

    it('zooms so the whole grid fits the canvas, never past the most', () => {
        const z = demoZoom(45, { width: 1280, height: 720 });
        expect(z * 150 * 9.5).toBeLessThanOrEqual(1280 + 1e-9);
        expect(demoZoom(1, { width: 4000, height: 4000 })).toBe(2);
    });

    it('centres the grid on the given point', () => {
        const cells = demoGrid(10, { x: 100, y: 100 });
        const mx = cells.reduce((a, c) => a + c.x, 0) / 10;
        const my = cells.reduce((a, c) => a + c.y, 0) / 10;
        expect(mx).toBeCloseTo(100);
        expect(my).toBeCloseTo(100);
    });
});

describe('createFxDemo', () => {
    it('is null unless a demo or stress mode is asked for', () => {
        expect(createFxDemo({ family: null, hold: null, stress: false })).toBeNull();
    });

    it('pauses the world, frames the centre, replays every cell each period and holds its clock', () => {
        const c = ctx();
        const demo = /** @type {any} */ (createFxDemo({ family: 'combat', hold: 5, stress: false }));
        const frame = /** @type {any} */ ({ tick: 100, dtMs: 16 });
        demo.update(frame, c);
        expect(c.client.paused).toBe(true);
        expect(c.camera.zoom).toBeCloseTo(demoZoom(demo.cells.length, c.camera.canvas));
        expect(demo.cells).toHaveLength(demoRecipes('combat').length);
        const spawned = c.player.fx.pool.spawned;
        expect(spawned).toBeGreaterThan(demo.cells.length);
        for (let i = 0; i < DEMO_PERIOD * 2; i++) {
            demo.update(frame, c);
        }
        expect(c.player.fx.pool.clockOffset).toBe(5);
        expect(c.player.fx.pool.spawned).toBe(spawned);
    });

    it('stress mode plays recipes through the budget at about 60 a second', () => {
        const c = ctx();
        const demo = /** @type {any} */ (createFxDemo({ family: null, hold: null, stress: true }));
        for (let i = 0; i < 60; i++) {
            demo.update(/** @type {any} */ ({ tick: i, dtMs: 1000 / 60 }), c);
        }
        expect(
            c.player.fx.pool.spawned +
                c.player.fx.budget.dropped.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0),
        ).toBeGreaterThan(59);
    });

    it('does nothing before the effects player exists', () => {
        const demo = /** @type {any} */ (createFxDemo({ family: 'combat', hold: 5, stress: false }));
        const c = { ...ctx(), player: null };
        demo.update(/** @type {any} */ ({ tick: 1, dtMs: 16 }), c);
        expect(c.client.paused).not.toBe(true);
        expect(demo.cells).toHaveLength(0);
    });
});
