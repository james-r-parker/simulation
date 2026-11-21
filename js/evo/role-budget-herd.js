// The herd (docs/designs/role-budget.md, "Phase 5 steps"): a stampeding herd against a body in its path. A herd animal that closes on
// a body tramples it (`resolveContact` in js/sim/trample.js); the job is to see the herd coming, turn and clear its half-width
// before the front arrives, and to survive a trample if it does not. Pure: it reads the config and a spec's `RoleParams`.

import { SLACK_CAP, cell, rowOf } from './role-budget-cell.js';
import { speedStep, swingTicks } from './role-budget-kinematics.js';
import { viewReach } from './role-budget-senses.js';

/** The steps of the row, in order. */
export const HERD_STEPS = Object.freeze(['see', 'turn', 'run', 'survive']);

/** The rate an animal's velocity relaxes toward its desired velocity a tick (`HERD_TURN` of js/sim/herd-steering.js). */
const RELAX = 0.05;
/** The share of the flee vector added to every animal's desired velocity (`setDesiredVelocity`). */
const FLEE_BIAS = 0.25;
/** The turn a body makes to head for the nearer flank: side-on to the path. */
const FLANK_TURN = Math.PI / 2;

/**
 * @typedef {object} HerdNumbers the herd's numbers
 * @property {number} ring the radius of the ring the herd spawns on, `herdSize x 2.2 x herdRadius / (2 pi)`
 * @property {number} radius `herdRadius`
 * @property {number} run `herdRunSpeed`
 * @property {number} walk `herdWalkSpeed`
 * @property {number} damage `trampleDamage`
 * @property {number} maxVelocity the speed a trample's closing speed is read against
 * @property {number} stampede `herdStampedeTicks`
 * @property {boolean} pulled whether the ring is wider than `4 x herdRadius`, which pulls the front animal back toward the centroid at
 *   full speed (`setDesiredVelocity`): the run of `herdTimeline` is then too fast, and the lateral pull is not modelled
 */

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @returns {HerdNumbers} the herd's numbers
 */
export function herdNumbers(config) {
    return {
        ring: (config.herdSize * 2.2 * config.herdRadius) / (2 * Math.PI),
        radius: config.herdRadius,
        run: config.herdRunSpeed,
        walk: config.herdWalkSpeed,
        damage: config.trampleDamage,
        maxVelocity: config.maxVelocity,
        stampede: config.herdStampedeTicks,
        pulled: (config.herdSize * 2.2 * config.herdRadius) / (2 * Math.PI) > 4 * config.herdRadius,
    };
}

/**
 * One animal's run along the flee axis once the alarm is up: each tick its velocity relaxes toward the desired velocity (`herdRunSpeed`
 * plus the flee bias, 6.75) by 0.05, is capped at `herdRunSpeed`, and the animal moves by it. The herd's centroid follows it
 * (js/sim/herd-motion.js `summarizeGroup`) and an animal inside `4 x herdRadius` of it is not pulled back, so the run is one
 * dimensional; the lateral pull is not modelled.
 * @param {HerdNumbers} herd the herd's numbers
 * @param {{ticks?: number, start?: number}} [options] the ticks to run (`herdStampedeTicks`) and the speed it starts at (0)
 * @returns {{position: Float64Array, speed: Float64Array}} the distance covered and the speed after each tick
 */
export function herdTimeline(herd, { ticks = herd.stampede, start = 0 } = {}) {
    const position = new Float64Array(ticks);
    const speed = new Float64Array(ticks);
    let v = start;
    let x = 0;
    for (let t = 0; t < ticks; t++) {
        v = Math.min(herd.run, v + (herd.run + FLEE_BIAS - v) * RELAX);
        x += v;
        position[t] = x;
        speed[t] = v;
    }
    return { position, speed };
}

/**
 * @param {{position: Float64Array, speed: Float64Array}} line a herd timeline
 * @param {number} distance the distance to cover
 * @returns {{ticks: number, speed: number}} the tick (from 1) the animal has covered it, extended at its last speed past the
 *   timeline, and its speed then
 */
export function ticksToCover(line, distance) {
    const n = line.position.length;
    for (let t = 0; t < n; t++) {
        if (line.position[t] >= distance) {
            return { ticks: t + 1, speed: line.speed[t] };
        }
    }
    const last = line.speed[n - 1];
    return { ticks: n + (distance - line.position[n - 1]) / last, speed: last };
}

/**
 * The ticks a body takes to cover a distance sideways from rest on the speed law of the sim, at a gait.
 * @param {import('./role-budget-params.js').RoleParams} p the body
 * @param {{distance: number, sprint: boolean}} run the distance and whether it sprints (the sprint thrust and cap)
 * @returns {number} the first tick count whose distance is at least `distance`
 */
export function clearTicks(p, { distance, sprint }) {
    const a = sprint ? p.thrust.sprint : p.thrust.cruise;
    const cap = sprint ? p.cap.sprint : p.cap.cruise;
    let v = 0;
    let x = 0;
    let n = 0;
    while (x < distance) {
        v = speedStep(v, a, p.damping, cap);
        x += v;
        n += 1;
    }
    return n;
}

/**
 * @param {HerdNumbers} herd the herd's numbers
 * @param {import('./role-budget-params.js').RoleParams} p the body
 * @param {number} speed the herd's closing speed
 * @returns {number} the energy one trample takes: `trampleDamage x (speed / maxVelocity)^2 x size / baseSize`
 */
export function trampleLoss(herd, p, speed) {
    const ratio = speed / herd.maxVelocity;
    return herd.damage * ratio * ratio * (p.size / p.sizing.base);
}

/**
 * @typedef {object} HerdCase one body's reading in one place
 * @property {number} sight the distance the front animal covers between being seen and arriving, `viewReach - size`
 * @property {number} warning the ticks the front animal takes to cover it from a standing start (`herdTimeline`)
 * @property {number} constant the ticks at a constant `herdRunSpeed`, the herd's worst case
 * @property {number} turn the ticks to turn through a right angle
 * @property {{cruise: number, sprint: number}} clear the ticks to clear the half-width sideways at each gait
 * @property {number} half the half-width of the herd with the body: the ring, `herdRadius` and the body's size
 * @property {number} arrival the herd's speed when its front reaches a body that stands
 * @property {{ahead: number, outrun: boolean}} straight the body's cruise cap against the herd's peak speed
 */

/**
 * @param {HerdNumbers} herd the herd's numbers
 * @param {import('./role-budget-params.js').RoleParams} p the body
 * @param {number} bearing the bearing of the herd from the body's heading (0 facing it, PI facing away)
 * @returns {HerdCase} the case
 */
function caseOf(herd, p, bearing) {
    const sight = viewReach(p, bearing) - p.size;
    const line = herdTimeline(herd);
    const arrive = ticksToCover(line, sight);
    const half = herd.ring + herd.radius + p.size;
    return {
        sight,
        warning: arrive.ticks,
        constant: sight / herd.run,
        turn: swingTicks(FLANK_TURN, p.turnRate.start),
        clear: {
            cruise: clearTicks(p, { distance: half, sprint: false }),
            sprint: clearTicks(p, { distance: half, sprint: true }),
        },
        half,
        arrival: arrive.speed,
        straight: { ahead: p.cap.cruise, outrun: p.cap.cruise > herd.run },
    };
}

/**
 * @typedef {object} HerdBudget
 * @property {ReturnType<typeof rowOf>} row the matrix row `<spec>:herd`
 * @property {Record<string, import('./role-budget-cell.js').Cell>} cells see, turn, run and survive of the worst case
 * @property {HerdCase} typical the body on the centre line facing the herd
 * @property {HerdCase} worst the body on the centre line facing away, on its rear view
 * @property {boolean} pulled whether the herd's ring is wider than `4 x herdRadius` (see `HerdNumbers`)
 * @property {{arrival: number, walk: number, constant: number, survives: number, walkSurvives: number}} trample the loss of one trample
 *   at the herd's speed on arrival, at its walk speed and at its peak speed, and the tramples the body survives at arrival and walk speed
 * @property {string | null} binding the step of least slack, or `HUNTER_BINDING` for a body that can hunt (its row is `n/a`)
 */

/**
 * The cells of one case. `see` is the warning in ticks; `turn` the ticks left once the reaction and the turn are paid; `run` the
 * ticks left once the best gait has cleared the half-width, the slack of the plan (the front arrives at `warning`); `survive` the
 * tramples the body's energy holds at the herd's arrival speed, 0 and impossible with less than one.
 * @param {HerdNumbers} herd the herd's numbers
 * @param {{p: import('./role-budget-params.js').RoleParams, c: HerdCase, model: import('./role-budget-model.js').RoleModel}} body the
 *   body, its case and the model
 * @returns {Record<string, import('./role-budget-cell.js').Cell>} the cells
 */
function cellsOf(herd, { p, c, model }) {
    const clear = Math.min(c.clear.cruise, c.clear.sprint);
    const acted = c.warning - model.reactionTicks - c.turn;
    const left = acted - clear;
    const tramples = Math.floor(p.energy / trampleLoss(herd, p, c.arrival));
    const slack = (/** @type {number} */ ticks) => (ticks >= 0 ? Math.min(SLACK_CAP, ticks) : null);
    return {
        see: cell(c.sight > 0 ? Math.min(SLACK_CAP, c.warning) : null, model),
        turn: cell(slack(acted), model),
        run: cell(slack(left), model),
        survive: cell(tramples >= 1 ? tramples : null, model, { unit: 'tramples' }),
    };
}

/** The binding of a hunter's row: a herd turns from a body that can hunt (`senseGroupHunters` in js/sim/herd-startle.js). */
export const HUNTER_BINDING = 'the herd turns from a hunter';

/**
 * The row of a body against the herd. A body that can hunt is not read: the herd turns from it before it arrives, so every
 * step is `n/a` and the binding is `HUNTER_BINDING`.
 * @param {HerdNumbers} herd the herd's numbers
 * @param {{p: import('./role-budget-params.js').RoleParams, c: HerdCase, model: import('./role-budget-model.js').RoleModel}} body
 *   the body, its case and the model
 * @returns {ReturnType<typeof rowOf>} the row
 */
function herdRow(herd, { p, c, model }) {
    if (p.hunts === 1) {
        const cells = Object.fromEntries(HERD_STEPS.map((step) => [step, cell(undefined, model)]));
        return { ...rowOf(`${p.spec}:herd`, cells), status: 'n/a', binding: HUNTER_BINDING };
    }
    return rowOf(`${p.spec}:herd`, cellsOf(herd, { p, c, model }));
}

/**
 * The budget of a body against a stampede.
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {import('./role-budget-params.js').RoleParams} p the body
 * @param {import('./role-budget-model.js').RoleModel} model the model options
 * @returns {HerdBudget} the budget
 */
export function budgetHerd(config, p, model) {
    const herd = herdNumbers(config);
    const typical = caseOf(herd, p, 0);
    const worst = caseOf(herd, p, Math.PI);
    const row = herdRow(herd, { p, c: worst, model });
    const loss = (/** @type {number} */ speed) => trampleLoss(herd, p, speed);
    return {
        row,
        cells: row.cells,
        typical,
        worst,
        pulled: herd.pulled,
        trample: {
            arrival: loss(worst.arrival),
            walk: loss(herd.walk),
            constant: loss(herd.run),
            survives: Math.floor(p.energy / loss(worst.arrival)),
            walkSurvives: Math.floor(p.energy / loss(herd.walk)),
        },
        binding: row.binding,
    };
}
