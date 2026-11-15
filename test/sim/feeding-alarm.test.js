// Honest alarm (honest-budgets Phase 5): a bite on a victim whose seen alarm is running moves `alarmBiteShare` of the
// energy; an unseen call, a silent prey and the default move the full bite.

import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { ENERGY_SOURCE, addEnergy } from '../../js/sim/energy.js';
import { feed } from '../../js/sim/feeding.js';
import { buildHash, createSpatialHash } from '../../js/sim/spatial-hash.js';
import { allocBody } from './helpers/body.js';
import { smallWorld } from './helpers/small-world.js';

const NEUTRAL = {
    huntSizeRatio: 1.01,
    biteCost: 0,
    maxEnergy: 25000,
    specialisations: { predator: { biteMultiplier: 1, turnMultiplier: 1, sprintBoost: 1, maxEnergyMultiplier: 1 } },
};

/**
 * @param {Record<string, any>} over config overrides
 * @param {{timer: number, seen: number}} alarm the victim's alarm timer and seen flag
 * @returns {{lost: number, gained: number, bite: number}} the victim's loss, the biter's gain and `biteEnergy`
 */
function bitten(over, alarm) {
    const w = smallWorld({ ...NEUTRAL, ...over });
    const biter = allocBody(w);
    const victim = allocBody(w);
    for (const [slot, x, spec, energy] of [
        [biter, 100, 1, 2000],
        [victim, 110, 0, 50],
    ]) {
        w.x[slot] = x;
        w.y[slot] = 100;
        w.spec[slot] = spec;
        w.genomeId[slot] = slot + 1;
        addEnergy(w, slot, energy, ENERGY_SOURCE.INITIAL);
        w.ateTimer[slot] = 30;
        w.bittenTimer[slot] = 30;
    }
    w.outputs[biter * OUTPUT_COUNT + OUTPUT_INDEX.BITE] = 1;
    w.alarmTimer[victim] = alarm.timer;
    w.alarmSeen[victim] = alarm.seen;
    w.contacts[0] = biter;
    w.contacts[1] = victim;
    w.contactCount = 1;
    const hash = createSpatialHash(w.config);
    buildHash(hash, w);
    feed(w, hash);
    return { lost: 50 - w.energy[victim], gained: w.energy[biter] - 2000, bite: w.config.biteEnergy };
}

describe('feed: alarmBiteShare', () => {
    it('moves the share of the bite while a seen alarm runs', () => {
        const r = bitten({ alarmBiteShare: 0.5 }, { timer: 5, seen: 1 });
        expect([r.lost, r.gained]).toEqual([r.bite * 0.5, r.bite * 0.5]);
    });

    it('moves the full bite on an unseen call', () => {
        const r = bitten({ alarmBiteShare: 0.5 }, { timer: 5, seen: 0 });
        expect(r.lost).toBe(r.bite);
    });

    it('moves the full bite on a silent prey, whatever its stale seen flag', () => {
        const r = bitten({ alarmBiteShare: 0.5 }, { timer: 0, seen: 1 });
        expect(r.lost).toBe(r.bite);
    });

    it('moves the full bite at the default share of 1, so control is unchanged', () => {
        const seen = bitten({}, { timer: 5, seen: 1 });
        const silent = bitten({}, { timer: 0, seen: 0 });
        expect([seen.lost, seen.gained]).toEqual([silent.lost, silent.gained]);
        expect(smallWorld().config.alarmBiteShare).toBe(1);
    });

    it('moves nothing at share 0 on a seen caller', () => {
        expect(bitten({ alarmBiteShare: 0 }, { timer: 5, seen: 1 }).lost).toBe(0);
    });
});
