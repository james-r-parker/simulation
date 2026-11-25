// The contacts of one defence tick (docs/designs/role-budget.md, "Phase 2 steps"), in the order the sim runs them:
// `resolveContacts` separates each overlapping pair in slot order (hunter and caller, hunter and defender, caller and
// defender), then `feed` bites over the same contacts in the same order. A hunter that bites the defender dead lies up for
// `predatorRestTicks` (`applyBite` of js/sim/feeding.js), so the caller is not bitten again until it has rested. A hunter
// the defender shoves is `staggered` with `staggerThrust` on (`noteShoved` of js/sim/effect-social.js): up to three stacks,
// each taking `staggerThrust` off its thrust and closing its bite, all ending `staggerTicks` after the last stack that
// restarted the timer.

import { norm } from './role-budget-kinematics.js';
import { bite, collide, inJaws, mayBite } from './role-budget-body.js';

/**
 * @param {import('./role-budget-body.js').Body} a one body
 * @param {import('./role-budget-body.js').Body} b another
 * @returns {boolean} whether their centres are closer than their sizes
 */
export const touching = (a, b) => norm(b.x - a.x, b.y - a.y) < a.size + b.size;

/**
 * Lands the defender's shove on the hunter, as `tryDefenderRepel` does: the defender pays, the hunter loses energy and is
 * knocked back along the defender-to-hunter line.
 * @param {import('./role-budget-body.js').Body} d the defender
 * @param {import('./role-budget-body.js').Body} h the hunter
 * @returns {void}
 */
function shove(d, h) {
    const power = d.p.repel;
    const dist = Math.max(norm(h.x - d.x, h.y - d.y), 1e-9);
    d.energy = Math.max(0, d.energy - power.cost);
    h.energy = Math.max(0, h.energy - power.energy);
    h.vx += ((h.x - d.x) / dist) * power.impulse;
    h.vy += ((h.y - d.y) / dist) * power.impulse;
}

/**
 * @typedef {object} Meetings who touched whom this tick, before the collisions moved them
 * @property {boolean} hc the hunter and the caller
 * @property {boolean} hd the hunter and the defender (false for an absent or dead defender)
 */

/**
 * Separates the touching pairs in the sim's order and notes the first touches.
 * @param {import('./role-budget-defence.js').State} s the run, updated in place
 * @param {number} tick the tick
 * @returns {Meetings} who touched whom
 */
export function collisions(s, tick) {
    const { h, c, d, out } = s;
    const present = !s.options.absent && !s.dead;
    const hc = touching(h, c);
    if (hc) {
        out.contactTick ??= tick + 1;
        collide(h, c);
    }
    const hd = present && touching(h, d);
    if (hd) {
        out.interceptTick ??= tick + 1;
        out.faced = out.interceptTick === tick + 1 ? inJaws(d, h) : out.faced;
        collide(h, d);
    }
    if (present && touching(c, d)) {
        collide(c, d);
    }
    return { hc, hd };
}

/**
 * The defender's side of a touch: the shove, if it is on and the hunter is in the defender's jaws.
 * @param {import('./role-budget-defence.js').State} s the run, updated in place
 * @param {number} tick the tick
 * @returns {void}
 */
function landShove(s, tick) {
    const { d, h, out, p } = s;
    if ((p.defender.repel.energy > 0 || p.defender.repel.impulse > 0) && inJaws(d, h)) {
        out.repelTick ??= tick + 1;
        out.repels += 1;
        shove(d, h);
        stagger(s);
    }
}

/** The most stacks of `staggered` (`maxStacks` of the effect in js/sim/effect-list.js). */
const MAX_STAGGER = 3;

/**
 * Raises a stack of `staggered` on the hunter and restarts the timer; a stack past the cap is dropped and the timer stays.
 * @param {import('./role-budget-defence.js').State} s the run, updated in place
 * @returns {void}
 */
function stagger(s) {
    const power = s.p.defender.repel;
    if (power.stagger > 0 && s.stagger.stacks < MAX_STAGGER) {
        s.stagger.stacks += 1;
        s.stagger.ticks = power.staggerTicks;
    }
}

/**
 * The fade pass at the end of a tick: the timer of the `staggered` stacks runs down and they end together.
 * @param {import('./role-budget-defence.js').State} s the run, updated in place
 * @returns {void}
 */
export function fadeStagger(s) {
    const { stagger: st } = s;
    if (st.stacks > 0 && (st.ticks -= 1) <= 0) {
        st.stacks = 0;
    }
}

/**
 * @param {import('./role-budget-defence.js').State} s the run, its rest counted down
 * @param {import('./role-budget-body.js').Out} ho what the hunter holds
 * @returns {import('./role-budget-body.js').Out} what it holds this tick: its thrust cut by the stacks of `staggered` (each
 *   takes `staggerThrust` off, never below 0) and none at all while it lies up after a kill (`resting` scales `maxThrust` by
 *   0), the steering and the sprint unchanged
 */
export function lying(s, ho) {
    const rested = s.rest > 0;
    s.rest = rested ? s.rest - 1 : 0;
    const cut = Math.max(0, 1 - s.p.defender.repel.stagger * s.stagger.stacks);
    return rested || cut < 1 ? { ...ho, thrust: rested ? 0 : cut } : ho;
}

/**
 * The hunter's bite on the defender it touches, then the defender's shove; a fatal bite takes the defender out and puts the
 * hunter to rest.
 * @param {import('./role-budget-defence.js').State} s the run, updated in place
 * @param {{tick: number, open: boolean}} at the tick and whether the hunter may bite (it is not staggered)
 * @returns {void}
 */
function meetDefender(s, { tick, open }) {
    const { h, d, out } = s;
    s.dead = open && mayBite(h, d) && bite(h, d, s.mauled);
    landShove(s, tick);
    if (s.dead) {
        s.rest = s.p.hunter.kill.rest;
        out.defenderKillTick = tick + 1;
    }
}

/**
 * The feed phase of a tick: the hunter bites the caller in its jaws (past the size gate as the sizes stand now), then the
 * defender it touches, which shoves it; a fatal bite on the defender takes it out and puts the hunter to rest.
 * @param {import('./role-budget-defence.js').State} s the run, updated in place
 * @param {{tick: number, meetings: Meetings}} at the tick and who touched whom
 * @returns {boolean} whether the bite killed the caller
 */
export function feed(s, { tick, meetings }) {
    const { h, c, out, p, tally } = s;
    const alarmed = out.alarmTick >= 0 && tick < out.alarmTick + p.caller.call.ticks;
    const open = s.stagger.stacks === 0;
    if (meetings.hc && open && mayBite(h, c) && bite(h, c, tally, alarmed)) {
        return true;
    }
    if (meetings.hd) {
        meetDefender(s, { tick, open });
    }
    return false;
}
