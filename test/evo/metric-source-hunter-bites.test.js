// Source tests, hunters family, bites and combat (docs/designs/metric-trust.md, T16): `scene-bite.js`,
// `scene-bite-life.js` and `metrics-combat.js` read on the real `step`. Scenes sit left of the wall at x 500 that the
// simple world carries, and foragers never mature, so no split puts a child in the jaws. The last bite or death of each
// scene lands in its final tick, and every kill is a body dying in the tick of its bite.

import { describe, expect, it } from 'vitest';
import { OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { inputOffsets } from '../../js/sim/brain-layout.js';
import { BORN_CAUSE, EVENT_TYPE } from '../../js/sim/events.js';
import { noteBiteLifeRecord } from '../../js/evo/scene-bite-life.js';
import { plantMeat, starve } from './helpers/source-world.js';
import { FORAGER, PREDATOR, biteStep, huntRun, killStep, park } from './helpers/hunt-scene.js';

const STILL = { maturityTicks: 100000 };

/**
 * Sets an agent's place, stillness, energy and the size that energy gives.
 * @param {any} world the world
 * @param {number} slot the agent
 * @param {[number, number, number]} pose x, y and energy
 * @returns {void}
 */
function pose(world, slot, [x, y, energy]) {
    world.x[slot] = x;
    world.y[slot] = y;
    world.vx[slot] = 0;
    world.vy[slot] = 0;
    world.angle[slot] = 0;
    world.energy[slot] = energy;
    world.size[slot] = world.config.baseSize + energy / world.config.energyToSize;
}

/**
 * One hunter held for `total` ticks with a body in its jaws (or none), wanting to bite on the first `wishes`.
 * @param {'prey' | 'kin' | 'other' | 'idle'} kind prey; kin (the hunter's child); other (too big: a hungry hunter and a
 *   full body); idle (no body)
 * @param {number} total the ticks
 * @param {number} wishes the ticks with a wish to bite
 * @param {{bystanders?: number}} [options] extra hunters parked out of reach
 * @returns {Record<string, any>} the metrics
 */
function jaws(kind, total, wishes, { bystanders = 0 } = {}) {
    const { run, world, spawn } = huntRun({ over: STILL });
    const hunter = spawn(PREDATOR);
    const body = kind === 'idle' ? -1 : spawn(FORAGER);
    const parked = Array.from({ length: bystanders }, () => spawn(PREDATOR));
    for (let t = 0; t < total; t++) {
        pose(world, hunter, [200, 500, kind === 'other' ? 40 : 300]);
        parked.forEach((slot, i) => park(world, slot, 100 + 100 * i));
        if (body >= 0) {
            pose(world, body, [225, 500, kind === 'other' ? 2000 : 300]);
            world.parentA[body] = kind === 'kin' ? world.genomeId[hunter] : 0;
        }
        if (t < wishes) {
            run.want(hunter, OUTPUT_INDEX.BITE);
        } else {
            run.release(hunter, OUTPUT_INDEX.BITE);
        }
        run.tick();
    }
    return run.metrics();
}

describe('bite_on_prey, bite_off_kin, bite_off_other and bite_idle', () => {
    it('read the wish share of the hunter-ticks with that body in the jaws: 10 of 40 is 0.25', () => {
        expect(jaws('prey', 40, 10)['eval.bite_wish_with_prey_in_jaws']).toEqual({ value: 0.25 });
        expect(jaws('kin', 40, 10)['eval.bite_wish_with_kin_in_jaws']).toEqual({ value: 0.25 });
        expect(jaws('other', 40, 10)['eval.bite_wish_with_other_in_jaws']).toEqual({ value: 0.25 });
        expect(jaws('idle', 40, 10)['eval.bite_idle']).toEqual({ value: 0.25 });
    });

    it('read 0 and 1 for a hunter that never and always wants to bite', () => {
        expect(jaws('prey', 40, 0)['eval.bite_wish_with_prey_in_jaws']).toEqual({ value: 0 });
        expect(jaws('prey', 40, 40)['eval.bite_wish_with_prey_in_jaws']).toEqual({ value: 1 });
    });

    it('count only the body in the jaws, and need 30 hunter-ticks', () => {
        const m = jaws('kin', 40, 10);
        expect(m['eval.bite_wish_with_prey_in_jaws'].value).toBeNull();
        expect(m['eval.bite_wish_with_other_in_jaws'].value).toBeNull();
        expect(jaws('prey', 29, 10)['eval.bite_wish_with_prey_in_jaws'].value).toBeNull();
    });

    it('counts fatal prey bites, including the final tick of the report', () => {
        const { run, spawn } = huntRun({ over: STILL });
        const hunter = spawn(PREDATOR);
        for (let i = 0; i < 30; i++) {
            killStep(run, hunter, spawn(FORAGER));
        }
        expect(run.observer.scenes.bite.opportunities[3]).toBeGreaterThanOrEqual(30);
        expect(run.observer.scenes.bite.wishes[3]).toBeGreaterThanOrEqual(30);
        expect(run.metrics()['eval.bite_wish_with_prey_in_jaws'].value).not.toBeNull();
    });

    it('counts a kin opportunity independently when the same hunter also kills prey', () => {
        const { run, world, spawn } = huntRun({ over: STILL });
        const hunter = spawn(PREDATOR);
        const kin = spawn(FORAGER);
        const prey = spawn(FORAGER);
        pose(world, hunter, [200, 500, 800]);
        pose(world, kin, [220, 500, 300]);
        pose(world, prey, [230, 500, 1]);
        world.parentA[kin] = world.genomeId[hunter];
        world.meritPrey.seen[hunter] = world.tick;
        world.meritPrey.bits[hunter] = 0xff;
        world.meritPrey.turn[hunter] = world.tick;
        run.want(hunter, OUTPUT_INDEX.BITE);
        run.tick();
        const m = run.metrics();
        expect(m['eval.bite_wish_with_kin_in_jaws'].reason).toContain('hunter-ticks');
        expect(m['eval.bite_wish_with_prey_in_jaws'].reason).toContain('hunter-ticks');
        expect(run.observer.scenes.bite.opportunities[2]).toBeGreaterThan(0);
        expect(run.observer.scenes.bite.opportunities[3]).toBeGreaterThan(0);
    });
});

describe('hunter_recoil_per_life', () => {
    it('counts energy charged by refused lunges, as the median per hunter life', () => {
        expect(jaws('kin', 40, 10)['eval.hunter_recoil_per_life']).toEqual({ value: 200 });
        expect(jaws('other', 40, 10)['eval.hunter_recoil_per_life']).toEqual({ value: 200 });
        expect(jaws('kin', 40, 10, { bystanders: 1 })['eval.hunter_recoil_per_life']).toEqual({ value: 100 });
    });

    it('is 0 when the hunter bites only prey', () => {
        expect(jaws('prey', 40, 10)['eval.hunter_recoil_per_life']).toEqual({ value: 0 });
    });

    it('keeps the energy charged on the tick recoil kills the hunter', () => {
        const { run, world, spawn } = huntRun({ over: { recoilEnergy: 20 } });
        const hunter = spawn(PREDATOR);
        const kin = spawn(FORAGER);
        pose(world, hunter, [200, 500, 20]);
        pose(world, kin, [220, 500, 300]);
        world.parentA[kin] = world.genomeId[hunter];
        run.want(hunter, OUTPUT_INDEX.BITE);
        run.tick();
        expect(world.alive[hunter]).toBe(0);
        expect(run.metrics()['eval.hunter_recoil_per_life']).toEqual({ value: 20 });
    });
});

describe('mating-born hunter reflex column metrics', () => {
    it('counts a mating-born hunter with separate BITE and THRUST skip parents', () => {
        const { run, world, spawn } = huntRun({ over: STILL });
        const hunter = spawn(PREDATOR);
        world.biteSkipParent[hunter] = 0;
        world.thrustSkipParent[hunter] = 1;
        const scene = run.observer.scenes.biteLife;
        const d = new Float64Array(11);
        d[0] = EVENT_TYPE.AGENT_BORN;
        d[2] = hunter;
        d[3] = world.genomeId[hunter];
        d[8] = BORN_CAUSE.MATE;
        noteBiteLifeRecord(scene, d, 0, world);
        const metrics = run.metrics();
        expect(metrics['eval.hunter_reflex_column_split_share']).toEqual({ value: 1 });
        expect(metrics['eval.hunter_reflex_column_split_kill_rate'].value).toBeNull();
        expect(metrics['eval.hunter_reflex_column_same_kill_rate'].value).toBeNull();
    });
});

describe('pooled bite view shares', () => {
    it('read the prey-channel wish while the prey is visible but out of the jaws', () => {
        const { run, world, spawn } = huntRun({ over: STILL, pooledBrain: true });
        const hunter = spawn(PREDATOR);
        const prey = spawn(FORAGER);
        pose(world, hunter, [200, 500, 800]);
        pose(world, prey, [260, 500, 800]);
        for (let t = 0; t < 30; t++) {
            run.want(hunter, OUTPUT_INDEX.BITE);
            run.tick((w) => {
                pose(w, hunter, [200, 500, 800]);
                pose(w, prey, [260, 500, 800]);
            });
            run.release(hunter, OUTPUT_INDEX.BITE);
        }
        const input = hunter * world.layout.inputCount + inputOffsets(world.config).pooled.prey;
        expect(world.pooled[input]).toBeGreaterThan(0);
        expect(run.metrics()['eval.bite_on_prey_view']).toEqual({ value: 1 });
        expect(run.metrics()['eval.bite_wish_with_prey_in_jaws'].value).toBeNull();
        expect(run.metrics()['eval.bite_off_kin_view'].value).toBeNull();
        expect(run.metrics()['eval.bite_off_other_view'].value).toBeNull();
    });
});

describe('hunter_carrion_idle_share', () => {
    /**
     * Hunter Z eats a planted carcass; hunter K kills a forager, then (optionally) Z kills one too.
     * @param {{killer?: boolean, zKills?: boolean}} options whether K hunts, whether Z also kills
     */
    function carrion({ killer = true, zKills = false }) {
        const { run, world, spawn } = huntRun({ over: STILL });
        const z = spawn(PREDATOR);
        const k = spawn(PREDATOR);
        park(world, k, 100);
        pose(world, z, [200, 300, 300]);
        run.tick((w) => plantMeat(w, z));
        park(world, z, 300);
        if (killer) {
            killStep(run, k, spawn(FORAGER));
            park(world, k, 100);
        }
        if (zKills) {
            killStep(run, z, spawn(FORAGER));
        }
        const income = [z, k].reduce(
            (sum, s) => sum + world.ledgerKillEnergy[s] + world.ledgerBiteGain[s] + world.ledgerCarcass[s],
            0,
        );
        return { m: run.metrics(), want: world.ledgerCarcass[z] / income };
    }

    it("reads the zero-kill hunter's carcass energy over all hunter income, as the world's ledger holds it", () => {
        const { m, want } = carrion({});
        expect(want).toBeGreaterThan(0);
        expect(want).toBeLessThan(1);
        expect(m['eval.hunter_carrion_idle_share'].value).toBeCloseTo(want, 12);
        expect(m['eval.hunter_zero_kill_carcass_share']).toEqual({ value: 1 });
    });

    it('is 1 when the carrion eater is the only earner, and 0 once it has a kill', () => {
        expect(carrion({ killer: false }).m['eval.hunter_carrion_idle_share']).toEqual({ value: 1 });
        expect(carrion({ zKills: true }).m['eval.hunter_carrion_idle_share']).toEqual({ value: 0 });
    });
});

describe('hunter_catches_per_1k', () => {
    it('counts eaten deaths with a hunter killer, deliberate or not, per 1000 hunter-ticks: 2 kills over 22', () => {
        const { run, world, spawn } = huntRun({ over: STILL });
        const a = spawn(PREDATOR);
        park(world, spawn(PREDATOR), 100);
        killStep(run, a, spawn(FORAGER));
        killStep(run, a, spawn(FORAGER), { deliberate: false });
        for (let t = 0; t < 8; t++) {
            run.tick();
        }
        // 2 hunters at each of the 11 observes after tick 0: two kill steps, the spawn between them, eight more steps
        expect(run.metrics()['eval.hunter_catches_per_1k'].value).toBeCloseTo(2000 / 22, 9);
    });

    it('is 0 with hunters and no kill, and null without hunters', () => {
        const hunters = huntRun({ over: STILL });
        hunters.spawn(PREDATOR);
        hunters.run.tick();
        expect(hunters.run.metrics()['eval.hunter_catches_per_1k']).toEqual({ value: 0 });
        const none = huntRun({ over: STILL });
        none.spawn(FORAGER);
        none.run.tick();
        expect(none.run.metrics()['eval.hunter_catches_per_1k']).toEqual({ value: null, reason: 'no hunters' });
    });
});

describe('escape_share', () => {
    /** @param {number} escapes bitten prey that live on @param {number} kills prey bitten dead */
    function episodes(escapes, kills) {
        const { run, world, spawn } = huntRun({ over: STILL });
        const hunter = spawn(PREDATOR);
        const survivors = Array.from({ length: escapes }, (_, i) => {
            const prey = spawn(FORAGER);
            biteStep(run, hunter, prey);
            park(world, prey, 100 + 100 * i);
            return prey;
        });
        for (let i = 0; i < kills; i++) {
            killStep(run, hunter, spawn(FORAGER));
        }
        park(world, hunter, 800);
        run.jump(world.tick + 300);
        run.tick((w) => survivors.forEach((prey) => (w.energy[prey] = 800)));
        run.tick();
        return run.metrics()['eval.escape_share'];
    }

    it('reads escaped episodes over caught plus escaped: 0, 1/2 and 1', () => {
        expect(episodes(0, 2)).toEqual({ value: 0 });
        expect(episodes(1, 1)).toEqual({ value: 0.5 });
        expect(episodes(2, 0)).toEqual({ value: 1 });
        expect(episodes(0, 0)).toEqual({ value: null, reason: 'no resolved bite episode' });
    });
});

describe('pack_kills_per_eaten_death', () => {
    /** @param {boolean} kin whether the first biter is of the killer's lineage */
    function packRun(kin) {
        const { run, world, spawn } = huntRun({ over: STILL });
        const first = spawn(PREDATOR);
        const killer = spawn(PREDATOR, 0, { lineage: kin ? world.lineageId[first] : undefined });
        const loner = spawn(PREDATOR);
        park(world, killer, 100);
        park(world, loner, 200);
        const shared = spawn(FORAGER);
        biteStep(run, first, shared);
        park(world, first, 300);
        killStep(run, killer, shared);
        park(world, killer, 100);
        killStep(run, loner, spawn(FORAGER));
        return run.metrics()['eval.pack_kills_per_eaten_death'];
    }

    it('reads the kills a hunter of the first biter lineage finishes, over all eaten deaths: 1 of 2, or none', () => {
        expect(packRun(true)).toEqual({ value: 0.5 });
        expect(packRun(false)).toEqual({ value: 0 });
    });
});

describe('smoke_escapes', () => {
    /** @param {boolean[]} fates for each bitten prey that releases smoke, whether it lives 300 ticks */
    function smokeRun(fates) {
        const { run, world, spawn } = huntRun({ over: STILL });
        const hunter = spawn(PREDATOR);
        const prey = fates.map((_, i) => {
            const slot = spawn(FORAGER);
            biteStep(run, hunter, slot);
            park(world, hunter, 800);
            park(world, slot, 100 + 100 * i);
            run.want(slot, OUTPUT_INDEX.SMOKE);
            run.tick();
            run.release(slot, OUTPUT_INDEX.SMOKE);
            return slot;
        });
        run.tick((w) => fates.forEach((lives, i) => !lives && starve(w, prey[i], 50)));
        run.jump(world.tick + 300);
        run.tick((w) => prey.forEach((slot, i) => fates[i] && (w.energy[slot] = 800)));
        return run.metrics()['eval.smoke_escapes'];
    }

    it('reads the releasers bitten before their smoke that are alive 300 ticks on: 0, 1/2 and 1', () => {
        expect(smokeRun([false])).toEqual({ value: 0 });
        expect(smokeRun([true, false])).toEqual({ value: 0.5 });
        expect(smokeRun([true])).toEqual({ value: 1 });
    });
});

describe('alarm_response', () => {
    /**
     * A hunter at (200, 500); a caller at (200, 800) calls once. The hearer at (200, 620) and the control at (200, 380)
     * are both 120 px from the hunter (one distance band); only the hearer is inside `callRadius` of the caller.
     * @param {{hearer?: boolean, control?: boolean}} thrust which of the two thrusts for the 10 ticks after the call
     */
    function alarmRun({ hearer = false, control = false }) {
        const { run, world, spawn } = huntRun({ over: STILL });
        const [hunter, caller, heard, ctl] = [spawn(PREDATOR), spawn(FORAGER), spawn(FORAGER), spawn(FORAGER)];
        pose(world, hunter, [200, 500, 800]);
        pose(world, caller, [200, 800, 800]);
        pose(world, heard, [200, 620, 800]);
        pose(world, ctl, [200, 380, 800]);
        run.tick();
        run.want(caller, OUTPUT_INDEX.ALARM);
        run.tick();
        run.release(caller, OUTPUT_INDEX.ALARM);
        const speed = (/** @type {number} */ s) => Math.hypot(world.vx[s], world.vy[s]);
        const before = [speed(heard), speed(ctl)];
        [hearer && heard, control && ctl].forEach((s) => s !== false && run.want(s, OUTPUT_INDEX.THRUST));
        for (let t = 0; t < 10; t++) {
            run.tick();
        }
        const change = (speed(heard) - before[0] - (speed(ctl) - before[1])) / world.config.maxVelocity;
        return { m: run.metrics()['eval.alarm_response'], change };
    }

    it("reads the hearer's speed change 10 ticks after the call minus the matched control's, over maxVelocity", () => {
        const up = alarmRun({ hearer: true });
        expect(up.change).toBeGreaterThan(0);
        expect(up.m.value).toBeCloseTo(up.change, 6);
        const down = alarmRun({ control: true });
        expect(down.change).toBeLessThan(0);
        expect(down.m.value).toBeCloseTo(down.change, 6);
        expect(alarmRun({ hearer: true, control: true }).m).toEqual({ value: 0 });
    });
});
