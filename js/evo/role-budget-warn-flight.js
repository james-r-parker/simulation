// The warned forager's flight start (docs/designs/role-budget.md, "Phase 3 steps"): from the tick it acts on the call it turns
// from side-on to straight away and runs at the hunter's sprint, which has begun, so by the time it has turned it has gained on
// the hunter and is already flying. The two bodies play the oracles' rules (`hunterOut`, `preyOut`) on the body law of the
// chase timeline, so the state they reach is the sim's.

import { JINK_RANGE } from './chase-oracles.js';
import { createBody, speedOf, stepBody } from './role-budget-body.js';
import { norm } from './role-budget-kinematics.js';
import { HUNTER_PERFECT, hunterOut, preyOut } from './role-budget-play.js';

/** The oracle hunter sprints only with the forager in view and its store above the floor. */
const HUNTER_PLAY = Object.freeze({ ...HUNTER_PERFECT, sprint: /** @type {const} */ ('view') });

/** A forager that has not yet acted holds nothing. */
const HELD = Object.freeze({ turn: 0, sprint: 0, thrust: 0 });

/**
 * @typedef {object} Flight the forager's state when it has turned
 * @property {number} gap the centre gap from the hunter to the forager
 * @property {{speed: number, offset: number}} preyStart the forager's speed and the offset of its heading from the hunter's
 *   heading, which it lies along to a few px (the start of `maxCatchableGap`)
 */

/**
 * Plays the forager's turn: it stands facing `turn` off straight away at `gap` from a hunter that was creeping at its cruise
 * speed and sprints from tick 0, holds still for `still` ticks (a delay of the chain) and then flees as the oracle evader does,
 * `ticks` ticks in all.
 * @param {{hunter: import('./role-budget-params.js').RoleParams, forager: import('./role-budget-params.js').RoleParams}} bodies
 *   the hunter and the forager
 * @param {{gap: number, turn: number, ticks: number, still?: number, model: import('./role-budget-model.js').RoleModel}} start
 *   the gap when the forager acts, the angle it faces off straight away, the ticks until it has turned, the ticks of them it
 *   holds still and the model
 * @returns {Flight} the state at the end
 */
export function flightAfter({ hunter, forager }, { gap, turn, ticks, still = 0, model }) {
    const h = createBody(hunter, { x: 0, y: 0, angle: 0, speed: hunter.cap.cruise });
    const p = createBody(forager, { x: gap, y: 0, angle: turn });
    const sprint = model.preySprint === 'always' ? 'always' : 'rationed';
    /** @type {import('./role-budget-play.js').PreyPlay} */
    const flee = { sprint, jink: JINK_RANGE, breakAngle: model.breakAngle, awareGap: Infinity };
    for (let tick = 0; tick < ticks; tick++) {
        const ho = hunterOut(h, p, HUNTER_PLAY, tick);
        const po = tick < still ? HELD : preyOut(h, p, flee);
        stepBody(h, ho);
        stepBody(p, po);
    }
    return {
        gap: norm(p.x - h.x, p.y - h.y),
        preyStart: { speed: speedOf(p), offset: p.angle },
    };
}
