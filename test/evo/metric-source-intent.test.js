// Source tests, intent family, meals, bites and grouping (docs/designs/metric-trust.md, T17): `metrics-intent.js` and
// the grouping sample of `observer-alarm-reach.js` read on the real `step`. A meal or a bite is deliberate when the
// tracker that judges it saw the agent close on its target; a bite episode is unseen when the victim had no threat on its
// rays within `INTENT_WINDOW` (30) of the first bite, which food lying on the rays toward the biter can cause, as it can in
// a live world. Bodies sit left of the simple world's wall at x 500; a body parked at (900, y) is out of sight.

import { describe, expect, it } from 'vitest';
import { OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { spawnFoodItem } from '../../js/sim/spawn.js';
import { plantFood } from './helpers/source-world.js';
import {
    FORAGER,
    PREDATOR,
    biteStep,
    chaseSteps,
    huntRun,
    killStep,
    park,
    pose,
    settleChases,
} from './helpers/hunt-scene.js';

const STILL = { maturityTicks: 100000, maxFood: 8 };

/**
 * Puts a food item of `value` energy at (x, y).
 * @param {any} world the world
 * @param {[number, number, number]} item x, y and energy
 * @returns {void}
 */
function foodAt(world, [x, y, value]) {
    const food = spawnFoodItem(world);
    world.foodX[food] = x;
    world.foodY[food] = y;
    world.foodValue[food] = value;
    world.foodTox[food] = 0;
}

describe('deliberate_food_share, deliberate_food_energy_per_1k and chance_food_energy_per_1k', () => {
    /**
     * A forager thrusts toward food straight ahead for 12 steps and is then set on it (a deliberate meal), and/or has
     * food dropped under it while facing away (a chance meal); every meal is 100 energy.
     * @param {{deliberate: number, chance: number}} meals how many of each
     */
    function meals({ deliberate, chance }) {
        const { run, world, spawn } = huntRun({ over: STILL });
        run.tick();
        const eater = spawn(FORAGER, 0, { at: [100, 500] });
        for (let i = 0; i < deliberate; i++) {
            pose(world, eater, [100, 500]);
            foodAt(world, [260, 500, 100]);
            run.want(eater, OUTPUT_INDEX.THRUST);
            run.want(eater, OUTPUT_INDEX.BITE); // a forager eats only while it bites (eat-choice G1)
            for (let t = 0; t < 12; t++) {
                world.y[eater] = 500;
                world.energy[eater] = 300;
                run.tick();
            }
            run.release(eater, OUTPUT_INDEX.THRUST);
            pose(world, eater, [255, 500]);
            run.tick();
            run.release(eater, OUTPUT_INDEX.BITE);
        }
        for (let i = 0; i < chance; i++) {
            pose(world, eater, [100, 200, Math.PI]);
            for (let t = 0; t < 35; t++) {
                run.tick(); // no food seen for longer than INTENT_WINDOW
            }
            run.tick((w) => plantFood(w, eater, 100));
        }
        return { m: run.metrics(), agentTicks: run.observer.agentTicks };
    }

    it('read a meal closed on as deliberate and one dropped underfoot as chance: 1, 1/2, 0', () => {
        expect(meals({ deliberate: 1, chance: 0 }).m['eval.deliberate_food_share']).toEqual({ value: 1 });
        expect(meals({ deliberate: 1, chance: 1 }).m['eval.deliberate_food_share']).toEqual({ value: 0.5 });
        expect(meals({ deliberate: 0, chance: 1 }).m['eval.deliberate_food_share']).toEqual({ value: 0 });
        expect(meals({ deliberate: 0, chance: 0 }).m['eval.deliberate_food_share']).toEqual({
            value: null,
            reason: 'no food eaten',
        });
    });

    it('read each kind of meal energy per 1000 agent-ticks', () => {
        const { m, agentTicks } = meals({ deliberate: 1, chance: 1 });
        expect(m['eval.deliberate_food_energy_per_1k'].value).toBeCloseTo((100 * 1000) / agentTicks, 9);
        expect(m['eval.chance_food_energy_per_1k'].value).toBeCloseTo((100 * 1000) / agentTicks, 9);
        expect(meals({ deliberate: 0, chance: 1 }).m['eval.deliberate_food_energy_per_1k']).toEqual({ value: 0 });
    });
});

describe('pursuit_bite_share and pursuit_kill_share', () => {
    /**
     * One hunter bites (or kills) a fresh forager per entry. A deliberate bite ends a real chase, so the observer's own
     * tracker saw the hunter close on the prey; a chance bite has no closing. A kill is judged by the sim's verdict on
     * the fatal bite, so `killStep` plants it either way.
     * @param {boolean[]} deliberate for each bite (or kill), whether it is deliberate
     */
    function bites(deliberate, { fatal = false } = {}) {
        const { run, world, spawn } = huntRun({ over: STILL });
        const hunter = spawn(PREDATOR);
        let deliberateGain = 0;
        deliberate.forEach((isDeliberate, i) => {
            const prey = spawn(FORAGER);
            const before = world.biteEnergy[hunter];
            if (fatal) {
                killStep(run, hunter, prey, { deliberate: isDeliberate });
            } else if (isDeliberate) {
                chaseSteps(run, { hunter, prey, outcome: 'escaped', y: 100 + 100 * i });
            } else {
                biteStep(run, hunter, prey, { deliberate: false });
            }
            deliberateGain += isDeliberate ? world.biteEnergy[hunter] - before : 0;
            if (world.alive[prey] === 1) {
                park(world, prey, 100 + 100 * i);
            }
            settleChases(run); // a chase's closing history fades before the next bite
        });
        return { m: run.metrics(), want: deliberateGain / world.biteEnergy[hunter] };
    }

    it("read the deliberate share of the hunter's bite energy, as the world's tally holds it: 0, between, 1", () => {
        expect(bites([false]).m['eval.pursuit_bite_share']).toEqual({ value: 0 });
        const mixed = bites([true, false]);
        expect(mixed.want).toBeGreaterThan(0);
        expect(mixed.want).toBeLessThan(1);
        expect(mixed.m['eval.pursuit_bite_share'].value).toBeCloseTo(mixed.want, 12);
        expect(bites([true]).m['eval.pursuit_bite_share']).toEqual({ value: 1 });
    });

    it('read the kills whose fatal bite was deliberate: 0, 1/2 and 1', () => {
        expect(bites([false], { fatal: true }).m['eval.pursuit_kill_share']).toEqual({ value: 0 });
        expect(bites([true, false], { fatal: true }).m['eval.pursuit_kill_share']).toEqual({ value: 0.5 });
        expect(bites([true], { fatal: true }).m['eval.pursuit_kill_share']).toEqual({ value: 1 });
        expect(bites([]).m['eval.pursuit_kill_share']).toEqual({ value: null, reason: 'no hunter kill' });
    });
});

describe('pack_convergence', () => {
    /**
     * Per entry, hunter A bites a forager (deliberately: a real chase; or by chance) and hunter B of A's lineage then
     * kills it with a deliberate fatal bite.
     * @param {boolean[]} firstDeliberate for each pack kill, whether the first bite was deliberate
     */
    function packs(firstDeliberate) {
        const { run, world, spawn } = huntRun({ over: STILL });
        const first = spawn(PREDATOR);
        const killer = spawn(PREDATOR, 0, { lineage: world.lineageId[first] });
        for (const deliberate of firstDeliberate) {
            park(world, killer, 100);
            const prey = spawn(FORAGER);
            if (deliberate) {
                chaseSteps(run, { hunter: first, prey, outcome: 'escaped' });
            } else {
                biteStep(run, first, prey, { deliberate: false });
            }
            park(world, first, 300);
            killStep(run, killer, prey);
            settleChases(run);
        }
        return run.metrics()['eval.pack_convergence'];
    }

    it('reads the pack kills whose two bites were both deliberate: 0, 1/2 and 1', () => {
        expect(packs([false])).toEqual({ value: 0 });
        expect(packs([true, false])).toEqual({ value: 0.5 });
        expect(packs([true])).toEqual({ value: 1 });
        expect(packs([])).toEqual({ value: null, reason: 'no pack kill' });
    });
});

describe('evasion_response_share, undefended_bite_share and unseen_bite_share', () => {
    /**
     * After a calm spell (the hunter out of sight), the hunter bites a forager once and stays beside it; an `answered`
     * forager sprints for 15 steps. `hidden` lays food on the three rays toward the biter, so the bite is unseen. Each
     * forager lives 300 ticks past the bite, an escape.
     * @param {Array<'answered' | 'ignored' | 'hidden'>} kinds the episodes
     */
    function episodes(kinds) {
        const { run, world, spawn } = huntRun({ over: STILL });
        run.tick();
        const hunter = spawn(PREDATOR, 0, { at: [900, 100] });
        for (const kind of kinds) {
            const prey = spawn(FORAGER, 0, { at: [248, 500] });
            for (let t = 0; t < 40; t++) {
                pose(world, prey, [248, 500]);
                run.tick();
            }
            pose(world, hunter, [200, 500, 0]);
            if (kind === 'hidden') {
                for (const ray of [7, 8, 9]) {
                    const angle = (2 * Math.PI * ray) / world.config.rayCount;
                    foodAt(world, [248 + 8 * Math.cos(angle), 500 + 8 * Math.sin(angle), 1]);
                }
            }
            world.meritPrey.seen[hunter] = world.tick;
            world.meritPrey.bits[hunter] = 0xff;
            world.meritPrey.turn[hunter] = world.tick;
            world.energy[prey] = 800;
            run.want(hunter, OUTPUT_INDEX.BITE);
            run.tick();
            run.release(hunter, OUTPUT_INDEX.BITE);
            if (kind === 'answered') {
                run.want(prey, OUTPUT_INDEX.SPRINT);
            }
            for (let t = 0; t < 15; t++) {
                run.tick();
            }
            run.release(prey, OUTPUT_INDEX.SPRINT);
            park(world, hunter, 100);
            for (let t = 0; t < 30; t++) {
                run.tick(); // the episode is classified 30 ticks after its first bite
            }
            run.jump(world.tick + 300);
            run.tick((w) => (w.energy[prey] = 800));
            run.tick(); // the escape resolves
            park(world, prey, 700);
        }
        return run.metrics();
    }

    it('read an answered, an ignored and an unseen escape each at its end', () => {
        const answered = episodes(['answered']);
        expect(answered['eval.evasion_response_share']).toEqual({ value: 1 });
        expect(answered['eval.undefended_bite_share']).toEqual({ value: 0 });
        const ignored = episodes(['ignored']);
        expect(ignored['eval.evasion_response_share']).toEqual({ value: 0 });
        expect(ignored['eval.undefended_bite_share']).toEqual({ value: 1 });
        expect(ignored['eval.unseen_bite_share']).toEqual({ value: 0 });
        expect(episodes(['hidden'])['eval.unseen_bite_share']).toEqual({ value: 1 });
    });

    it('read the mix of one of each as 1/3 apiece for undefended and unseen, and 1/3 answered', () => {
        const m = episodes(['answered', 'ignored', 'hidden']);
        expect(m['eval.undefended_bite_share'].value).toBeCloseTo(1 / 3, 12);
        expect(m['eval.unseen_bite_share'].value).toBeCloseTo(1 / 3, 12);
        expect(m['eval.evasion_response_share'].value).toBeCloseTo(1 / 3, 12);
    });
});

describe('kin_nearby_threat_gain, call_opportunity_neighbours and call_opportunity_kin', () => {
    /**
     * A hunter at (200, 500) threatens a forager T 40 px away. Foragers A (100, 760) and B (300, 760) are 241 px from T
     * (inside callRadius 300) and 278 px from the hunter (unthreatened); U (400, 950) is out of everyone's reach. A is of
     * T's lineage, and B too unless `bStranger`. Two grouping samples (every 10 ticks) run.
     * @param {{bStranger?: boolean, noHunter?: boolean}} [options] B's lineage, and whether the hunter is away
     */
    function grouping({ bStranger = false, noHunter = false } = {}) {
        const { run, world, spawn } = huntRun({ over: STILL });
        run.tick();
        const hunter = spawn(PREDATOR, 0, { at: noHunter ? [900, 100] : [200, 500] });
        const t = spawn(FORAGER, 0, { at: [200, 540] });
        const a = spawn(FORAGER, 0, { at: [100, 760], lineage: world.lineageId[t] });
        const b = spawn(FORAGER, 0, { at: [300, 760], lineage: bStranger ? undefined : world.lineageId[t] });
        const u = spawn(FORAGER, 0, { at: [400, 950] });
        const places = /** @type {Array<[number, [number, number]]>} */ ([
            [hunter, noHunter ? [900, 100] : [200, 500]],
            [t, [200, 540]],
            [a, [100, 760]],
            [b, [300, 760]],
            [u, [400, 950]],
        ]);
        for (let i = 0; i < 20; i++) {
            places.forEach(([slot, at]) => (pose(world, slot, at), (world.energy[slot] = 800)));
            run.tick();
        }
        return run.metrics();
    }

    it('read T with two kin in reach against A, B (two kin each) and U (none): gain 2 - 4/3', () => {
        const m = grouping();
        expect(m['eval.call_opportunity_neighbours']).toEqual({ value: 2 });
        expect(m['eval.call_opportunity_kin']).toEqual({ value: 2 });
        expect(m['eval.kin_nearby_threat_gain'].value).toBeCloseTo(2 - 4 / 3, 12);
    });

    it('read B as a stranger: two neighbours, one kin, gain 1 - (1 + 0 + 0) / 3', () => {
        const m = grouping({ bStranger: true });
        expect(m['eval.call_opportunity_neighbours']).toEqual({ value: 2 });
        expect(m['eval.call_opportunity_kin']).toEqual({ value: 1 });
        expect(m['eval.kin_nearby_threat_gain'].value).toBeCloseTo(1 - 1 / 3, 12);
    });

    it('are null with no threatened forager in a sample', () => {
        const m = grouping({ noHunter: true });
        const none = 'no threatened agent in a grouping sample';
        expect(m['eval.call_opportunity_kin']).toEqual({ value: null, reason: none });
        expect(m['eval.kin_nearby_threat_gain']).toEqual({ value: null, reason: none });
    });
});
