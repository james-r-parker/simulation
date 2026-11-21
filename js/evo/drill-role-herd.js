// The `clear-herd` drill (docs/designs/training-loop.md, T34; docs/designs/role-budget.md, Phase 5): the stampede of `playStampede`
// with a genome in the body's seat. A herd of one group, startled, runs at the body along the flee axis, the body facing away
// from it (the row's worst case, the herd on its rear view); the body must see it, turn for the flank and clear the herd's
// half-width before the front arrives. The trial is won when the body is not trampled in `SCENE_TICKS`. The bar is the budget row
// `<spec>:herd`, read with its `see`, `turn` and `run` steps (`survive`, the tramples the store holds, is not a win). At the
// defaults the forager and the scout are `tight`, the reproducer and the defender are impossible at `run` (they cannot clear the
// half-width in time), so for them the drill has no passable bar and the reference wins no trial. The drill covers the four specs that do
// not hunt: the predator's row is `n/a` because the herd turns from a hunter, so the scene would not be a stampede. The scene is
// mirrored (the herd on the left or the right, the body a pixel to either side of its centre line), not turned: the oracle
// clears the flank along the arena's y axis.

import { createConfig } from '../sim/config.js';
import { detCos, detSin } from '../sim/det-math.js';
import { nextFloat } from '../sim/rng.js';
import { SPEC_NAMES } from '../sim/specs.js';
import { ARENA_CENTRE } from './chase-arena.js';
import { clearerBrain } from './herd-oracles.js';
import { ROLE_ARENA, paramsOf, perWorld } from './drill-role-staging.js';
import { budgetHerd, herdNumbers } from './role-budget-herd.js';
import { MODEL_DEFAULTS } from './role-budget-model.js';
import { viewReach } from './role-budget-senses.js';

/** The specs that meet the stampede as prey: those that do not hunt. */
export const HERD_SPECS = Object.freeze(['forager', 'reproducer', 'scout', 'defender']);
/** The steps by which the drill is won: the body sees, turns and runs clear (the `survive` step is a second chance, not a win). */
export const HERD_GOALS = Object.freeze([Object.freeze(['see', 'turn', 'run'])]);
/** The ticks a trial runs: the herd covers its half-width many times over (`SCENE_TICKS` of `role-scenes-herd.js`). */
export const SCENE_TICKS = 220;
/** The energy a tick must take for it to be a trample, not the cost of the tick (`TRAMPLE_FLOOR` of `role-scenes-herd.js`). */
export const TRAMPLE_FLOOR = 5;

/**
 * The arena of the drill: the role arena with one herd and no food patches or dung, as `emptied(config, 16000, {herds: 1})` makes
 * it for the scene.
 */
/** @type {Readonly<Record<string, any>>} */
export const HERD_ARENA = Object.freeze({ ...ROLE_ARENA, herdCount: 1, herdDungZoneMax: 0, foodPatchCount: 0 });

/** The validated config of the herd arena: what a drill's plan runs under when it is given none. */
export const HERD_CONFIG = createConfig(HERD_ARENA);

/**
 * Puts the herd on a ring around its centroid, startled along the flee axis `sign` (+1 toward +x), the front animal
 * `viewReach + herdRadius` from the body on the body's rear view.
 * @param {Record<string, any>} world the staged world
 * @param {{sign: 1 | -1, seeGap: number}} at the side the herd comes from and the centre gap at which the body sees it
 * @returns {void}
 */
export function placeHerd(world, { sign, seeGap }) {
    const herd = herdNumbers(world.config);
    const cx = ARENA_CENTRE.x - sign * (seeGap + herd.ring);
    for (let animal = 0; animal < world.config.herdSize; animal++) {
        const a = (animal / world.config.herdSize) * 2 * Math.PI;
        world.herdX[animal] = cx + herd.ring * detCos(a);
        world.herdY[animal] = ARENA_CENTRE.y + herd.ring * detSin(a);
        world.herdVx[animal] = 0;
        world.herdVy[animal] = 0;
    }
    world.groupCentroidX[0] = cx;
    world.groupCentroidY[0] = ARENA_CENTRE.y;
    world.groupAlarm[0] = herd.stampede;
    world.groupFleeX[0] = sign;
    world.groupFleeY[0] = 0;
}

/**
 * @param {Readonly<Record<string, any>>} config the validated config
 * @param {string} spec the spec's name
 * @returns {number} the centre gap at which the body sees the herd: `viewReach` on its rear view plus `herdRadius`
 */
function seeGapOf(config, spec) {
    const [p] = paramsOf(config, spec);
    return viewReach(p, Math.PI) + herdNumbers(config).radius;
}

/**
 * One trial of the drill: the stampede of `playStampede` for a body of spec `spec`, the herd coming from the side `sign` (1: from
 * -x, running toward +x) and the body a pixel to the side `side` of its centre line.
 * @param {Readonly<Record<string, any>>} config the validated config the trial runs under
 * @param {{spec: string, sign: 1 | -1, side: 1 | -1}} at the spec, the herd's side and the body's side
 * @returns {import('./memory-probe-run.js').Plan} the trial
 */
export function herdPlan(config, { spec, sign, side }) {
    const seeGap = seeGapOf(config, spec);
    const tally = { before: NaN, tramples: 0, first: /** @type {number | null} */ (null) };
    const body = {
        role: 'subject',
        x: ARENA_CENTRE.x,
        y: ARENA_CENTRE.y + side,
        angle: sign === 1 ? 0 : Math.PI,
        spec: /** @type {any} */ (config.specialisations)[spec].index,
    };
    return {
        stage: { foods: [], rocks: [], agents: [body] },
        timing: null,
        scent: false,
        maxTicks: SCENE_TICKS,
        prepare: (world) => {
            placeHerd(world, { sign, seeGap });
            tally.before = world.energy[0];
        },
        trace: (won) => ({ tramples: tally.tramples, trampleTick: tally.first, reason: won ? null : 'trampled' }),
        done: (world) => {
            const taken = tally.before - world.energy[0];
            tally.before = world.energy[0];
            if (taken > TRAMPLE_FLOOR || world.alive[0] === 0) {
                tally.tramples += 1;
                tally.first ??= world.tick + 1;
            }
            return world.alive[0] === 0;
        },
        won: () => tally.tramples === 0,
    };
}

/**
 * @param {string} spec the spec's name
 * @returns {() => import('./memory-probe-run.js').Subject} the scripted body of that spec: it stands until the herd is on a ray,
 *   then, the model's reaction ticks later, turns for the flank and runs at the gait the row says clears fastest
 */
function clearerOf(spec) {
    return () => {
        const act = perWorld((world) => {
            const [p] = paramsOf(world.config, spec);
            const { clear } = budgetHerd(world.config, p, MODEL_DEFAULTS).worst;
            return clearerBrain({
                slot: 0,
                seeGap: seeGapOf(world.config, spec) + 1,
                reaction: MODEL_DEFAULTS.reactionTicks,
                sprint: clear.sprint < clear.cruise,
            });
        });
        return { name: `clearer-oracle-${spec}`, id: 0, spec: SPEC_NAMES.indexOf(spec), weights: null, act };
    };
}

/**
 * @param {string} spec the spec's name, one of `HERD_SPECS`
 * @returns {import('./drill-staging.js').RoleDrill} the drill for a body of that spec: `clear-herd` for the forager, the
 *   default seat, `clear-herd-<spec>` for the others
 */
export function clearHerdOf(spec) {
    const index = SPEC_NAMES.indexOf(spec);
    return {
        name: spec === 'forager' ? 'clear-herd' : `clear-herd-${spec}`,
        scene: 'A real chase',
        spec: index,
        needsHunter: false,
        arena: HERD_ARENA,
        row: `${spec}:herd`,
        goals: HERD_GOALS,
        reference: clearerOf(spec),
        plan: (rng, _view, config = HERD_CONFIG) =>
            herdPlan(config, {
                spec,
                sign: nextFloat(rng) < 0.5 ? -1 : 1,
                side: nextFloat(rng) < 0.5 ? -1 : 1,
            }),
    };
}

/** The drill for each of the four specs, by spec name; `clear-herd` is the forager's. */
export const CLEAR_HERD_BY_SPEC = Object.freeze(Object.fromEntries(HERD_SPECS.map((s) => [s, clearHerdOf(s)])));

/** The drill that stands in `ROLE_DRILLS`: the forager's. */
export const CLEAR_HERD = CLEAR_HERD_BY_SPEC.forager;
