// The defence timeline (docs/designs/role-budget.md, "Phase 2 steps"): a hunter closing on a standing caller, the caller's
// alarm, and a defender that hears it and runs at the hunter, as a scalar recurrence with no world. It reuses the body law
// of the chase timeline (`stepBody`, `collide`, `bite`, `costOf`) and the oracle's rules (`hunterOut`), so the defence
// cannot step differently from the chase. The defender's shove is `tryDefenderRepel` of js/sim/defender-repel.js.

import { norm, turnCircle } from './role-budget-kinematics.js';
import { bite, charge, collide, costOf, createBody, inJaws, speedOf, stepBody } from './role-budget-body.js';
import { HUNTER_PERFECT, hunterOut } from './role-budget-play.js';
import { gapAtAwareness } from './role-budget-frame.js';
import { hearLoudness } from './role-budget-senses.js';
import { MAX_TICKS } from './role-budget-timeline.js';

/** The hunter and the defender sprint only with the other in view, as the oracle brains do. */
const VIEW_PLAY = Object.freeze({ ...HUNTER_PERFECT, sprint: /** @type {const} */ ('view') });
/** The standing caller holds nothing. */
const STILL = Object.freeze({ turn: 0, sprint: 0, thrust: 0 });

/**
 * @typedef {object} DefenceOptions
 * @property {number} reaction the ticks from a stimulus to the output (the model's `reactionTicks`)
 * @property {number} threshold the `heard` loudness a brain acts on
 * @property {number} side the distance of the defender from the caller, beside it
 * @property {{hear?: number, turn?: number, run?: number}} [delays] ticks added at one step of the defender
 * @property {boolean} [absent] whether there is no defender (the baseline of the kill)
 * @property {'rest' | 'cruise'} [hunterStart] the hunter's speed at tick 0 (default `cruise`: it was creeping)
 * @property {number[][]} [trace] when given, receives `[tick, hunter x, hunter y, defender x, defender y]` each tick
 * @property {number} [gap] the centre gap from the hunter to the caller at tick 0 (default the awareness gap)
 */

/**
 * @typedef {object} Defence
 * @property {number | null} killTick the tick the caller dies, null for none
 * @property {number | null} contactTick the tick the hunter first touches the caller
 * @property {number} alarmTick the tick the caller's alarm fires (0-based), -1 when it never does
 * @property {number} heardTick the tick the defender first acts on the call (-1: it never heard)
 * @property {number} startTick the tick the defender starts to move (-1: never)
 * @property {number | null} interceptTick the tick the defender first touches the hunter
 * @property {number | null} repelTick the tick the first shove lands, null for none
 * @property {number} repels the shoves landed
 * @property {number} bites the bites the hunter landed on the caller
 * @property {number} hunterEnergy the hunter's energy at the end
 * @property {boolean} faced whether the defender had the hunter in its jaws at the first touch
 */

/**
 * @param {import('./role-budget-body.js').Body} a one body
 * @param {import('./role-budget-body.js').Body} b another
 * @returns {boolean} whether their centres are closer than their sizes
 */
const touching = (a, b) => norm(b.x - a.x, b.y - a.y) < a.size + b.size;

/**
 * Lands the defender's shove on the hunter, as `tryDefenderRepel` does: the defender pays, the hunter loses energy and is
 * knocked back along the defender-to-hunter line.
 * @param {import('./role-budget-body.js').Body} d the defender
 * @param {import('./role-budget-body.js').Body} h the hunter
 * @returns {void}
 */
function shove(d, h) {
    const { repel } = d.p;
    const dist = Math.max(norm(h.x - d.x, h.y - d.y), 1e-9);
    const nx = (h.x - d.x) / dist;
    const ny = (h.y - d.y) / dist;
    d.energy = Math.max(0, d.energy - repel.cost);
    h.energy = Math.max(0, h.energy - repel.energy);
    h.vx += nx * repel.impulse;
    h.vy += ny * repel.impulse;
}

/**
 * @param {import('./role-budget-params.js').RoleParams} hunter the hunter
 * @param {import('./role-budget-params.js').RoleParams} caller the caller
 * @param {import('./role-budget-params.js').RoleParams} defender the defender
 * @param {DefenceOptions} options the options
 * @returns {{h: import('./role-budget-body.js').Body, c: import('./role-budget-body.js').Body,
 *   d: import('./role-budget-body.js').Body}} the three bodies: the hunter creeping at the caller's rear reach, the caller
 *   standing with its back to it, the defender beside the caller facing it
 */
function stage(hunter, caller, defender, options) {
    const gap = options.gap ?? gapAtAwareness(hunter, caller);
    const speed = options.hunterStart === 'rest' ? 0 : hunter.cap.cruise;
    return {
        h: createBody(hunter, { x: 0, y: 0, angle: 0, speed }),
        c: createBody(caller, { x: gap, y: 0, angle: 0 }),
        d: createBody(defender, { x: gap, y: options.side, angle: -Math.PI / 2 }),
    };
}

/**
 * @typedef {object} State the run in progress
 * @property {import('./role-budget-body.js').Body} h the hunter
 * @property {import('./role-budget-body.js').Body} c the caller
 * @property {import('./role-budget-body.js').Body} d the defender
 * @property {Defence} out the readings so far
 * @property {{bites: number, income: number, kick: number}} tally the hunter's bites
 * @property {{hunter: import('./role-budget-params.js').RoleParams, caller: import('./role-budget-params.js').RoleParams,
 *   defender: import('./role-budget-params.js').RoleParams}} p the numbers
 * @property {DefenceOptions} options the options
 * @property {{hear: number, turn: number, run: number}} delays the delays
 * @property {{sawAt: number, gate: boolean}} memo the tick the caller first saw the hunter, and the size gate
 */

/**
 * The caller sees the hunter inside its awareness gap, and its alarm fires `reaction` ticks later.
 * @param {State} s the run, updated in place
 * @param {number} tick the tick
 * @returns {void}
 */
function observe(s, tick) {
    const { h, c, out, p, options } = s;
    if (s.memo.sawAt < 0 && norm(c.x - h.x, c.y - h.y) <= gapAtAwareness(p.hunter, p.caller)) {
        s.memo.sawAt = tick;
    }
    if (out.alarmTick < 0 && s.memo.sawAt >= 0 && tick === s.memo.sawAt + options.reaction) {
        out.alarmTick = tick;
        charge(c, p.caller.call.cost);
    }
    listen(s, tick);
}

/**
 * Moves the three bodies one tick and returns what the hunter and the defender held, for the costs.
 * @param {State} s the run, updated in place
 * @param {number} tick the tick
 * @returns {{ho: import('./role-budget-body.js').Out, dout: import('./role-budget-body.js').Out, factors: number[]}} the
 *   outputs and the sprint factors the tick read
 */
function move(s, tick) {
    const { h, c, d, out, p, delays } = s;
    const ho = hunterOut(h, c, VIEW_PLAY, tick);
    const dout = defenderOut(s, tick);
    const factors = [stepBody(h, ho), stepBody(c, STILL), stepBody(d, dout)];
    const turn = p.defender.turnRate.start;
    const slow = turnCircle(p.defender.thrust.cruise, p.defender.damping, turn, p.defender.cap.cruise).speed;
    if (out.startTick >= 0 && tick - out.startTick < delays.turn && speedOf(d) > slow) {
        d.vx *= slow / speedOf(d);
        d.vy *= slow / speedOf(d);
    }
    s.options.trace?.push([tick, h.x, h.y, d.x, d.y]);
    return { ho, dout, factors };
}

/**
 * The defender bumps the caller if they overlap, and touches the hunter: they collide, and with the shove on and the hunter in its jaws the defender shoves.
 * @param {State} s the run, updated in place
 * @param {number} tick the tick
 * @returns {void}
 */
function meet(s, tick) {
    const { h, c, d, out, p, options } = s;
    if (!options.absent && touching(c, d)) {
        collide(c, d);
    }
    if (options.absent || !touching(h, d)) {
        return;
    }
    out.interceptTick ??= tick + 1;
    out.faced = out.interceptTick === tick + 1 ? inJaws(d, h) : out.faced;
    collide(h, d);
    if (p.defender.repel.energy > 0 || p.defender.repel.impulse > 0) {
        landShove(out, { d, h, tick });
    }
}

/**
 * The hunter touches the caller: they collide and, past the size gate, the hunter bites.
 * @param {State} s the run, updated in place
 * @param {number} tick the tick
 * @returns {boolean} whether the bite killed the caller
 */
function strike(s, tick) {
    const { h, c, out, p, tally } = s;
    if (!touching(h, c)) {
        return false;
    }
    out.contactTick ??= tick + 1;
    if (out.contactTick === tick + 1) {
        s.memo.gate = h.size > p.hunter.bite.sizeRatio * c.size;
    }
    collide(h, c);
    const alarmed = out.alarmTick >= 0 && tick < out.alarmTick + p.caller.call.ticks;
    return s.memo.gate && bite(h, c, tally, alarmed);
}

/**
 * Plays one defence from tick 0 until the caller dies or `MAX_TICKS` pass.
 * @param {import('./role-budget-params.js').RoleParams} hunter the hunter
 * @param {import('./role-budget-params.js').RoleParams} caller the standing caller
 * @param {import('./role-budget-params.js').RoleParams} defender the defender
 * @param {DefenceOptions} options the options
 * @returns {Defence} the run
 */
export function defenceTimeline(hunter, caller, defender, options) {
    const out = /** @type {Defence} */ ({
        killTick: null,
        contactTick: null,
        alarmTick: -1,
        heardTick: -1,
        startTick: -1,
        interceptTick: null,
        repelTick: null,
        repels: 0,
        bites: 0,
        hunterEnergy: 0,
        faced: false,
    });
    const s = /** @type {State} */ ({
        ...stage(hunter, caller, defender, options),
        out,
        tally: { bites: 0, income: 0, kick: 0 },
        p: { hunter, caller, defender },
        options,
        delays: { hear: 0, turn: 0, run: 0, ...options.delays },
        memo: { sawAt: -1, gate: false },
    });
    for (let tick = 0; tick < MAX_TICKS; tick++) {
        observe(s, tick);
        const { ho, dout, factors } = move(s, tick);
        meet(s, tick);
        if (strike(s, tick)) {
            out.killTick = tick + 1;
            break;
        }
        charge(s.h, costOf(s.h, ho, factors[0]));
        charge(s.c, costOf(s.c, STILL, factors[1]));
        charge(s.d, costOf(s.d, dout, factors[2]));
    }
    return { ...out, bites: s.tally.bites, hunterEnergy: s.h.energy };
}

/**
 * @param {Defence} out the run, updated in place
 * @param {{d: import('./role-budget-body.js').Body, h: import('./role-budget-body.js').Body, tick: number}} at the
 *   defender, the hunter and the tick
 * @returns {void}
 */
function landShove(out, { d, h, tick }) {
    if (inJaws(d, h)) {
        out.repelTick ??= tick + 1;
        out.repels += 1;
        shove(d, h);
    }
}

/**
 * The defender hears the call: at the first tick after the alarm (plus the delay) the loudness at its distance from the
 * caller is tested against the threshold; above it, it acts `reaction` ticks later. Heard late enough that the call has
 * faded, it never does.
 * @param {State} s the run, updated in place
 * @param {number} tick the tick
 * @returns {void}
 */
function listen(s, tick) {
    const { out, c, d, p, options, delays } = s;
    if (out.alarmTick < 0 || out.heardTick >= 0 || options.absent || tick !== out.alarmTick + 1 + delays.hear) {
        return;
    }
    if (hearLoudness(norm(c.x - d.x, c.y - d.y), delays.hear, p.caller) > options.threshold) {
        out.heardTick = tick;
        out.startTick = tick + options.reaction;
    }
}

/**
 * @param {State} s the run
 * @param {number} tick the tick
 * @returns {import('./role-budget-body.js').Out} what the defender holds: nothing until it moves, then the hunter's pursuit,
 *   at the grazing gait since it holds `BITE` (a non-hunter holding `BITE` moves at `grazeThrust`; the shove needs it)
 */
function defenderOut(s, tick) {
    const { out, d, h, delays } = s;
    if (out.startTick < 0 || tick < out.startTick) {
        return STILL;
    }
    const chase = hunterOut(d, h, { ...VIEW_PLAY, runAt: delays.run }, tick - out.startTick);
    return { ...chase, thrust: d.p.thrust.graze / d.p.thrust.cruise };
}
