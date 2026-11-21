// The planted foraging and escape scenes (docs/designs/metric-noise.md, Phase 6, T21), played under the eval observer by
// `playObserved`. The foraging scene has two bodies far apart: a forager that steers to a line of food (the foraging brain of
// `forage-oracles.js`, so every meal follows a closing approach), and a body that holds `BITE` where food is dropped on it (so no
// meal follows one). The energy each ate is read from the world's own `foodEnergy`, never from the metrics. The escape scene is
// a hunter that bites its prey once and then lets go.

import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../../js/sim/brain-layout.js';
import { spawnFoodItem } from '../../../js/sim/spawn.js';
import { ARENA_CENTRE, arenaConfig, stageArena } from '../../../js/evo/chase-arena.js';
import { evaderBrain, pursuerBrain } from '../../../js/evo/chase-oracles.js';
import { foragerBrain, nearestFood } from '../../../js/evo/forage-oracles.js';
import { playObserved } from './role-scene.js';

/** The slots of a foraging scene: the forager that closes on food and the body that has food dropped on it. */
export const [CHASER, DROPPED] = [0, 1];
/** The gap between the items of the line, and from the forager to the first. */
const SPACING = 200;
/** The forager looks at food this far: the line, not the drops thousands of px away. */
const LOOK = 1500;
/** The ticks between two drops. */
const DROP_EVERY = 40;

/**
 * @typedef {object} ForageRun what a played foraging scene says
 * @property {Record<string, any>} metrics `computeMetrics` of the observer
 * @property {number[]} ate the food energy each body ate, by slot
 * @property {number} agentTicks the alive bodies summed over the ticks, the initial observation included
 * @property {number} ticks the ticks played
 */

/**
 * @param {Record<string, any>} world the world
 * @param {{x: number, y: number}} at where to put one more food item
 * @returns {void}
 */
function dropFood(world, at) {
    const food = spawnFoodItem(world);
    world.foodX[food] = at.x;
    world.foodY[food] = at.y;
    world.foodRadius[food] = 50;
    world.foodValue[food] = 300;
}

/**
 * Plays the foraging scene with whichever bodies it is given.
 * @param {{line: number, drops: number, ticks: number}} scene the items in the forager's line (0: no forager is staged), the
 *   items dropped on the other body (0: no such body) and the ticks
 * @returns {ForageRun} the readings
 */
export function playForaging({ line, drops, ticks }) {
    const config = arenaConfig({ seed: 1, maxFood: 64, foodPatchCount: 0, foodRegrowPerArea: 0 });
    const spec = /** @type {Record<string, any>} */ (config.specialisations).forager.index;
    const { x, y } = ARENA_CENTRE;
    const bodies = [];
    if (line > 0) {
        bodies.push({ spec, x, y: y - 1500, angle: 0 });
    }
    if (drops > 0) {
        bodies.push({ spec, x, y: y + 1500, angle: 0 });
    }
    const foods = Array.from({ length: line }, (_, i) => ({ x: x + SPACING * (i + 1), y: y - 1500 }));
    const staged = stageArena(config, bodies, { foods });
    const w = staged.world;
    const chaser = line > 0 ? CHASER : -1;
    const dropped = line > 0 ? DROPPED : 0;
    const steer = foragerBrain({ slot: CHASER });
    let agentTicks = w.population;
    const played = playObserved(staged, {
        config,
        ticks,
        brains: [
            (world) => {
                if (drops > 0) {
                    const row = dropped * OUTPUT_COUNT;
                    world.outputs.fill(0, row, row + OUTPUT_COUNT);
                    world.outputs[row + OUTPUT_INDEX.BITE] = 1;
                }
                if (chaser >= 0 && nearestFood(world, chaser, LOOK).food >= 0) {
                    steer(world);
                } else if (chaser >= 0) {
                    world.outputs.fill(0, chaser * OUTPUT_COUNT, (chaser + 1) * OUTPUT_COUNT);
                }
            },
        ],
        before(world, t) {
            if (drops > 0 && t % DROP_EVERY === 1 && t <= DROP_EVERY * drops) {
                dropFood(world, { x: world.x[dropped], y: world.y[dropped] });
            }
        },
        after(world) {
            agentTicks += world.population;
        },
    });
    return {
        metrics: played.metrics,
        ate: bodies.map((_, slot) => w.foodEnergy[slot]),
        agentTicks,
        ticks: played.ticks,
    };
}

/**
 * Plays a hunter that closes on a prey that runs, bites it once, then lets go and keeps chasing without a bite.
 * @param {{gap: number, ticks: number}} scene the start gap and the ticks played
 * @returns {{metrics: Record<string, any>, bitten: boolean, preyAlive: boolean}} the readings and the world's own truth
 */
export function playEscape({ gap, ticks }) {
    const config = arenaConfig({ seed: 1 });
    const { predator, forager } = /** @type {Record<string, any>} */ (config.specialisations);
    const staged = stageArena(config, [
        { spec: predator.index, ...ARENA_CENTRE, angle: 0 },
        { spec: forager.index, x: ARENA_CENTRE.x + gap, y: ARENA_CENTRE.y, angle: 0 },
    ]);
    const w = staged.world;
    const hunt = pursuerBrain({ pursuer: 0, evader: 1, sprint: true });
    const flee = evaderBrain({ pursuer: 0, evader: 1, sprint: true, jinkRange: 0 });
    let bitten = false;
    const played = playObserved(staged, {
        config,
        ticks,
        brains: [
            (world) => {
                hunt(world);
                flee(world);
                if (bitten) {
                    world.outputs[OUTPUT_INDEX.BITE] = 0;
                }
            },
        ],
        after(world) {
            bitten = bitten || world.biteEnergy[0] > 0;
        },
    });
    return { metrics: played.metrics, bitten, preyAlive: w.alive[1] === 1 };
}
