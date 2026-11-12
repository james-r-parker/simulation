// Source tests, core family, pursuit_trend and evasion_trend (docs/designs/metric-trust.md, T12): hunters biting in real
// steps across the 8 windows after burn-in. A kill is a fatal bite by a hunter whose prey tracker reads deliberate (the
// one kill rule). An escape is a bite that lands once on a prey that lives 300 ticks past it; it is answered when the prey
// sprints while it sees the hunter. The last event of each run lands in the last tick; every kill is a body that dies in the tick of its bite.

import { describe, expect, it } from 'vitest';
import { OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { removeFood } from '../../js/sim/world.js';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { sourceRun, starve, zeroPolicy } from './helpers/source-world.js';

const WINDOW = 400;
const RUN_TICKS = BURN_IN_TICKS + 8 * WINDOW;
const PREDATOR = 1;
const ESCAPE_TICKS = 300;
const SPRINT_TICKS = 15;
const CALM_TICKS = 40;

/** The `[good, other]` table of a run that makes the trend 0.25: 1/2, 1/4 early; 1/2, 3/4 late. */
const TABLE = /** @type {[number, number][]} */ ([
    [1, 1],
    [1, 3],
    [1, 1],
    [1, 1],
    [1, 1],
    [1, 1],
    [1, 1],
    [3, 1],
]);

/** A policy whose next spawn takes the specialisation in `next.spec`. */
function pairPolicy() {
    const next = { spec: 0 };
    return { next, policy: { ...zeroPolicy(), initSpec: () => next.spec } };
}

/** Starts a run with the policy, 64 slots and the windows of the run. */
function start() {
    const { next, policy } = pairPolicy();
    return {
        next,
        run: sourceRun({ runTicks: RUN_TICKS, policy, over: { maxAgents: 64, predatorRestTicks: 0, rayCount: 16 } }),
    };
}

/** Moves to `tick` and runs one step there. */
function at(/** @type {any} */ run, /** @type {number} */ tick, /** @type {(w: any) => void} */ before) {
    run.jump(tick);
    run.tick(before);
}

/**
 * One hunter at the centre; per window `good` kills by a deliberate fatal bite and `other` by a chance one (the prey
 * tracker reads nothing). The last kill of the run, deliberate, lands in the last tick.
 * @param {[number, number][]} table `[deliberate, chance]` kills per window
 * @returns {Record<string, any>} the metrics
 */
function runKills(table) {
    const { next, run } = start();
    const { world } = run;
    next.spec = PREDATOR;
    run.jump(BURN_IN_TICKS);
    const hunter = run.spawn();
    next.spec = 0;
    world.x[hunter] = 500;
    world.y[hunter] = 500;
    world.ageTicks[hunter] = 100;
    world.angle[hunter] = 0;
    run.want(hunter, OUTPUT_INDEX.BITE);
    table.forEach(([good, other], k) => {
        const b = BURN_IN_TICKS + k * WINDOW;
        at(run, b, (w) => {
            w.energy[hunter] = 800;
        }); // the first step of the window takes its boundary snapshot
        const kills = [...Array(other).fill(false), ...Array(good).fill(true)];
        kills.forEach((deliberate, i) => {
            run.jump(k === 7 && i === kills.length - 1 ? RUN_TICKS - 1 : b + 50 + 60 * i);
            const victim = run.spawn();
            world.x[hunter] = 500;
            world.x[victim] = 530;
            world.y[victim] = 500;
            world.ageTicks[victim] = 100;
            world.energy[victim] = 1;
            world.energy[hunter] = 800;
            world.meritPrey.seen[hunter] = world.tick;
            world.meritPrey.bits[hunter] = deliberate ? 0xff : 0;
            world.meritPrey.turn[hunter] = world.tick;
            run.tick();
        });
    });
    return run.metrics();
}

/**
 * Per window `answered` + `ignored` prey, each with a hunter parked out of sight. After a calm spell the hunter stands
 * beside it and bites once; an answered prey sprints for 15 ticks, an ignored one does nothing. Every prey lives 300
 * ticks past its bite, so each is an escape. In the last window the bites are timed so the escapes resolve in the last
 * tick; the previous window's bodies die at the start of each window.
 * @param {[number, number][]} table `[answered, ignored]` escapes per window
 * @returns {Record<string, any>} the metrics
 */
function runEscapes(table) {
    const { next, run } = start();
    const { world } = run;
    run.jump(BURN_IN_TICKS);
    /** @type {number[]} */
    let old = [];
    table.forEach(([answered, ignored], k) => {
        const b = BURN_IN_TICKS + k * WINDOW;
        at(run, b, (w) => old.forEach((slot) => starve(w, slot, 50)));
        const pairs = [...Array(answered).fill(true), ...Array(ignored).fill(false)].map((sprints, i) => {
            next.spec = PREDATOR;
            const hunter = run.spawn();
            next.spec = 0;
            const prey = run.spawn();
            const y = 100 + 250 * i;
            world.x[prey] = 100;
            world.y[prey] = y;
            world.x[hunter] = 800;
            world.y[hunter] = y;
            world.ageTicks[hunter] = 100;
            world.ageTicks[prey] = 100;
            return { hunter, prey, sprints };
        });
        old = pairs.flatMap((p) => [p.hunter, p.prey]);
        for (let t = 0; t < CALM_TICKS; t++) {
            run.tick();
        }
        const bite = k === 7 ? RUN_TICKS - ESCAPE_TICKS - 1 : b + 60;
        run.jump(bite);
        // The last window's bodies left carcasses. They used to be eaten in passing by every agent; now only a hunter
        // eats one without biting, so clear them and leave the bite as the only event of the window.
        for (let food = 0; food < world.foodAlive.length; food++) {
            if (world.foodAlive[food] === 1) {
                removeFood(world, food);
            }
        }
        for (const { hunter, prey, sprints } of pairs) {
            world.x[hunter] = world.x[prey] - 30;
            world.angle[hunter] = 0;
            run.want(hunter, OUTPUT_INDEX.BITE);
            if (sprints) {
                run.want(prey, OUTPUT_INDEX.SPRINT);
            }
        }
        run.tick();
        for (const { hunter } of pairs) {
            run.release(hunter, OUTPUT_INDEX.BITE);
        }
        for (let t = 1; t < SPRINT_TICKS; t++) {
            run.tick();
        }
        for (const { prey } of pairs) {
            run.release(prey, OUTPUT_INDEX.SPRINT);
        }
        for (let t = SPRINT_TICKS; t < 40; t++) {
            run.tick(); // the episode is classified 30 ticks after its first bite, before the escape resolves
        }
        run.jump(bite + ESCAPE_TICKS);
        run.tick(); // the escapes resolve in this step
    });
    return run.metrics();
}

describe('pursuit_trend', () => {
    it('is the late windows (1/2, 3/4) minus the early ones (1/2, 1/4) of deliberate kills over kills: 0.25', () => {
        const m = runKills(TABLE);
        expect(m['eval.pursuit_trend'].value).toBeCloseTo(0.25, 12);
    });

    it('is null while a compared window has no kill', () => {
        const none = TABLE.map(([good, other]) => /** @type {[number, number]} */ ([good, other]));
        none[1] = [0, 0];
        expect(runKills(none)['eval.pursuit_trend'].value).toBeNull();
    });
});

describe('evasion_trend', () => {
    it('is the late windows (1/2, 3/4) minus the early ones (1/2, 1/4) of answered escapes: 0.25', () => {
        const m = runEscapes(TABLE);
        expect(m['eval.evasion_trend'].value).toBeCloseTo(0.25, 12);
    });

    it('is null while a compared window has no escape', () => {
        const none = TABLE.map(([good, other]) => /** @type {[number, number]} */ ([good, other]));
        none[0] = [0, 0];
        expect(runEscapes(none)['eval.evasion_trend'].value).toBeNull();
    });
});
