// The carcass loss detectors (honest-budgets T33b) against hand-built counters and food pools.

import { describe, expect, it } from 'vitest';
import { CARCASS_LOSS, FOOD_KIND, FOOD_ORIGIN } from '../../js/sim/carcass.js';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { carcassLossMetrics, createLossScene, noteLossBase } from '../../js/evo/scene-carcass-loss.js';

/**
 * @param {{placed?: number, lost?: number, tick?: number, standing?: number}} state the counters, the tick and the value of
 *   one standing carcass
 * @returns {Record<string, any>} a hand-built world
 */
function worldOf({ placed = 0, lost = 0, tick = BURN_IN_TICKS + 1000, standing = 0 }) {
    const loss = new Float64Array(3);
    loss[CARCASS_LOSS.PLACED] = placed;
    loss[CARCASS_LOSS.LOST] = lost;
    return {
        tick,
        carcassLoss: loss,
        foodAlive: new Uint8Array([1, 1]),
        foodKind: new Uint8Array([FOOD_KIND.MEAT, FOOD_KIND.MEAT]),
        foodOrigin: new Uint8Array([FOOD_ORIGIN.NONE, FOOD_ORIGIN.HERD_CARCASS]),
        foodValue: new Float64Array([standing, 9999]),
    };
}

describe('carcass loss shares', () => {
    it('split the offer into lost, eaten and faded, the standing carcass and a herd carcass left out', () => {
        const scene = createLossScene();
        noteLossBase(scene, worldOf({ placed: 100, lost: 10, tick: BURN_IN_TICKS }));
        // After burn-in: placed 600 and lost 200 (offer 800); 400 eaten; 80 still standing; the rest faded.
        const m = carcassLossMetrics(scene, worldOf({ placed: 700, lost: 210, standing: 80 }), 400);
        expect(m['eval.carcass_loss_share.lost']).toEqual({ value: 0.25 });
        expect(m['eval.carcass_loss_share.eaten']).toEqual({ value: 0.5 });
        expect(m['eval.carcass_loss_share.faded']?.value).toBeCloseTo(1 - 0.25 - 0.5 - 0.1, 12);
        expect(m['eval.carcass_lost_per_1k']).toEqual({ value: 200 });
    });

    it('cap the eaten share at the energy placed after burn-in', () => {
        const scene = createLossScene();
        noteLossBase(scene, worldOf({ tick: BURN_IN_TICKS }));
        const m = carcassLossMetrics(scene, worldOf({ placed: 100 }), 500);
        expect(m['eval.carcass_loss_share.eaten']).toEqual({ value: 1 });
        expect(m['eval.carcass_loss_share.faded']).toEqual({ value: 0 });
    });

    it('read a full pool that lost everything as a lost share of 1', () => {
        const scene = createLossScene();
        noteLossBase(scene, worldOf({ tick: BURN_IN_TICKS }));
        const m = carcassLossMetrics(scene, worldOf({ lost: 640 }), 0);
        expect(m['eval.carcass_loss_share.lost']).toEqual({ value: 1 });
    });

    it('are null with a reason when no carcass was offered, and the rate reads 0', () => {
        const scene = createLossScene();
        noteLossBase(scene, worldOf({ tick: BURN_IN_TICKS }));
        const m = carcassLossMetrics(scene, worldOf({}), 0);
        expect(m['eval.carcass_loss_share.lost']).toEqual({
            value: null,
            reason: 'no carcass energy offered after burn-in',
        });
        expect(m['eval.carcass_lost_per_1k']).toEqual({ value: 0 });
    });

    it('are null when the run never reached burn-in', () => {
        const m = carcassLossMetrics(createLossScene(), worldOf({ tick: 10 }), 0);
        expect(m['eval.carcass_loss_share.eaten']?.reason).toBe('the run ended before burn-in');
        expect(m['eval.carcass_lost_per_1k']?.value).toBeNull();
    });
});
