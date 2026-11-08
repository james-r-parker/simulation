// Source tests, world family, watchability, watch, environment and body metrics (docs/designs/metric-trust.md, T20a):
// the real `step`, `observe`, `checkpoint` and `computeMetrics` on a scripted world, each value known by construction.
// Every test plants one event in the final tick and one in a tick a body dies.

import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { WINTER } from '../../js/sim/eras.js';
import { ESCAPE_TICKS } from '../../js/sim/merit-state.js';
import { SEX } from '../../js/sim/sex.js';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { RESPONSE_WINDOW } from '../../js/evo/observer-intent-state.js';
import { MOTION_SAMPLE_TICKS } from '../../js/evo/observer-tick.js';
import { eaten, sourceRun, starve } from './helpers/source-world.js';

const PREDATOR = 1;

/** Makes `slot` ready to split in the next `step`. */
function readyToSplit(/** @type {any} */ world, /** @type {number} */ slot) {
    world.ageTicks[slot] = 100;
    world.energy[slot] = 1500;
    world.cooldown[slot] = 0;
    world.pregnancy[slot] = 0;
}

describe('circling_share, output_saturation, alarm_rate, mean_energy_share and energy_over_split', () => {
    it('tracks a 200-tick circling window ending at burn-in, alarm calls and checkpoint output/energy shares', () => {
        const r = sourceRun({ over: { maxAgents: 16, callTicks: 1 } });
        const [circler, walker, doomedMid, doomedEnd] = Array.from({ length: 4 }, () => r.spawn());
        const { world } = r;
        world.x[circler] = 250;
        world.y[circler] = 250;
        world.x[walker] = 200;
        world.y[walker] = 750;
        world.angle[walker] = 0;
        r.want(circler, OUTPUT_INDEX.THRUST, 1);
        r.want(circler, OUTPUT_INDEX.TURN, 1);
        r.want(walker, OUTPUT_INDEX.THRUST, 1);
        // Start circling window at tick 9801 (`BURN_IN_TICKS - 199`) and step through tick 10000 (`BURN_IN_TICKS`).
        r.jump(BURN_IN_TICKS - 199 - 1);
        for (let step = 0; step < 200; step++) {
            r.tick((w) => {
                w.energy[circler] = 600;
                w.energy[walker] = 300;
                if (step === 100) {
                    starve(w, doomedMid, 50);
                }
            });
        }
        r.release(circler, OUTPUT_INDEX.THRUST);
        r.release(circler, OUTPUT_INDEX.TURN);
        r.release(walker, OUTPUT_INDEX.THRUST);
        // Checkpoint 1 at `BURN_IN_TICKS` (alive: circler, walker, doomedEnd):
        // Set saturated outputs (> 0.95): circler 3/9, walker 0/9, doomedEnd 6/9 -> sum 1.0 over 3 agents.
        // Set energies: circler 600, walker 300, doomedEnd 300 (`maxEnergy = 1200`, `splitMinEnergy = 600`).
        world.outputs.fill(0);
        for (let k = 0; k < 3; k++) {
            world.outputs[circler * OUTPUT_COUNT + k] = 1;
        }
        for (let k = 0; k < 6; k++) {
            world.outputs[doomedEnd * OUTPUT_COUNT + k] = -1;
        }
        world.energy[circler] = 600;
        world.energy[walker] = 300;
        world.energy[doomedEnd] = 300;
        r.check();
        // Final tick: `circler` calls alarm, `doomedEnd` dies, and Checkpoint 2 samples `circler` (600) and `walker` (300).
        r.want(circler, OUTPUT_INDEX.ALARM, 1);
        r.tick((w) => {
            starve(w, doomedEnd, 50);
        });
        world.outputs.fill(0);
        world.outputs[circler * OUTPUT_COUNT] = 1; // 1/9 saturated on circler, 0/9 on walker
        world.energy[circler] = 600;
        world.energy[walker] = 300;
        r.check();
        const m = r.metrics();
        // Tracked across the whole 200-sample span: circler (circled), walker (straight), doomedEnd (still).
        const maxE = world.maxEnergyBySpec[0];
        const splitE = world.splitMinBySpec[0];
        expect(m['eval.circling_share']).toEqual({ value: 1 / 3 });
        expect(m['eval.output_saturation'].value).toBeCloseTo(
            (3 / OUTPUT_COUNT + 0 + 6 / OUTPUT_COUNT + 1 / OUTPUT_COUNT + 0) / 5,
            12,
        );
        expect(m['eval.alarm_rate'].value).toBeCloseTo((1 / r.observer.agentTicks) * 1000, 12);
        expect(m['eval.mean_energy_share'].value).toBeCloseTo((600 + 300 + 300 + 600 + 300) / maxE / 5, 12);
        expect(m['eval.energy_over_split'].value).toBeCloseTo((600 + 300 + 300 + 600 + 300) / splitE / 5, 12);
    });
});

describe('migration_index, predator_presence and predator_births', () => {
    it('counts distinct food patches visited by mature deaths, hunter checkpoints and hunter births after burn-in', () => {
        const r = sourceRun({
            over: { maxAgents: 16, floraPatchMax: 4, foodPatchCount: 2, foodPatchRadius: 50 },
        });
        const [m1, m2, hunter] = Array.from({ length: 4 }, () => r.spawn());
        const { world, observer } = r;
        world.spec[hunter] = PREDATOR;
        observer.spec[hunter] = PREDATOR;
        world.patchAlive[0] = 1;
        world.patchX[0] = 200;
        world.patchY[0] = 200;
        world.patchAlive[1] = 1;
        world.patchX[1] = 800;
        world.patchY[1] = 200;
        // Sample 1 at `BURN_IN_TICKS`: `m1` and `m2` visit patch 0; Checkpoint 1 has `hunter` alive.
        r.jump(BURN_IN_TICKS - 1);
        r.tick((w) => {
            w.x[m1] = 200;
            w.y[m1] = 200;
            w.x[m2] = 200;
            w.y[m2] = 200;
        });
        r.check();
        // Sample 2 at `BURN_IN_TICKS + MOTION_SAMPLE_TICKS`: `m1` visits patch 1 (`visited = 2`), `hunter` splits (1st
        // predator birth).
        r.jump(BURN_IN_TICKS + MOTION_SAMPLE_TICKS - 1);
        r.tick((w) => {
            w.x[m1] = 800;
            w.y[m1] = 200;
            readyToSplit(w, hunter);
        });
        // Next tick: `m1` dies at mature age 50 (`visited = 2`) and `hunter` splits again (2nd predator birth).
        r.tick((w) => {
            readyToSplit(w, hunter);
            starve(w, m1, 50);
        });
        // Final tick: `m2` dies at mature age 50 (`visited = 1`), and all hunters die at immature age 5 so Checkpoint 2
        // has only `nonHunter` alive (no hunter present).
        r.tick((w) => {
            starve(w, m2, 50);
            for (let slot = 0; slot < w.alive.length; slot++) {
                if (w.alive[slot] === 1 && w.spec[slot] === PREDATOR) {
                    starve(w, slot, 5);
                }
            }
        });
        r.check();
        const m = r.metrics();
        expect(m['eval.migration_index'].value).toBeCloseTo((2 + 1) / 2 / 4, 12);
        expect(m['eval.predator_presence']).toEqual({ value: 1 / 2 });
        expect(m['eval.predator_births']).toEqual({ value: 2 });
    });
});

describe('pred_prey_lag_corr', () => {
    it('correlates window k catch rate against window k + 1 evasion skill across all 7 window pairs', () => {
        const win = 300;
        const runTicks = BURN_IN_TICKS + 8 * win;
        const r = sourceRun({ runTicks, over: { maxAgents: 16 } });
        const { world, observer } = r;
        const hunter = r.spawn();
        world.spec[hunter] = PREDATOR;
        observer.spec[hunter] = PREDATOR;
        observer.combat.knownAgents.set(world.genomeId[hunter], PREDATOR);
        const prey = r.spawn();
        const victims = Array.from({ length: 5 }, () => r.spawn());
        // Windows 0..2: 0 kills (c = 0); Windows 3..6: 1 kill (c = 250).
        // Windows 1..3: unresponded escape (e = 0); Windows 4..7: responded escape (e = 1), Window 7 ending in final tick.
        for (let k = 0; k < 8; k++) {
            const start = BURN_IN_TICKS + k * win;
            const respond = k >= 4;
            const kill = k >= 3 && k <= 6;
            r.jump(start - 1);
            r.tick(); // boundary k snapshot
            const biteTick = k === 7 ? runTicks - ESCAPE_TICKS : start + 10;
            r.jump(biteTick - 1);
            if (respond) {
                r.want(prey, OUTPUT_INDEX.SPRINT, 1);
            }
            r.tick((w) => {
                w.x[prey] = 200;
                w.y[prey] = 200;
                w.angle[prey] = 0;
                w.x[hunter] = respond ? 240 : 800;
                w.y[hunter] = 200;
                w.bittenTimer[prey] = 0;
                for (let s = 0; s < w.alive.length; s++) {
                    if (w.alive[s] === 1) {
                        w.energy[s] = 800;
                    }
                }
            });
            r.jump(biteTick + RESPONSE_WINDOW - 1);
            r.tick();
            r.release(prey, OUTPUT_INDEX.SPRINT);
            r.jump(biteTick + ESCAPE_TICKS - 1);
            r.tick((w) => {
                if (kill) {
                    eaten(w, victims[k - 3], hunter);
                }
                if (k === 7) {
                    starve(w, victims[4], 50);
                }
            });
        }
        expect(r.metrics()['eval.pred_prey_lag_corr'].value).toBeCloseTo(1, 12);
    });
});

describe('cold_stress_share, heat_stress_share, terrain_death_share and winter_pop_ratio', () => {
    it('counts cold/heat stressed agent-checkpoints, collision deaths and winter vs non-winter population', () => {
        const r = sourceRun({ over: { maxAgents: 16, wallDamage: 500, temperatureLossPassive: 0 } });
        const [coldA, hotA, okA, crasher, starver] = Array.from({ length: 5 }, () => r.spawn());
        const { world } = r;
        r.jump(BURN_IN_TICKS);
        // Tick 1 (Spring, non-winter): `crasher` moves into the outer wall at x = 2 and dies of COLLISION;
        // Checkpoint 1 samples 4 alive agents (1 cold, 1 heat).
        r.tick((w) => {
            w.x[crasher] = 2;
            w.y[crasher] = 200;
            w.vx[crasher] = -5;
            w.energy[crasher] = 100;
            w.temperature[coldA] = w.config.temperatureColdStress - 5;
            w.temperature[hotA] = w.config.temperatureHeatStress + 5;
            w.temperature[okA] = 50;
            w.temperature[starver] = 50;
        });
        r.check();
        // Final tick (Winter): `starver` starves; Checkpoint 2 samples 3 alive agents (1 cold, 1 heat).
        r.jump(BURN_IN_TICKS + 3 * world.config.eraSeasonTicks);
        r.tick((w) => {
            w.temperature[coldA] = w.config.temperatureColdStress - 5;
            w.temperature[hotA] = w.config.temperatureHeatStress + 5;
            w.temperature[okA] = 50;
            starve(w, starver, 50);
        });
        expect(world.season[0]).toBe(WINTER);
        r.check();
        const m = r.metrics();
        expect(m['eval.cold_stress_share']).toEqual({ value: 2 / 7 });
        expect(m['eval.heat_stress_share']).toEqual({ value: 2 / 7 });
        expect(m['eval.terrain_death_share']).toEqual({ value: 1 / 2 });
        expect(m['eval.winter_pop_ratio']).toEqual({ value: 3 / 4 });
    });
});

describe('trait_spread, body_plan_coverage and sex_balance', () => {
    it('computes trait CV, 5x5 size-by-vision grid coverage and sex imbalance across checkpoints after burn-in', () => {
        const r = sourceRun({ over: { maxAgents: 16 } });
        const [a, b, c, doomed] = Array.from({ length: 4 }, () => r.spawn());
        const { world } = r;
        const b0 = world.config.baseSize;
        // Agent a: bin (0, 0), female; Agent b: bin (4, 4), female; Agent c: bin (2, 2), male; doomed: bin (0, 0), female.
        world.baseSize[a] = 0.6 * b0;
        world.vision[a] = 0.6;
        world.childShare[a] = 0.3;
        world.sex[a] = SEX.FEMALE;
        world.baseSize[b] = 1.4 * b0;
        world.vision[b] = 1.4;
        world.childShare[b] = 0.7;
        world.sex[b] = SEX.FEMALE;
        world.baseSize[c] = b0;
        world.vision[c] = 1;
        world.childShare[c] = 0.5;
        world.sex[c] = SEX.MALE;
        world.baseSize[doomed] = 0.6 * b0;
        world.vision[doomed] = 0.6;
        world.childShare[doomed] = 0.3;
        world.sex[doomed] = SEX.FEMALE;
        r.jump(BURN_IN_TICKS);
        // Checkpoint 1 after `doomed` dies: alive [a, b, c] (2 females of 3 -> |2/3 - 0.5| = 1/6; 3 cells occupied).
        r.tick((w) => starve(w, doomed, 50));
        r.check();
        // Final tick: `c` dies; Checkpoint 2 has [a, b] (2 females of 2 -> |1 - 0.5| = 0.5).
        r.tick((w) => starve(w, c, 50));
        r.check();
        const m = r.metrics();
        const cv1 = Math.sqrt(0.32 / 3);
        const cv2 = 0.4;
        expect(m['eval.trait_spread'].value).toBeCloseTo((cv1 + cv2) / 2, 7);
        expect(m['eval.body_plan_coverage']).toEqual({ value: 3 / 25 });
        expect(m['eval.sex_balance'].value).toBeCloseTo((1 / 6 + 1 / 2) / 2, 12);
    });
});
