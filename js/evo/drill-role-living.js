// The `make-a-living` drill (docs/designs/training-loop.md, T34; docs/designs/role-budget.md, Phase 4): the chase of `playLiving`
// with a genome in the hunter's seat. A prey of one of the four it can meet (`PREY_SPECS`) stands `gapAtAwareness` ahead of the
// hunter, facing away, and runs from it as the oracle evader does (it breaks across the hunter's line when it is close); the
// hunter must run it down and kill it, and the kill must pay for the chase: the trial is won when the prey is dead within
// `MAX_TICKS` and the hunter's energy at the kill is above what it started with (the bites and the gorge less the kicks, the
// costs and the strike misses: `simChase`'s `net`). The bar is the budget row `predator:living`, whose `eat` step is that net
// at the reactive tier; at the defaults it is impossible (a chase costs more than a kill returns), so the reference wins no
// trial and the drill has no passable bar there (`drill-role-validity.js` reports it). The `breed` step, the chases a life holds,
// is the budget's, not a trial's.

import { nextFloat } from '../sim/rng.js';
import { SPEC } from '../sim/specs.js';
import { evaderBrain, pursuerBrain } from './chase-oracles.js';
import { ROLE, ROLE_ARENA, ROLE_CONFIG, paramsOf, perWorld, turned } from './drill-role-staging.js';
import { heading } from './memory-probe-scenarios.js';
import { PREY_SPECS } from './role-budget-chase.js';
import { gapAtAwareness } from './role-budget-frame.js';
import { MAX_TICKS } from './role-budget-timeline.js';

/** The row the drill's bar is read from. */
export const LIVING_ROW = 'predator:living';
/** The step of the row a trial is: a kill that pays. */
export const LIVING_GOALS = Object.freeze([Object.freeze(['eat'])]);
/** The slots of the scene: the prey first, the hunter (the subject) second. */
export const LIVING_SLOT = Object.freeze({ PREY: 0, SUBJECT: 1 });

/**
 * One trial of the drill: the chase of `playLiving` turned to `angle`, the prey `prey`.
 * @param {Readonly<Record<string, any>>} config the validated config the trial runs under
 * @param {{angle: number, prey: string}} at the heading of the scene and the prey's specialisation name
 * @returns {import('./memory-probe-run.js').Plan} the trial
 */
export function livingPlan(config, { angle, prey }) {
    const [hunter, quarry] = paramsOf(config, 'predator', prey);
    const gap = gapAtAwareness(hunter, quarry);
    const preySpec = /** @type {any} */ (config.specialisations)[prey].index;
    const run = { start: NaN, net: /** @type {number | null} */ (null) };
    const flee = evaderBrain({ pursuer: LIVING_SLOT.SUBJECT, evader: LIVING_SLOT.PREY, sprint: true });
    const agents = [
        { role: ROLE.OTHER, ...turned(angle, { x: gap, y: 0 }), angle, spec: preySpec },
        { role: 'subject', ...turned(angle, { x: 0, y: 0 }), angle, spec: SPEC.PREDATOR },
    ];
    return {
        stage: { foods: [], rocks: [], agents: /** @type {any} */ (agents) },
        timing: null,
        scent: false,
        maxTicks: MAX_TICKS,
        controllers: {
            [ROLE.OTHER]: (world) => {
                run.start = Number.isNaN(run.start) ? world.energy[LIVING_SLOT.SUBJECT] : run.start;
                flee(world);
            },
        },
        trace: (won) => ({ prey, net: run.net, reason: won ? null : reasonOf(run.net) }),
        done: (world) => {
            run.net = world.alive[LIVING_SLOT.PREY] === 0 ? world.energy[LIVING_SLOT.SUBJECT] - run.start : null;
            return run.net !== null || world.alive[LIVING_SLOT.SUBJECT] === 0;
        },
        won: () => run.net !== null && run.net > 0,
    };
}

/**
 * @param {number | null} net the hunter's net energy at the kill, null when the prey lived
 * @returns {string} why the hunter lost: it did not kill within the chase, or the kill did not pay for it
 */
export function reasonOf(net) {
    return net === null ? 'no-kill' : 'did-not-pay';
}

/**
 * @returns {import('./memory-probe-run.js').Subject} the scripted hunter: it aims where the prey will be, sprints and bites
 *   (`pursuerBrain`, the pursuer of the Phase 1 chase)
 */
export function hunterReference() {
    const act = perWorld(() => pursuerBrain({ pursuer: LIVING_SLOT.SUBJECT, evader: LIVING_SLOT.PREY, sprint: true }));
    return { name: 'hunter-oracle', id: 0, spec: SPEC.PREDATOR, weights: null, act };
}

/** @type {import('./drill-staging.js').RoleDrill} */
export const MAKE_A_LIVING = {
    name: 'make-a-living',
    scene: 'A real chase',
    spec: SPEC.PREDATOR,
    needsHunter: true,
    arena: ROLE_ARENA,
    row: LIVING_ROW,
    goals: LIVING_GOALS,
    reference: hunterReference,
    plan: (rng, _view, config = ROLE_CONFIG) =>
        livingPlan(config, {
            angle: heading(rng),
            prey: PREY_SPECS[Math.min(PREY_SPECS.length - 1, Math.floor(nextFloat(rng) * PREY_SPECS.length))],
        }),
};
