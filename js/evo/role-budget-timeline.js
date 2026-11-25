// The chase timeline (docs/designs/role-budget.md, "Phase 1 steps"): a scalar recurrence of one hunter and one prey from
// a start gap to the kill, with no world. Each tick it reads the two bodies, plays the step of the sim for each
// (`stepBody`), resolves a contact (the impulse and the separation of `resolveContacts`), lands a bite when the prey is in
// the jaws, and charges the costs, in the order of the sim. Energies, sizes, stores and fat factors move with the run,
// so the bites needed and the speed lost to a heavy body come out of the same loop.

import { detCos, detSin } from '../sim/det-math.js';
import { norm, turnCircle } from './role-budget-kinematics.js';
import { bite, charge, collide, costOf, createBody, inJaws, mayBite, speedOf, stepBody } from './role-budget-body.js';
import { HUNTER_PERFECT, hunterOut, preyOut } from './role-budget-play.js';
import { viewReach } from './role-budget-senses.js';
import { JINK_RANGE } from './chase-oracles.js';
import { createLapse, lapseTicks, noteLapse } from './role-budget-lapse.js';

/** The longest a chase runs, in ticks: `MAX_TICKS` of chase-envelope.js. */
export const MAX_TICKS = 250;

/**
 * @typedef {object} TimelineOptions
 * @property {number} gap the centre gap at tick 0
 * @property {number} [bearing] the angle of the line to the prey from the hunter's heading
 * @property {'rest' | 'cruise'} [hunterStart] the hunter's speed at tick 0 (cruise cap: it was creeping)
 * @property {Partial<import('./role-budget-play.js').HunterPlay>} [hunter] the hunter's play over the perfect one
 * @property {Partial<import('./role-budget-play.js').PreyPlay>} [prey] the prey's play over the flight of the oracle
 * @property {{speed: number, offset: number}} [preyStart] the prey's speed at tick 0 and its heading's offset from straight away
 *   from the hunter, in radians (default at rest and facing away: a prey that was standing)
 * @property {number} [maxTicks] the longest the chase runs
 */

/**
 * @typedef {object} Timeline
 * @property {number | null} contactTick the first tick the centre gap is under the two sizes, null for none
 * @property {number | null} killTick the tick the fatal bite lands, null for none
 * @property {number} bites the bites landed
 * @property {boolean} gate whether the size gate of `couldBite` held on any contact tick (it is read on each, as bodies shrink)
 * @property {number} hunterEnergy the hunter's energy at the end (after the bites, the gorge and the kicks)
 * @property {number} preyEnergy the prey's energy at the end
 * @property {number} hunterSpent the energy the hunter's costs took
 * @property {number} income the energy the bites and the gorge returned to the hunter
 * @property {number} kick the kicks the bites cost the hunter
 * @property {number} hunterLevel the hunter's store at the end
 * @property {number} speed the hunter's speed at the end
 * @property {number} ticks the ticks played
 * @property {number} lapse the ticks a chase that does not kill lasts: the sim's give-up (`lapseTicks`), at most the ticks played
 * @property {number} heat the heat the hunter gained: its speed over `maxVelocity` each tick, times `gainMove`
 */

/**
 * @param {{h: import('./role-budget-body.js').Body, p: import('./role-budget-body.js').Body, heat: number,
 *   tick: number, tally: {bites: number, income: number, kick: number, contact: number | null, gate: boolean},
 *   fatal: boolean, closing: import('./role-budget-lapse.js').Lapse}} at the hunter, the prey, the heat gained so far, the tick played
 *   (from 0), the bites so far, whether the last bite killed and the closing tracker
 * @returns {Timeline} the run as it stands
 */
function result({ h, p, heat, tick, tally, fatal, closing }) {
    return {
        contactTick: tally.contact,
        killTick: fatal ? tick + 1 : null,
        bites: tally.bites,
        gate: tally.gate,
        hunterEnergy: h.energy,
        preyEnergy: p.energy,
        hunterSpent: h.spent,
        income: tally.income,
        kick: tally.kick,
        hunterLevel: h.level,
        speed: speedOf(h),
        ticks: tick + 1,
        lapse: lapseTicks(closing, tick + 1),
        heat,
    };
}

/** What a tick's contact came to: nothing, the prey in the jaws, a fatal bite. */
const NO_JAWS = 0;
const IN_JAWS = 1;
const FATAL = 2;

/**
 * The contact of one tick: when the bodies touch, the first contact is noted, the size gate is read as the sizes stand
 * (`couldBite` reads it on each bite), the overlap is resolved and a bite lands if the gate allows it and the prey is in the jaws.
 * Allocates nothing: a chase plays this every tick.
 * @param {import('./role-budget-body.js').Body} h the hunter
 * @param {import('./role-budget-body.js').Body} p the prey
 * @param {number} tick the tick, from 0
 * @param {{bites: number, income: number, kick: number, contact: number | null, gate: boolean}} tally updated in place
 * @returns {number} `NO_JAWS` when the prey is not in the hunter's jaws (or not touched), `IN_JAWS`, or `FATAL` when the bite killed
 */
function touchStep(h, p, tick, tally) {
    if (norm(p.x - h.x, p.y - h.y) >= h.size + p.size) {
        return NO_JAWS;
    }
    tally.contact ??= tick + 1;
    const may = mayBite(h, p);
    tally.gate ||= may;
    collide(h, p);
    if (may && bite(h, p, tally)) {
        return FATAL;
    }
    return inJaws(h, p) ? IN_JAWS : NO_JAWS;
}

/**
 * Plays one chase from tick 0 until the kill or the end of `maxTicks`.
 * @param {import('./role-budget-params.js').RoleParams} hunter the hunter's numbers (a `roleParams`)
 * @param {import('./role-budget-params.js').RoleParams} prey the prey's numbers
 * @param {TimelineOptions} options the start and the plays; by default the prey is aware from tick 0, flees with the
 *   oracle evader's rationed sprint and breaks across the hunter's path inside `JINK_RANGE`, and the hunter is perfect
 *   from rest
 * @returns {Timeline} the run
 */
export function chaseTimeline(hunter, prey, options) {
    const o = { bearing: 0, hunterStart: 'rest', maxTicks: MAX_TICKS, ...options };
    const hunterPlay = { ...HUNTER_PERFECT, ...o.hunter };
    /** @type {import('./role-budget-play.js').PreyPlay} */
    const preyPlay = { sprint: 'rationed', jink: JINK_RANGE, breakAngle: Math.PI / 2, awareGap: Infinity, ...o.prey };
    const speed = o.hunterStart === 'cruise' ? hunter.cap.cruise : 0;
    const h = createBody(hunter, { x: 0, y: 0, angle: 0, speed });
    const { speed: preySpeed = 0, offset = 0 } = o.preyStart ?? {};
    const p = createBody(prey, {
        x: o.gap * detCos(o.bearing),
        y: o.gap * detSin(o.bearing),
        angle: o.bearing + offset,
        speed: preySpeed,
    });
    const slow = turnCircle(hunter.thrust.cruise, hunter.damping, hunter.turnRate.start, hunter.cap.cruise).speed;
    const tally = { bites: 0, income: 0, kick: 0, contact: /** @type {number | null} */ (null), gate: false };
    const closing = createLapse();
    const sight = viewReach(hunter, 0) + prey.size;
    let heat = 0;
    for (let tick = 0; tick < o.maxTicks; tick++) {
        const ho = hunterOut(h, p, hunterPlay, tick);
        const po = preyOut(h, p, preyPlay);
        const hf = stepBody(h, ho);
        const pf = stepBody(p, po);
        if (tick < hunterPlay.slowTicks && speedOf(h) > slow) {
            h.vx *= slow / speedOf(h);
            h.vy *= slow / speedOf(h);
        }
        heat += Math.min(speedOf(h) / hunter.cap.cruise, 1) * hunter.heat.gainMove;
        noteLapse(closing, { h, p, tick, maxVelocity: hunter.cap.cruise, sight });
        const touch = touchStep(h, p, tick, tally);
        if (touch === FATAL) {
            return result({ h, p, heat, tick, tally, fatal: true, closing });
        }
        // a hunter holding BITE with no body in its jaws pays `strikeMissCost` (the feed phase of the sim)
        if (touch === NO_JAWS) {
            charge(h, hunter.bite.miss);
        }
        charge(h, costOf(h, ho, hf));
        charge(p, costOf(p, po, pf));
    }
    return result({ h, p, heat, tick: o.maxTicks - 1, tally, fatal: false, closing });
}

/**
 * `chaseTimeline` cut where the sim gives up: played to `MAX_TICKS`, then, if the chase lapsed before that (`lapse` of the
 * run), played again to the lapse so the hunter's energy and heat are those at the give-up.
 * @param {import('./role-budget-params.js').RoleParams} hunter the hunter's numbers
 * @param {import('./role-budget-params.js').RoleParams} prey the prey's numbers
 * @param {TimelineOptions} options as `chaseTimeline`
 * @returns {Timeline} the run to its lapse (to its kill, or to the limit when neither comes first)
 */
export function playToLapse(hunter, prey, options) {
    const run = chaseTimeline(hunter, prey, options);
    return run.lapse < run.ticks ? chaseTimeline(hunter, prey, { ...options, maxTicks: run.lapse }) : run;
}
