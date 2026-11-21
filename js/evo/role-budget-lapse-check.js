// The cross-check of a failed chase's length (docs/designs/role-budget.md, "A hunter's living"): the formula's give-up tick of
// `role-budget-lapse.js` beside the same rule read off the scripted chase in the sim, with the energy the hunter has spent by
// then. A scene is the staged arena of `simChase`; the rule is applied to the sim's bodies each tick, so what is compared is the
// two bodies' motion (the timeline's against the sim's physics), not the rule.

import { step } from '../sim/step.js';
import { ARENA_CENTRE, stageArena } from './chase-arena.js';
import { evaderBrain, pursuerBrain } from './chase-oracles.js';
import { createLapse, lapseTicks, noteLapse } from './role-budget-lapse.js';
import { roleParams } from './role-budget-params.js';
import { viewReach } from './role-budget-senses.js';
import { MAX_TICKS, chaseTimeline } from './role-budget-timeline.js';

/**
 * Plays the scripted chase in the sim and applies the give-up rule to it each tick.
 * @param {Readonly<Record<string, any>>} config an `arenaConfig`
 * @param {{hunter: string, prey: string, distance: number}} scene the pair and the start gap (the prey ahead of the hunter, breaking)
 * @returns {{killTick: number | null, lapse: number, spent: number}} the kill tick (null for none), the ticks the chase lasted
 *   (to its lapse, or `MAX_TICKS`) and the energy the hunter spent by then
 */
export function simLapse(config, { hunter, prey, distance }) {
    const specs = /** @type {Record<string, any>} */ (config.specialisations);
    const bodies = [
        { spec: specs[hunter].index, ...ARENA_CENTRE, angle: 0 },
        { spec: specs[prey].index, x: ARENA_CENTRE.x + distance, y: ARENA_CENTRE.y, angle: 0 },
    ];
    const { world, policy } = stageArena(config, bodies);
    const hunt = pursuerBrain({ pursuer: 0, evader: 1, sprint: true });
    const flee = evaderBrain({ pursuer: 0, evader: 1, sprint: true });
    const brain = (/** @type {Record<string, any>} */ w) => {
        hunt(w);
        flee(w);
    };
    const params = roleParams(config, hunter, {}, { age: 'juvenile' });
    const sight = viewReach(params, 0) + roleParams(config, prey).size;
    const track = createLapse();
    const at = {
        h: { x: 0, y: 0, vx: 0, vy: 0 },
        p: { x: 0, y: 0 },
        tick: 0,
        maxVelocity: params.cap.cruise,
        sight,
    };
    const spent = () => world.ledgerStanding[0] + world.ledgerMove[0] + world.ledgerSprint[0] + world.ledgerBiteCost[0];
    for (let tick = 0; tick < MAX_TICKS && world.alive[0] === 1; tick++) {
        step(world, policy, { brain });
        if (world.alive[1] === 0) {
            return { killTick: tick + 1, lapse: tick + 1, spent: spent() };
        }
        Object.assign(at.h, { x: world.x[0], y: world.y[0], vx: world.vx[0], vy: world.vy[0] });
        Object.assign(at.p, { x: world.x[1], y: world.y[1] });
        at.tick = tick;
        noteLapse(track, at);
        if (track.ended > 0) {
            return { killTick: null, lapse: track.ended, spent: spent() };
        }
    }
    return { killTick: null, lapse: lapseTicks(track, MAX_TICKS), spent: spent() };
}

/**
 * The timeline of the same scene: the broken prey, the hunter from rest sprinting while the prey is in view.
 * @param {Readonly<Record<string, any>>} config an `arenaConfig`
 * @param {{hunter: string, prey: string, distance: number}} scene the same scene
 * @returns {{killTick: number | null, lapse: number, spent: number}} the formula's kill tick, the ticks its chase lasted and the
 *   energy spent by then (a rerun cut at the lapse)
 */
export function formulaLapse(config, { hunter, prey, distance }) {
    const params = roleParams(config, hunter, {}, { age: 'juvenile' });
    const options = { gap: distance, hunter: { sprint: 'view' }, prey: { sprint: 'rationed' } };
    const run = chaseTimeline(params, roleParams(config, prey), options);
    const cut =
        run.killTick === null && run.lapse > 0
            ? chaseTimeline(params, roleParams(config, prey), { ...options, maxTicks: run.lapse })
            : run;
    return {
        killTick: run.killTick,
        lapse: run.killTick === null ? run.lapse : run.ticks,
        spent: cut.hunterSpent + cut.kick,
    };
}
