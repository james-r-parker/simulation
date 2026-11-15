// The body table of the chase envelope (docs/designs/senses-and-motor.md, Phase 2): what each specialisation's body does
// alone in the empty arena, measured by running the sim's own act, integrate and cost phases on one body, so it reads
// whatever the config says and shares no formula with the physics it audits.

import { OUTPUT_INDEX } from '../sim/brain-layout.js';
import { applyCosts } from '../sim/energy.js';
import { actAll, integrate } from '../sim/physics.js';
import { ARENA_CENTRE, arenaConfig, stageArena } from './chase-arena.js';

/** The share of its store a body holds, the start of every chase trial too: a fat body is slowed (`fatSlowShare`). */
export const STORE_SHARE = 0.5;
/** Ticks a body thrusts to reach its terminal speed (the cap binds after about 20 at the defaults). */
const SETTLE_TICKS = 80;
/** Ticks measured at the terminal speed, for the energy per 100 ticks. */
const COST_TICKS = 100;
/** Ticks of a steady turn measured, after the same settle time. */
const TURN_TICKS = 60;
const STOP_LIMIT = 1000;

/**
 * @typedef {object} BodyRow what one specialisation's body does alone
 * @property {string} name the specialisation's name
 * @property {number} cruiseSpeed the speed at `THRUST` 1, in px a tick
 * @property {number} sprintSpeed the speed at `THRUST` 1 and `SPRINT` above 0
 * @property {number} turnRadius the radius of the circle the body holds at `cruiseSpeed` and `TURN` 1
 * @property {number} sprintTurnRadius the same at `sprintSpeed`
 * @property {number} stopDistance the distance covered from `cruiseSpeed` to a stop after `THRUST` drops to 0
 * @property {number} cruiseEnergy the energy spent in 100 ticks at `cruiseSpeed`
 * @property {number} sprintEnergy the energy spent in 100 ticks at `sprintSpeed`
 */

/**
 * @param {Record<string, any>} world a world holding one body in slot 0
 * @returns {number} its speed
 */
function speedOf(world) {
    return Math.sqrt(world.vx[0] * world.vx[0] + world.vy[0] * world.vy[0]);
}

/**
 * @param {Record<string, any>} world a world holding one body in slot 0
 * @param {{thrust: number, turn: number, sprint: boolean}} out the outputs to hold
 * @returns {void}
 */
function hold(world, { thrust, turn, sprint }) {
    world.outputs[OUTPUT_INDEX.THRUST] = thrust;
    world.outputs[OUTPUT_INDEX.TURN] = turn;
    world.outputs[OUTPUT_INDEX.SPRINT] = sprint ? 1 : 0;
}

/**
 * Runs `ticks` of the body's act, integrate and cost phases with the outputs held, refilling its store after each tick
 * to its starting energy (the table prices the cost, not the death).
 * @param {Record<string, any>} world a world holding one body in slot 0
 * @param {number} ticks how many ticks
 * @param {(world: Record<string, any>) => void} [each] called after every tick
 * @returns {number} the energy the ticks cost in all
 */
function run(world, ticks, each = () => {}) {
    const full = world.energy[0];
    let spent = 0;
    for (let t = 0; t < ticks; t++) {
        actAll(world);
        integrate(world);
        applyCosts(world);
        spent += full - world.energy[0];
        world.energy[0] = full;
        each(world);
    }
    return spent;
}

/**
 * @param {Readonly<Record<string, any>>} config the arena config
 * @param {number} spec the specialisation index
 * @returns {Record<string, any>} a world holding one resting body of that specialisation in slot 0
 */
function lone(config, spec) {
    const body = { spec, ...ARENA_CENTRE, angle: 0, energyShare: STORE_SHARE };
    return stageArena(config, [body]).world;
}

/**
 * Holds a body at a speed and steady turn, then reads the radius of the circle it draws and the energy it spends.
 * @param {Readonly<Record<string, any>>} config the arena config
 * @param {number} spec the specialisation index
 * @param {boolean} sprint whether `SPRINT` is held
 * @returns {{speed: number, radius: number, energy: number}} the speed reached, the circle's radius and the energy of
 *   100 ticks at that speed (measured on a straight run)
 */
function atGait(config, spec, sprint) {
    const straight = lone(config, spec);
    hold(straight, { thrust: 1, turn: 0, sprint });
    run(straight, SETTLE_TICKS);
    const speed = speedOf(straight);
    const energy = run(straight, COST_TICKS);
    const turning = lone(config, spec);
    hold(turning, { thrust: 1, turn: 1, sprint });
    run(turning, SETTLE_TICKS);
    let path = 0;
    run(turning, TURN_TICKS, (w) => {
        path += speedOf(w);
    });
    // Held steady, the velocity turns as fast as the heading does (`turnRate`), so the circle's radius is speed / rate.
    return { speed, radius: path / TURN_TICKS / Math.abs(turning.turnRate[0]), energy };
}

/**
 * @param {Readonly<Record<string, any>>} config the arena config
 * @param {number} spec the specialisation index
 * @returns {number} the distance from the cruise speed to a stop with `THRUST` 0
 */
function stopDistance(config, spec) {
    const world = lone(config, spec);
    hold(world, { thrust: 1, turn: 0, sprint: false });
    run(world, SETTLE_TICKS);
    hold(world, { thrust: 0, turn: 0, sprint: false });
    const x0 = world.x[0];
    run(world, STOP_LIMIT);
    return world.x[0] - x0;
}

/**
 * @param {Readonly<Record<string, any>>} [config] an `arenaConfig`
 * @returns {BodyRow[]} one row per specialisation, in index order
 */
export function bodyTable(config = arenaConfig()) {
    const specs = Object.entries(config.specialisations).sort(([, a], [, b]) => a.index - b.index);
    return specs.map(([name, params]) => {
        const cruise = atGait(config, params.index, false);
        const sprint = atGait(config, params.index, true);
        return {
            name,
            cruiseSpeed: cruise.speed,
            sprintSpeed: sprint.speed,
            turnRadius: cruise.radius,
            sprintTurnRadius: sprint.radius,
            stopDistance: stopDistance(config, params.index),
            cruiseEnergy: cruise.energy,
            sprintEnergy: sprint.energy,
        };
    });
}
