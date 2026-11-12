// The purpose guard of the heat levers (docs/designs/low-density-edge.md, Phase 3): a heat arm keeps body temperature a
// pressure when a sitter still freezes, a rusher still overheats and a gentle forager still grows, as
// test/evo/scripted-temperature.slow.test.js defines it. The test and the guard share these cases.
import { SCRIPTED_CONTROLLERS } from '../../js/evo/scripted.js';
import { plainBrain } from '../../js/evo/plain-brain.js';
import { createConfig } from '../../js/sim/config.js';
import { createRng, fork } from '../../js/sim/rng.js';
import { createWorld } from '../../js/sim/spawn.js';
import { step } from '../../js/sim/step.js';
import { SIMPLE_WORLD } from '../../test/helpers/simple-world.js';

/** Ticks one constant-thrust run lasts. */
export const GUARD_TICKS = 10000;

/**
 * The food supply the cases run on: scarce enough that heat costs a rusher its life, on a flat caloric supply
 * independent of the seasonal species mix (see the note in the scripted-temperature test).
 */
export const SCARCE_FOOD = Object.freeze({
    foodRegrowPerArea: 0.003,
    flora: { grass: { energy: 1, radius: 1, life: 10000 } },
});

/**
 * The arm-name prefixes of the arms the guard checks: the heat arms (low-density-edge.md) and the eat-choice arms
 * (`bite-graze-*`, `bite-fat-*`, `bite-strike-*`, `fat-*`, `strike-*`; eat-choice.md, Phase 2).
 */
const HEAT_PREFIXES = ['cool-', 'mate-', 'eat-', 'bite-', 'fat-', 'strike-'];

/**
 * @param {string} name a grid arm name
 * @returns {boolean} whether the guard checks the arm
 */
export function isHeatArm(name) {
    return HEAT_PREFIXES.some((p) => name.startsWith(p));
}

/**
 * @param {Record<string, any>} overrides config keys over the sweet-spot world (an arm's keys)
 * @param {number} seed the world and controller seed
 * @returns {Record<string, any>} the config of one guard run
 */
export function guardConfig(overrides, seed) {
    return createConfig({ ...SIMPLE_WORLD, ...SCARCE_FOOD, ...overrides, seed, minAgents: 0 });
}

/**
 * Runs one constant-thrust controller with no floor and no immigrants.
 * @param {keyof typeof SCRIPTED_CONTROLLERS} name a `SCRIPTED_CONTROLLERS` key
 * @param {Record<string, any>} [overrides] config keys over the sweet-spot world
 * @param {number} [seed] the world and controller seed
 * @param {number} [ticks] the run length
 * @returns {number} the population at the end
 */
export function populationAfter(name, overrides = {}, seed = 1, ticks = GUARD_TICKS) {
    const config = guardConfig(overrides, seed);
    const brain = plainBrain;
    const world = createWorld(config, brain);
    const run = SCRIPTED_CONTROLLERS[name]({ world, rng: fork(createRng(seed), 'scripted') });
    for (let t = 0; t < ticks && world.population > 0; t++) {
        step(world, brain, { brain: run });
    }
    return world.population;
}

/**
 * @typedef {object} GuardVerdict
 * @property {boolean} sitterDies `thrust0` ends at 0
 * @property {boolean} rusherDies `thrust100` ends under the start and under half of `thrust20`
 * @property {boolean} foragerGrows `thrust20` ends above the start
 * @property {boolean} pass all three hold
 */

/**
 * The verdict of the scripted-temperature cases on three end populations.
 * @param {{ thrust0: number, thrust20: number, thrust100: number, start: number }} p end populations and the start
 * @returns {GuardVerdict} which cases hold
 */
export function judge({ thrust0, thrust20, thrust100, start }) {
    const sitterDies = thrust0 === 0;
    const rusherDies = thrust100 < start && thrust100 < thrust20 / 2;
    const foragerGrows = thrust20 > start;
    return { sitterDies, rusherDies, foragerGrows, pass: sitterDies && rusherDies && foragerGrows };
}

/**
 * @param {Record<string, any>} keys an arm's config keys
 * @param {number[]} seeds the seeds to run
 * @param {number} [ticks] the run length
 * @returns {Array<Record<string, any>>}
 *   one row per seed (the populations and the verdict)
 */
export function guardArm(keys, seeds, ticks = GUARD_TICKS) {
    return seeds.map((seed) => {
        const pops = {
            thrust0: populationAfter('thrust0', keys, seed, ticks),
            thrust20: populationAfter('thrust20', keys, seed, ticks),
            thrust100: populationAfter('thrust100', keys, seed, ticks),
            start: guardConfig(keys, seed).initialAgents,
        };
        return { seed, ...pops, ...judge(pops) };
    });
}

/**
 * @param {string} name the arm
 * @param {Array<Record<string, any>>} rows `guardArm` rows
 * @returns {string} one line per seed, then the arm's verdict
 */
export function formatArm(name, rows) {
    const lines = rows.map(
        (r) =>
            `  seed ${r.seed}: thrust0 ${r.thrust0} (${r.sitterDies ? 'dies' : 'LIVES'}), thrust100 ${r.thrust100} ` +
            `(${r.rusherDies ? 'dies' : 'SURVIVES'}), thrust20 ${r.thrust20} of ${r.start} (${r.foragerGrows ? 'grows' : 'NO GROWTH'})`,
    );
    const pass = rows.every((r) => r.pass);
    return `${name}: ${pass ? 'PASS' : 'FAIL'}\n${lines.join('\n')}`;
}
