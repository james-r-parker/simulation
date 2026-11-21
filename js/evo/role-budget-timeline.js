// The chase timeline (docs/designs/role-budget.md, "Phase 1 steps"): a scalar recurrence of one hunter and one prey from
// a start gap to the kill, with no world. Each tick it reads the two bodies, plays the step of the sim for each
// (`stepBody`), resolves a contact (the impulse and the separation of `resolveContacts`), lands a bite when the prey is in
// the jaws, and charges the costs, in the order of the sim. Energies, sizes, stores and fat factors move with the run,
// so the bites needed and the speed lost to a heavy body come out of the same loop.

import { detCos, detSin } from '../sim/det-math.js';
import { norm, turnCircle } from './role-budget-kinematics.js';
import { bite, charge, collide, costOf, createBody, speedOf, stepBody } from './role-budget-body.js';
import { HUNTER_PERFECT, hunterOut, preyOut } from './role-budget-play.js';
import { JINK_RANGE } from './chase-oracles.js';

/** The longest a chase runs, in ticks: `MAX_TICKS` of chase-envelope.js. */
export const MAX_TICKS = 250;

/**
 * @typedef {object} TimelineOptions
 * @property {number} gap the centre gap at tick 0
 * @property {number} [bearing] the angle of the line to the prey from the hunter's heading
 * @property {'rest' | 'cruise'} [hunterStart] the hunter's speed at tick 0 (cruise cap: it was creeping)
 * @property {Partial<import('./role-budget-play.js').HunterPlay>} [hunter] the hunter's play over the perfect one
 * @property {Partial<import('./role-budget-play.js').PreyPlay>} [prey] the prey's play over the flight of the oracle
 * @property {number} [maxTicks] the longest the chase runs
 */

/**
 * @typedef {object} Timeline
 * @property {number | null} contactTick the first tick the centre gap is under the two sizes, null for none
 * @property {number | null} killTick the tick the fatal bite lands, null for none
 * @property {number} bites the bites landed
 * @property {boolean} gate whether the size gate of `couldBite` held at the first contact
 * @property {number} hunterEnergy the hunter's energy at the end (after the bites, the gorge and the kicks)
 * @property {number} preyEnergy the prey's energy at the end
 * @property {number} hunterSpent the energy the hunter's costs took
 * @property {number} income the energy the bites and the gorge returned to the hunter
 * @property {number} kick the kicks the bites cost the hunter
 * @property {number} hunterLevel the hunter's store at the end
 * @property {number} speed the hunter's speed at the end
 * @property {number} ticks the ticks played
 * @property {number} heat the heat the hunter gained: its speed over `maxVelocity` each tick, times `gainMove`
 */

/**
 * @param {{h: import('./role-budget-body.js').Body, p: import('./role-budget-body.js').Body, heat: number,
 *   tick: number, tally: {bites: number, income: number, kick: number, contact: number | null, gate: boolean},
 *   fatal: boolean}} at the hunter, the prey, the heat gained so far, the tick played (from 0), the bites so far and
 *   whether the last bite killed
 * @returns {Timeline} the run as it stands
 */
function result({ h, p, heat, tick, tally, fatal }) {
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
        heat,
    };
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
    const p = createBody(prey, { x: o.gap * detCos(o.bearing), y: o.gap * detSin(o.bearing), angle: o.bearing });
    const slow = turnCircle(hunter.thrust.cruise, hunter.damping, hunter.turnRate.start, hunter.cap.cruise).speed;
    const tally = { bites: 0, income: 0, kick: 0, contact: /** @type {number | null} */ (null), gate: false };
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
        if (norm(p.x - h.x, p.y - h.y) < h.size + p.size) {
            tally.contact ??= tick + 1;
            tally.gate = tally.contact === tick + 1 ? h.size > hunter.bite.sizeRatio * p.size : tally.gate;
            collide(h, p);
            if (tally.gate && bite(h, p, tally)) {
                return result({ h, p, heat, tick, tally, fatal: true });
            }
        }
        charge(h, costOf(h, ho, hf));
        charge(p, costOf(p, po, pf));
    }
    return result({ h, p, heat, tick: o.maxTicks - 1, tally, fatal: false });
}
