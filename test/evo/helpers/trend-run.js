import { DEATH_CAUSE } from '../../../js/sim/events.js';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../../js/sim/brain-layout.js';
import { BURN_IN_TICKS } from '../../../js/evo/observer-events.js';
import { CH, FORAGER, PREDATOR, clearRays, seeThreat } from './intent-world.js';
import { auditArena, closeOn, ticks } from './intent-audit.js';
import { addBorn, pushDied } from './observer-world.js';

/** Eight windows of 400 ticks: room for an escaped bite episode (300 ticks) inside one window. */
export const WINDOW = 400;
export const RUN_TICKS = BURN_IN_TICKS + 8 * WINDOW;

/** The start of window `k`. */
export const windowStart = (/** @type {number} */ k) => BURN_IN_TICKS + k * WINDOW;

/** A table with the same pair in every one of the 8 windows. */
export const every = (/** @type {[number, number]} */ pair) => Array.from({ length: 8 }, () => pair);

/**
 * Per window `[x, y]` pairs. Food: `x` energy eaten after a closing approach, `y` otherwise. Kills: `x` kills by a
 * hunter closing on prey, `y` by one that is not. Episodes: `x` foragers that see the threat and sprint before being
 * bitten once, `y` foragers bitten once that never saw it. All happen 5 (meals, kills) or 10 (bites) ticks into the
 * window.
 * @typedef {{food?: [number, number][], kills?: [number, number][], episodes?: [number, number][]}} TrendScene
 */

/**
 * Adds the foragers the hunters will kill, one per kill.
 * @param {any} world the world
 * @param {[number, number][] | undefined} kills the kill table
 * @returns {{slot: number, window: number, closer: boolean}[]} the victims
 */
function addPrey(world, kills) {
    return (kills ?? []).flatMap((pair, window) =>
        pair.flatMap((count, who) =>
            Array.from({ length: count }, () => ({
                slot: addBorn(world, { spec: FORAGER }),
                window,
                closer: who === 0,
            })),
        ),
    );
}

/**
 * @param {any} world the world
 * @param {{slot: number, window: number, closer: boolean}[]} prey the victims
 * @param {number} t the tick
 * @param {{closer: number, other: number}} hunters the hunters' slots
 * @returns {void}
 */
function killTick(world, prey, t, hunters) {
    for (const v of prey) {
        if (t !== windowStart(v.window) + 5) {
            continue;
        }
        const by = world.genomeId[v.closer ? hunters.closer : hunters.other];
        world.alive[v.slot] = 0;
        world.bittenTimer[v.slot] = 30;
        world.lastBiteTick[v.slot] = t;
        pushDied(world, { slot: v.slot, genomeId: world.genomeId[v.slot], cause: DEATH_CAUSE.EATEN, by });
    }
}

/**
 * Adds one forager per episode: who is bitten at window start + 10, and whether it sees the threat and sprints.
 * @param {any} world the world
 * @param {[number, number][]} episodes the episode table
 * @returns {{slot: number, window: number, sees: boolean}[]} the foragers
 */
function addVictims(world, episodes) {
    return episodes.flatMap(([seen, unseen], window) => [
        ...Array.from({ length: seen }, () => ({ slot: addBorn(world, { spec: FORAGER }), window, sees: true })),
        ...Array.from({ length: unseen }, () => ({ slot: addBorn(world, { spec: FORAGER }), window, sees: false })),
    ]);
}

/**
 * Runs the real `observe` from tick 9990 to the end of an observer told the run is `RUN_TICKS` long.
 * @param {TrendScene} scene the per-window tables
 * @param {number} [runTicks] the run length the observer is told; the run lasts `RUN_TICKS` whatever it is
 * @returns {{world: any, observer: any}} the run
 */
export function trendRun(scene, runTicks = RUN_TICKS) {
    const r = auditArena({ maxAgents: 64 }, { runTicks });
    const { world } = r;
    const eaterA = addBorn(world, { spec: FORAGER });
    const eaterB = addBorn(world, { spec: FORAGER });
    const hunters = { closer: addBorn(world, { spec: PREDATOR }), other: addBorn(world, { spec: PREDATOR }) };
    const prey = addPrey(world, scene.kills);
    const victims = addVictims(world, scene.episodes ?? []);
    r.start();
    ticks(r, BURN_IN_TICKS - 10, RUN_TICKS, (t) => {
        const k = Math.floor((t - BURN_IN_TICKS) / WINDOW);
        const food = k >= 0 && k < 8 && t - windowStart(k) === 5 ? scene.food?.[k] : undefined;
        closeOn(world, eaterA, CH.FOOD, t);
        closeOn(world, hunters.closer, CH.PREY, t);
        world.foodEnergy[eaterA] = food?.[0] ?? 0;
        world.foodEnergy[eaterB] = food?.[1] ?? 0;
        killTick(world, prey, t, hunters);
        for (const v of victims) {
            const bite = windowStart(v.window) + 10;
            clearRays(world, v.slot);
            world.bittenTimer[v.slot] = t === bite ? 1 : 30;
            const seen = v.sees && t > windowStart(v.window) && t <= bite + 30;
            if (seen) {
                seeThreat(world, v.slot, 2);
            }
            world.outputs[v.slot * OUTPUT_COUNT + OUTPUT_INDEX.SPRINT] = seen ? 1 : 0;
        }
    });
    return r;
}
