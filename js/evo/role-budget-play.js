// The two plays of the chase timeline (docs/designs/role-budget.md, "Phase 1 steps"): what the hunter and the prey hold
// each tick. The rules are those of `pursuerBrain` and `evaderBrain` in chase-oracles.js, read from a snapshot of the
// two bodies, so the timeline and the scripted chase of `audit:chase` steer the same way. Steering uses vectors.

import { detCos, detSin } from '../sim/det-math.js';
import { JINK_RANGE, EVADER_SPRINT_JINKS } from './chase-oracles.js';
import { aboveFloor, speedOf } from './role-budget-body.js';
import { norm } from './role-budget-kinematics.js';

/** The longest the pursuer leads its aim, in ticks of the evader's motion (`LEAD_MAX` of chase-oracles.js). */
const LEAD_MAX = 30;
/** A speed under this is "at rest" for choosing a direction. */
const REST = 0.05;

/**
 * @typedef {object} HunterPlay
 * @property {'always' | 'view' | 'never'} sprint `always`: sprints while its store is above the floor; `view`: only
 *   with the prey within its `visionRange` too (the oracle); `never`
 * @property {number} effort the sprint effort when it sprints, 0 to 1
 * @property {number} wait ticks it cruises straight, blind to the prey, before it acts (the `see` delay)
 * @property {number} runAt the tick the sprint may start (the `run` delay)
 * @property {number} slowTicks ticks its speed is held at the turn circle's (the `turn` delay)
 * @property {number} seeGap the centre gap inside which it acts: it cruises straight, blind, while the prey is further
 * @property {number} [lead] the most ticks of the prey's motion it leads its aim (default `LEAD_MAX`; 0 aims at the prey where it is)
 */

/**
 * @typedef {object} PreyPlay
 * @property {'always' | 'rationed' | 'never'} sprint `always`: sprints while its store is above the floor; `rationed`:
 *   only with the hunter within `EVADER_SPRINT_JINKS x JINK_RANGE`; `never`
 * @property {number} jink the distance at which it breaks across the hunter's path (0 runs straight)
 * @property {number} breakAngle the turn it breaks through
 * @property {number} awareGap the centre gap at which it first sees the hunter and starts to flee (it stands still before)
 */

/** @type {Readonly<HunterPlay>} */
export const HUNTER_PERFECT = Object.freeze({
    sprint: 'always',
    effort: 1,
    wait: 0,
    runAt: 0,
    slowTicks: 0,
    seeGap: Infinity,
});

/**
 * @param {import('./role-budget-body.js').Body} b the steering body
 * @param {{x: number, y: number}} aim the direction wanted (not unit)
 * @returns {number} the `TURN` output that closes the gap to the aim in one tick: `steer` of chase-oracles.js, written out
 *   over the body's cached heading so a chase takes no trigonometry here (the test holds it equal to `steer`)
 */
export function steerOut(b, aim) {
    return steerXY(b, aim.x, aim.y);
}

/**
 * @param {import('./role-budget-body.js').Body} b the steering body
 * @param {number} ax the aim's x
 * @param {number} ay the aim's y
 * @returns {number} `steerOut` of the aim, without the object (the chase steers twice a tick)
 */
function steerXY(b, ax, ay) {
    const size = Math.sqrt(ax * ax + ay * ay) || 1;
    const cross = (b.ch * ay - b.sh * ax) / size;
    const dot = (b.ch * ax + b.sh * ay) / size;
    if (dot < 0) {
        return Math.sign(cross) || 1;
    }
    return Math.max(-1, Math.min(1, cross / b.p.turnRate.max));
}

/**
 * @param {import('./role-budget-body.js').Body} h the pursuer
 * @param {number} dist the centre gap to the prey
 * @param {HunterPlay} play the pursuer's play
 * @returns {number} the ticks of the prey's motion it leads its aim: the time to close the gap, at most `play.lead`
 */
const leadOf = (h, dist, play) => Math.min(dist / Math.max(speedOf(h), 1), play.lead ?? LEAD_MAX);

/**
 * @param {import('./role-budget-body.js').Body} h the hunter
 * @param {import('./role-budget-body.js').Body} p the prey
 * @param {HunterPlay} play the hunter's play
 * @param {number} tick the tick about to be played, from 0
 * @returns {import('./role-budget-body.js').Out} what the hunter holds
 */
export function hunterOut(h, p, play, tick) {
    const dx = p.x - h.x;
    const dy = p.y - h.y;
    const dist = norm(dx, dy);
    if (tick < play.wait || dist > play.seeGap) {
        return { turn: 0, sprint: 0 };
    }
    const lead = leadOf(h, dist, play);
    const turn = steerXY(h, dx + lead * p.vx, dy + lead * p.vy);
    const inView = play.sprint === 'always' || h.p.store.on === 0 || dist <= h.p.view.range;
    const lasts = play.sprint === 'always' || aboveFloor(h);
    const on = play.sprint !== 'never' && inView && tick >= play.runAt && lasts;
    return { turn, sprint: on ? play.effort : 0 };
}

/**
 * @param {import('./role-budget-body.js').Body} h the hunter
 * @param {import('./role-budget-body.js').Body} p the prey
 * @param {PreyPlay} play the prey's play
 * @returns {import('./role-budget-body.js').Out} what the prey holds: nothing until it is aware, then the flight
 */
export function preyOut(h, p, play) {
    const dx = p.x - h.x;
    const dy = p.y - h.y;
    const dist = norm(dx, dy);
    if (dist > play.awareGap) {
        return { turn: 0, sprint: 0, thrust: 0 };
    }
    const turn = dist < play.jink ? steerOut(p, breakAim(h, { x: dx, y: dy }, play.breakAngle)) : steerXY(p, dx, dy);
    return { turn, sprint: preySprints(p, play, dist) ? 1 : 0 };
}

/**
 * @param {import('./role-budget-body.js').Body} h the hunter
 * @param {{x: number, y: number}} away the vector from the hunter to the prey
 * @param {number} angle the turn the break goes through
 * @returns {{x: number, y: number}} the aim of a prey that breaks: the hunter's line of travel turned through `angle` to
 *   the side the prey stands on, so the hunter must turn through the most
 */
function breakAim(h, away, angle) {
    const t = speedOf(h) > REST ? { x: h.vx, y: h.vy } : { x: h.ch, y: h.sh };
    const side = Math.sign(t.x * away.y - t.y * away.x) || 1;
    const c = detCos(side * angle);
    const s = detSin(side * angle);
    return { x: t.x * c - t.y * s, y: t.x * s + t.y * c };
}

/**
 * @param {import('./role-budget-body.js').Body} p the prey
 * @param {PreyPlay} play the prey's play
 * @param {number} dist the gap to the hunter
 * @returns {boolean} whether the prey sprints this tick
 */
function preySprints(p, play, dist) {
    if (play.sprint === 'never') {
        return false;
    }
    if (play.sprint === 'always') {
        return true;
    }
    return (p.p.store.on === 0 || dist < EVADER_SPRINT_JINKS * JINK_RANGE) && aboveFloor(p);
}
