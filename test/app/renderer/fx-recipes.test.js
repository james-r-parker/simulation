import { describe, expect, it } from 'vitest';
import { PALETTE } from '../../../js/app/renderer/colors.js';
import { BAND, FAMILY, setFxLook } from '../../../js/app/renderer/fx-budget.js';
import { CURVE, FX_CURVES } from '../../../js/app/renderer/fx-curves.js';
import { createFxPool, isLive } from '../../../js/app/renderer/fx-pool.js';
import { createFxPlayer, DEATH_RECIPES, FX_RECIPES, playRecipe } from '../../../js/app/renderer/fx-recipes.js';
import { LOOK_OFF } from '../../../js/app/renderer/quality.js';

/** @returns {import('../../../js/app/renderer/fx-recipes.js').FxAt} a spot */
function at() {
    return { x: 10, y: 20, angle: 0.5, size: 10, tick: 100, rgb: [0.2, 0.4, 0.6] };
}

/**
 * @param {import('../../../js/app/renderer/fx-pool.js').FxPool} pool the pool
 * @param {number} tick the tick
 * @returns {number} live instances
 */
function live(pool, tick) {
    let n = 0;
    for (let i = 0; i < pool.limit; i++) {
        n += isLive(pool, i, tick) ? 1 : 0;
    }
    return n;
}

describe('FX_RECIPES', () => {
    it('every part names a known curve with a positive count, life and size', () => {
        for (const [name, r] of Object.entries(FX_RECIPES)) {
            for (const part of r.parts) {
                expect(FX_CURVES[part.curve], name).toBeDefined();
                expect(part.count, name).toBeGreaterThan(0);
                expect(part.life === -1 || part.life > 0, name).toBe(true);
                expect(part.size, name).toBeGreaterThan(0);
                if (part.color !== undefined) {
                    expect(PALETTE[part.color], `${name} ${part.color}`).toBeDefined();
                }
            }
        }
    });

    it('gives every death cause its own recipe, each with a different first curve or count', () => {
        const keys = Object.values(DEATH_RECIPES).map((r) => r.parts.map((p) => `${p.curve}x${p.count}`).join(','));
        expect(new Set(keys).size).toBe(Object.keys(DEATH_RECIPES).length);
        expect(Object.keys(DEATH_RECIPES)).toEqual([
            'STARVED',
            'EATEN',
            'COLLISION',
            'OLD_AGE',
            'POISONED',
            'TRAMPLED',
            'DISEASE',
        ]);
    });
});

describe('playRecipe', () => {
    it('spawns each part at its count, scaled by the agent size, coloured by its role or the effect', () => {
        const fx = createFxPlayer(createFxPool());
        expect(playRecipe(fx, FX_RECIPES.eaten, at())).toBe(8);
        const { pool } = fx;
        expect(pool.time[2]).toBe(CURVE.flash);
        expect(pool.pose[3]).toBeCloseTo(14);
        expect(Array.from(pool.color.subarray(0, 3))).toEqual(PALETTE.eatenFlash.map((v) => Math.fround(v)));
        expect(Array.from(pool.color.subarray(7 * 4, 7 * 4 + 3))).toEqual([0.2, 0.4, 0.6].map((v) => Math.fround(v)));
        expect(live(pool, 101)).toBe(8);
        expect(live(pool, 100 + 21)).toBe(6);
    });

    it('spreads a ring part evenly and delays a part by its delay', () => {
        const fx = createFxPlayer(createFxPool());
        playRecipe(fx, FX_RECIPES.biteJaw, at());
        const a0 = fx.pool.pose[2];
        const a1 = fx.pool.pose[6];
        expect(a1 - a0).toBeCloseTo(Math.fround((2 * Math.PI) / 6), 4);
        const g = createFxPlayer(createFxPool());
        playRecipe(g, FX_RECIPES.packKill, at());
        expect(g.pool.time[4] - g.pool.time[0]).toBe(6);
    });

    it('collapses to one lead instance per part at the far band, and spawns nothing for a family switched off', () => {
        const fx = createFxPlayer(createFxPool());
        fx.budget.band = BAND.FAR;
        expect(playRecipe(fx, FX_RECIPES.eaten, at())).toBe(3);
        setFxLook(fx.budget, { combat: LOOK_OFF });
        expect(playRecipe(fx, FX_RECIPES.eaten, at())).toBe(0);
        expect(FAMILY.combat).toBe(0);
    });

    it('floors each life at the wall-time minimum', () => {
        const fx = createFxPlayer(createFxPool());
        fx.budget.ticksPerMs = 0.24;
        playRecipe(fx, FX_RECIPES.biteJaw, at());
        expect(fx.pool.time[1]).toBeCloseTo(60);
    });
});
