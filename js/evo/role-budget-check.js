// The cross-check of the Phase 1 budget against the sim (docs/designs/role-budget.md, "Cross-check against the sim"): the
// formulas played beside the scripted chase of `audit:chase`, each with its tolerance. A scene is a staged arena with the
// oracle brains of chase-oracles.js and no start jitter, so the formula and the sim start from the same state.

import { detCos, detSin } from '../sim/det-math.js';
import { step } from '../sim/step.js';
import { ARENA_CENTRE, stageArena } from './chase-arena.js';
import { bodyTable } from './chase-body.js';
import { evaderBrain, pursuerBrain } from './chase-oracles.js';
import { DISTANCE_SHARES, MAX_TICKS } from './chase-envelope.js';
import { AUDIT_BEARINGS } from './role-budget-chase.js';
import { createBody, costOf } from './role-budget-body.js';
import { roleParams } from './role-budget-params.js';
import { chaseTimeline } from './role-budget-timeline.js';
import { turnCircle } from './role-budget-kinematics.js';

/** The tolerances of the plan's "Tolerances" table, as relative differences or ticks. */
export const TOLERANCE = Object.freeze({
    radius: 0.005,
    energy: 0.001,
    speed: 1e-4,
    contactTicks: 2,
    killNet: 0.05,
});

/**
 * Stages one scripted chase in the sim: the pursuer at the arena's centre heading +x, the prey `distance` away at `bearing`,
 * facing away, both at rest and at half a store, the oracle brains, no jitter.
 * @param {Readonly<Record<string, any>>} config an `arenaConfig`
 * @param {{hunter: string, prey: string, distance: number, bearing: number, straight: boolean}} scene the scene
 * @returns {{world: Record<string, any>, policy: any, brain: (world: Record<string, any>) => void}} the staged world, its policy and
 *   the brain phase of both bodies
 */
export function stageChase(config, { hunter, prey, distance, bearing, straight }) {
    const specs = /** @type {Record<string, any>} */ (config.specialisations);
    const bodies = [
        { spec: specs[hunter].index, ...ARENA_CENTRE, angle: 0 },
        {
            spec: specs[prey].index,
            x: ARENA_CENTRE.x + distance * detCos(bearing),
            y: ARENA_CENTRE.y + distance * detSin(bearing),
            angle: bearing,
        },
    ];
    const { world, policy } = stageArena(config, bodies);
    const hunt = pursuerBrain({ pursuer: 0, evader: 1, sprint: true });
    const flee = evaderBrain({ pursuer: 0, evader: 1, sprint: true, jinkRange: straight ? 0 : undefined });
    const brain = (/** @type {Record<string, any>} */ w) => {
        hunt(w);
        flee(w);
    };
    return { world, policy, brain };
}

/**
 * Plays one scripted chase in the sim (`stageChase`).
 * @param {Readonly<Record<string, any>>} config an `arenaConfig`
 * @param {{hunter: string, prey: string, distance: number, bearing: number, straight: boolean}} scene the scene
 * @returns {{killTick: number | null, net: number | null}} the tick the prey died and the hunter's energy gained by then (the
 *   bites and the gorge less the kicks, the costs and the strike misses), null when it did not die inside `MAX_TICKS`
 */
export function simChase(config, scene) {
    const { world, policy, brain } = stageChase(config, scene);
    const start = world.energy[0];
    for (let tick = 1; tick <= MAX_TICKS; tick++) {
        step(world, policy, { brain });
        if (world.alive[1] === 0) {
            return { killTick: tick, net: world.energy[0] - start };
        }
        if (world.alive[0] === 0) {
            break;
        }
    }
    return { killTick: null, net: null };
}

/**
 * The timeline of the same scene: the hunter from rest, sprinting while the prey is in its view and the store lasts, the
 * prey with the oracle evader's rationed sprint. The staged hunter is a newborn, so it pays the juvenile burn.
 * @param {Readonly<Record<string, any>>} config an `arenaConfig`
 * @param {{hunter: string, prey: string, distance: number, bearing: number, straight: boolean}} scene the scene
 * @returns {{killTick: number | null, net: number | null, income: number}} the formula's kill tick, the hunter's energy
 *   gained by then and the energy the kill returned
 */
export function formulaChase(config, { hunter, prey, distance, bearing, straight }) {
    const hunterParams = roleParams(config, hunter, {}, { age: 'juvenile' });
    const run = chaseTimeline(hunterParams, roleParams(config, prey), {
        gap: distance,
        bearing,
        hunter: { sprint: 'view' },
        prey: straight ? { sprint: 'rationed', jink: 0 } : { sprint: 'rationed' },
    });
    return {
        killTick: run.killTick,
        net: run.killTick === null ? null : run.hunterEnergy - hunterParams.energy,
        income: run.income,
    };
}

/**
 * @typedef {object} ChaseCell one start distance and bearing played both ways
 * @property {number} distance the start gap
 * @property {number} bearing the bearing
 * @property {boolean} straight whether the prey ran straight
 * @property {number | null} formula the formula's kill tick
 * @property {number | null} sim the sim's kill tick
 * @property {number | null} netDifference when both kill, the difference of the hunter's net energy at the kill over the larger
 *   of the sim's net and the energy the kill returned (a chase that breaks even has a net near 0, where a ratio says nothing)
 * @property {boolean} agrees whether both killed or both did not
 * @property {boolean} edge whether the start is at the hunter's view, where the sprint gate (`gap <= visionRange`) is
 *   decided by float32 rounding of the sim's positions, so a disagreement is not read
 * @property {boolean} drift whether the cell is outside its tolerance: the kills disagree away from the edge, or both
 *   kill more than `contactTicks` apart, or the net energy per kill differs by more than `killNet`
 */

/**
 * Reads one scene played both ways against the tolerances.
 * @param {{killTick: number | null, net: number | null, income: number}} f the formula's chase
 * @param {{killTick: number | null, net: number | null}} w the sim's chase
 * @param {boolean} edge whether the start is at the hunter's view
 * @returns {Pick<ChaseCell, 'formula' | 'sim' | 'netDifference' | 'agrees' | 'edge' | 'drift'>} the kill ticks, the net
 *   difference when both kill, and whether the cell is outside its tolerance
 */
export function judgeCell(f, w, edge) {
    const agrees = (f.killTick === null) === (w.killTick === null);
    const both = f.net !== null && w.net !== null;
    const apart =
        both &&
        Math.abs(/** @type {number} */ (f.killTick) - /** @type {number} */ (w.killTick)) > TOLERANCE.contactTicks;
    const sim = both ? /** @type {number} */ (w.net) : 0;
    const netDifference = both
        ? Math.abs(/** @type {number} */ (f.net) - sim) / Math.max(Math.abs(sim), f.income)
        : null;
    const netApart = netDifference !== null && netDifference > TOLERANCE.killNet;
    return {
        formula: f.killTick,
        sim: w.killTick,
        netDifference,
        agrees,
        edge,
        drift: (!agrees && !edge) || apart || netApart,
    };
}

/**
 * Plays every start distance and audit bearing both ways for one pair and one prey bound.
 * @param {Readonly<Record<string, any>>} config an `arenaConfig`
 * @param {{hunter: string, prey: string, straight: boolean}} pair the pair and the bound
 * @param {readonly number[]} [shares] the start distances as shares of the hunter's view (the five of `audit:chase`)
 * @returns {ChaseCell[]} one cell per distance and bearing
 */
export function chaseCells(config, { hunter, prey, straight }, shares = DISTANCE_SHARES) {
    const view = /** @type {Record<string, any>} */ (config.specialisations)[hunter].visionRange;
    return shares.flatMap((share) =>
        AUDIT_BEARINGS.map((bearing) => {
            const scene = { hunter, prey, distance: share * view, bearing, straight };
            const cell = judgeCell(formulaChase(config, scene), simChase(config, scene), share >= 1);
            return { distance: scene.distance, bearing, straight, ...cell };
        }),
    );
}

/**
 * @typedef {object} KinematicRow one reading of the formula against `bodyTable`
 * @property {string} spec the specialisation
 * @property {string} what the reading
 * @property {number} formula the formula's value
 * @property {number} sim the sim's value
 * @property {number} difference the relative difference
 * @property {number} tolerance the tolerance of the plan
 * @property {boolean} drift whether the difference is outside it
 */

/**
 * @param {Readonly<Record<string, any>>} config an `arenaConfig`
 * @returns {KinematicRow[]} the speeds, turn radii and energy per 100 ticks of each specialisation, formula against the
 *   body table
 */
export function kinematicRows(config) {
    return bodyTable(config).flatMap((row) => {
        // the body table measures a newborn: a juvenile hunter pays the juvenile burn
        const p = roleParams(config, row.name, {}, { age: 'juvenile' });
        const cruise = turnCircle(p.thrust.cruise, p.damping, p.turnRate.start, p.cap.cruise);
        const sprint = turnCircle(p.thrust.sprint, p.damping, p.turnRate.start, p.cap.sprint);
        const reading = (
            /** @type {string} */ what,
            /** @type {number} */ formula,
            /** @type {number} */ sim,
            /** @type {number} */ tolerance,
        ) => {
            const difference = Math.abs(formula / sim - 1);
            return { spec: row.name, what, formula, sim, difference, tolerance, drift: difference > tolerance };
        };
        const per100 = (/** @type {number} */ speed, /** @type {number} */ effort) => {
            const b = createBody(p, { x: 0, y: 0, angle: 0, speed });
            return 100 * costOf(b, { turn: 0, sprint: effort }, 1);
        };
        return [
            reading('energy per 100 ticks', per100(p.cap.cruise, 0), row.cruiseEnergy, TOLERANCE.energy),
            reading('sprint energy per 100 ticks', per100(p.cap.sprint, 1), row.sprintEnergy, TOLERANCE.energy),
            reading('cruise speed', p.cap.cruise, row.cruiseSpeed, TOLERANCE.speed),
            reading('sprint speed', p.cap.sprint, row.sprintSpeed, TOLERANCE.speed),
            reading('turn radius', cruise.radius, row.turnRadius, TOLERANCE.radius),
            reading('sprint turn radius', sprint.radius, row.sprintTurnRadius, TOLERANCE.radius),
        ];
    });
}
